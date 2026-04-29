# System Architecture

## Overview

Banner Saga Factions Custom Server is a Node.js/Express.js HTTP server that emulates the official Banner Saga Factions game servers. It handles matchmaking, battle lifecycle management, and real-time synchronization between 2-player matches.

+## Overview of Client <-> Server Data Flow
 
+The client communicates with the server over HTTP(S). All request URLs end with the clients session key with the exception of the login and steam overlay requests. When the client has data to send to the server, it makes a POST request to a given route, in most cases the server responds with status 200 and no data however there are some exceptions, such as posting to the leaderboards route. To receive data which is not returned after making a POST request the client makes GET requests to the server every 2 seconds. If the server has new data for the client it is returned in the response otherwise the server responds with status 200 and no data. All data returned from the server is JSON formatted. All data sent to the server is JSON formatted with the exception of the location update and chat message send requests, these are plaintext strings.

### Original Stoic server stack (for reference)

The official server that ran until the game's shutdown used a different stack:

| Layer | Original (Stoic) | This implementation |
|---|---|---|
| Language | Java | TypeScript / Node.js |
| OS | Linux | Cross-platform (Docker) |
| Database | MySQL | MySQL (same) |
| Real-time messaging | **RabbitMQ** | HTTP long-polling |

RabbitMQ was used for pub/sub event delivery (queue updates, battle events). The current HTTP long-polling approach (`GET /game/:session_key`, 10s timeout) is a functional substitute for a small player base. If scaling beyond a few dozen concurrent players becomes a goal, RabbitMQ or a similar message broker is the reference architecture.

### Client framework

The game client is built on **[Starling](https://gamua.com/starling/)**, an ActionScript game engine that runs on Adobe AIR's Stage3D layer. When reading client code via JPEXS, Starling's API docs help interpret rendering and animation code.

### Key Design Decisions

**Why HTTP long-polling instead of WebSockets?**
The game client is a Flash/AIR binary compiled to speak HTTP — adding WebSocket support would require ActionScript source changes. Long-polling (`GET /game/:session_key`, 10s timeout) is a drop-in substitute that requires no client changes and handles BSF's player scale (dozens of concurrent users) without issue. RabbitMQ is the reference architecture for scaling beyond that (see the original Stoic stack above).

**Why 32-bit `account_id` instead of the full 64-bit Steam ID?**
The game client constructs entity ID strings as `{account_id}+{index}+{unit_id}` and both clients must produce identical strings to agree on the DJB state hash. The original BSF server used small database account IDs. When the custom server passed full 64-bit Steam IDs, each client computed different entity strings for the same player — hash diverged at turn 0 and the game showed a desync error. The fix: `account_id = steamId >= 76561197960265728 ? steamId - 76561197960265728 : steamId`. The full Steam ID is still stored in the DB; `account_id` is used only in battle messages and `aliveUnits` keys.

**Why in-memory sessions and battles instead of a persistent store?**
Simplicity for a small player base with a single server process. The trade-off: server restart clears all active sessions and in-flight battles. Redis is the documented future path for horizontal scaling (see Future Improvements below). The complexity is not justified at current scale.

```
┌─────────────────────────────────────────────────────────────┐
│              Game Client (Flash)                            │
│  Sends HTTP requests, receives data via long-polling        │
└────────────────────┬────────────────────────────────────────┘
                     │
                 HTTP/JSON
                     │
     ┌───────────────┴───────────────┐
     │                               │
┌────▼─────────────────────┐  ┌─────▼──────────────────────┐
│   Express.js HTTP Server │  │  Session Manager (Memory)  │
│   Port: 8082             │  │  Stores active sessions    │
│                          │  │  Links to users & battles  │
│ Routes:                  │  └────────────┬───────────────┘
│ • /auth/login            │               │ mysql2
│ • /vs/start (queue)      │  ┌────────────▼───────────────┐
│ • /game/* (polling)      │  │  MySQL Database            │
│ • /battle/* (actions)    │  │  • accounts table          │
│ • /chat/*                │  │  • battles table           │
└────────────────────┬─────┘  └──────┬─────────────────────┘
                     │               │
                     │        ┌──────▼──────────────────────┐
                     │        │  Battle Manager (Memory)    │
                     │        │  Stores active battles      │
                     │        │  Tracks unit positions      │
                     │        │  Calculates winner          │
                     │        └─────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼─────────┐      ┌───────▼──────┐
   │  Queue (Array)│      │  Battle (Array)│
   │  ∟ QueueItems │      │  ∟ Battles    │
   │    [id,type]  │      │  ∟ Turns      │
   └──────────────┘      │  ∟ aliveUnits  │
                         └───────────────┘
```

## Component Architecture

### 1. Authentication Service (`src/services/auth/`)

**Responsibility**: User login, session creation, token validation

**Files**:
- `auth.ts` - Session class, session handler
- `discord.ts` - Discord OAuth integration

**Key Classes**:
```typescript
class Session {
  user_id: number
  session_key: string         // Random 16-hex token
  display_name: string
  battle_id?: string
  match_handle?: number       // Client-supplied queue handle (used for cancel)
  accountData: AccountRow | null  // Populated after login; in-memory truth for party/roster
  pollingActive: boolean      // Guards concurrent /game polls — returns 429 if true
  data: any[]                 // Buffer for outgoing messages
  pushData(...data)           // Appends to data[], emits 'data' to flush waiting poll
}

const sessionHandler = {
  addSession(user_id)
  getSession(key, value)
  removeSession(session_key)
  getSessions()
}
```

### 2. Queue Service (`src/services/queue.ts`)

**Responsibility**: Player queueing, matchmaking, game type selection

**Algorithm**: First-come-first-served within power level brackets

**Data Flow**:
```
Player calls: POST /vs/start/{session_key}
  ↓
QueueRouter adds to gameQueue array
  ↓
matchmaking() runs:
  - Find opponent with same power & type
  - Create Battle instance
  - Remove both from queue
  - Notify players
```

**Key Types**:
```typescript
type QueueItem = {
  account_id: number
  type: GameModes    // "QUICK" | "RANKED" | "TOURNEY"
  power: number      // sum of (RANK-1) across party units
  session_key: string  // ties entry to a specific session; stale if player re-logs in
  queuedAt: Date     // for 5-minute idle timeout
}
```

**Reliability:** Entries are evicted after 5 minutes via `setInterval`. On re-login or logout, `dequeuePlayer(session_key)` is called before the session is removed, keeping the queue clean. Matchmaking looks up the opponent by `session_key` — if the session is gone, the stale entry is removed and matching fails gracefully.

### 3. Battle Service (`src/services/battle/`)

**Responsibility**: Battle lifecycle, unit management, action processing

**Files**:
- `Battle.ts` - Main battle class, endpoints
- `BattlePartyData.ts` - Party data type
- `BattleTurnData.ts` - Data structures for all message types

**Battle Lifecycle**:
```
1. Constructor(players, mode, power)
   ↓
   Create BattleCreateData (with both parties embedded)
   Create aliveUnits tracking
   Push data to both sessions
   
2. POST /ready/{session_key}
   → Player clicked "Ready"
   → Send BattleReadyData to opponent
   
3. POST /deploy/{session_key}
   → Player positioned units
   → Send BattleDeployData to opponent
   
4. POST /sync/{session_key}
   → Turn sync (hash validation)
   → Both players send/receive sync data
   
5. POST /move/{session_key}
   → Unit movement
   → Send BattleMoveData to opponent
   
6. POST /action/{session_key}
   → Unit action (attack, ability)
   → Send BattleActionData to opponent
   
7. POST /killed/{session_key}
   → Unit dies
   → Remove from aliveUnits
   → If all dead: trigger endgame()
   
8. POST /battle/exit/{session_key}
   → Player exits
   → Remove from battle.parties
   → Clean up battle if empty
```

**Key Properties**:
```typescript
class Battle {
  battle_id: string     // Unique identifier (20-char hex)
  parties: {}           // Keyed by session_key; BattlePartyData with .user + .defs[]
  type: GameModes
  turns: []             // Array of turn actions
  aliveUnits: {}        // Track living units by string(user_id)
  winner: number | null // Set to killerparty user_id when last unit dies
  startedAt: Date       // For DB persistence and duration tracking
}
```

### 4. Game Data Service (`src/services/game.ts`)

**Responsibility**: Long-polling data delivery

**Pattern**: HTTP long-poll (10-second timeout)

```
Client: GET /services/game/{session_key}
Server: 
  if (session.data.length > 0) {
    return session.data immediately
    clear buffer
  } else {
    wait up to 10 seconds for 'data' event
    if timeout: return empty []
  }
```

### 5. Chat Service (`src/services/chat.ts`)

**Responsibility**: In-battle and global messaging

**Routing**:
- Global chat: All players receive message
- Battle chat: Only battle participants receive

---

## Data Flow: Full Battle Cycle

```
┌──────────────────────────────────────────────────────────────┐
│ LOGIN PHASE                                                  │
└──────────────────────────────────────────────────────────────┘

Player 1              Server                  Player 2
   │                    │                        │
   │─POST /auth/login─→ │                        │
   │                    ├─Create Session         │
   │                    ├─upsertAccount() → MySQL (accounts)
   │                    ├─Load accountData (roster/party from DB)
   │  ←─{session_key}── │                        │
   │                    │                        │
   │                    │ ←─POST /auth/login─────│
   │                    ├─Create Session         │
   │                    ├─upsertAccount() → MySQL (accounts)
   │                    ├─Load accountData (roster/party from DB)
   │                    ├─{session_key}────────→│


┌──────────────────────────────────────────────────────────────┐
│ QUEUE & MATCHMAKING PHASE                                   │
└──────────────────────────────────────────────────────────────┘

   │─POST /vs/start───→ │                        │
   │                    ├─Add to gameQueue[]     │
   │                    ├─matchmaking()          │
   │                    │  (finds match)         │
   │                    │                        │
   │                    │ ←─POST /vs/start───────│
   │                    ├─Add to gameQueue[]     │
   │                    ├─matchmaking()
   │                    │  (finds Player 1!)
   │                    ├─new Battle([...])
   │                    ├─Remove both from queue
   │                    │
   │←─GET /game/*───────├─Push BattleCreateData
   │                    │
   │                    │ ─GET /game/*───────────→
   │                    ├─Push BattleCreateData


┌──────────────────────────────────────────────────────────────┐
│ BATTLE PHASE                                                 │
└──────────────────────────────────────────────────────────────┘

(Data delivered via /game long-polling)

   │─POST /battle/ready→│                        │
   │                    ├─Send BattleReadyData to opp
   │                    │ ────────────────────────→
   │
   │                    ←─POST /battle/ready─────│
   │ ←─GET /game────────├─Return BattleReadyData
   │

   │─POST /battle/deploy→│ (unit positions)      │
   │                    ├─Send BattleDeployData
   │                    │ ────────────────────────→
   │
   │                    ←─POST /battle/deploy────│
   │ ←─GET /game────────├─Return BattleDeployData
   │

(Turn by turn)

   │─POST /battle/sync→ │ (turn 0)              │
   │                    ├─battle.turns[0] = [...]
   │                    ├─Send to opponent
   │                    │ ────────────────────────→
   │
   │                    ←─POST /battle/move─────│
   │ ←─GET /game────────├─Return BattleMoveData
   │

   │─POST /battle/move→ │                        │
   │                    ├─Update unit tiles
   │                    ├─Send BattleMoveData
   │                    │ ────────────────────────→
   │
   │─POST /battle/action→│ (attack, ability)    │
   │                    ├─Validate action
   │                    ├─Send BattleActionData
   │                    │ ────────────────────────→
   │

(If unit dies)

   │─POST /battle/killed→│                       │
   │                    ├─Remove from aliveUnits
   │                    ├─If last unit: battle.winner = killerparty
   │                    │  → endgame() [async, fire-and-forget]
   │                    │    - compute kills from aliveUnits deltas
   │                    │    - winnerRenown = 20 + kills × 3
   │                    │    - loserRenown = kills × 3
   │                    │    - Promise.all: addRenown × 2, saveBattleResult → MySQL
   │                    │    - push BattleFinishedData + RenownMessage to both sessions


┌──────────────────────────────────────────────────────────────┐
│ ENDGAME PHASE                                                │
└──────────────────────────────────────────────────────────────┘

   │─POST /battle/exit→ │                        │
   │                    ├─Delete from battle.parties
   │                    ├─If empty: delete battle
   │                    │ ────────────────────────→
   │ ←─{success}────────┤
   │
   │ (Return to menu)   │                        │
   │                    │  (Return to menu)
```

---

## In-Memory Data Structures

### Sessions
```typescript
const sessions: { [key: string]: Session } = {}

// Example:
sessions["a1b2c3d4e5f6g7h8"] = {
  user_id: 123456,
  session_key: "a1b2c3d4e5f6g7h8",
  display_name: "test",
  battle_id: "1a2b3c4d5e6f",
  data: [BattleCreateData, ...],
  pushData(...)
}
```

### Battles
```typescript
const battles: { [id: string]: Battle } = {}

// Example:
battles["1a2b3c4d5e6f"] = {
  battle_id: "1a2b3c4d5e6f",
  parties: {
    "a1b2c3d4": BattlePartyData {...},
    "x9y8z7w6": BattlePartyData {...}
  },
  turns: [
    [BattleSyncData, BattleMoveData, BattleActionData, ...],
    [BattleSyncData, ...]
  ],
  aliveUnits: {
    123456: ["warrior_1", "archer_2", ...],
    293850: ["warrior_exp_0", ...]
  },
  winner: 123456
}
```

### Queue
```typescript
const gameQueue: QueueItem[] = []

// Example:
gameQueue = [
  { account_id: 123456, type: "QUICK", power: 5 },
  { account_id: 293850, type: "QUICK", power: 5 }
]
```

---

## Request/Response Format

### Long-Polling Pattern
```
GET /services/game/{session_key}
← [BattleCreateData, BattleDeployData, ...]

POST /services/battle/move/{session_key}
  body: { battle_id, turn, entity, tiles, ... }
← 200 OK

POST /services/chat/{room}/{session_key}
  body: "message text"
← 200 OK
```

### Reliable Message Pattern
```json
{
  "class": "tbs.srv.battle.data.client.BattleActionData",
  "reliable_msg_id": "1a2b3c_action_123456",
  "reliable_msg_target": null,
  "timestamp": 1681234567890,
  "user_id": 123456,
  "battle_id": "1a2b3c",
  ...action-specific-fields
}
```

---

## Future Improvements

- [ ] Replace in-memory sessions with Redis (enables horizontal scaling)
- [ ] Rate limiting on endpoints
- [ ] Health check endpoint
- [ ] Ladder / ELO ranking system
- [ ] Session cleanup for idle sessions
