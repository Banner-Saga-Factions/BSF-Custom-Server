# System Architecture

## Overview

Banner Saga Factions Custom Server is a Node.js/Express.js HTTP server that emulates the official Banner Saga Factions game servers. It handles matchmaking, battle lifecycle management, and real-time synchronization between 2-player matches.

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
│ Routes:                  │  └────────────────────────────┘
│ • /auth/login            │
│ • /vs/start (queue)      │  ┌──────────────────────────┐
│ • /game/* (polling)      │  │  Battle Manager (Memory) │
│ • /battle/* (actions)    │  │  Stores active battles   │
│ • /chat/*                │  │  Tracks unit positions   │
└────────────────────┬─────┘  │  Calculates winner       │
                     │        └──────────────────────────┘
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
- `userRepository.ts` - User queries (TODO: add DB)

**Key Classes**:
```typescript
class Session {
  user_id: number
  session_key: string  // Random 16-hex token
  display_name: string
  battle_id?: string
  data: any[]  // Buffer for outgoing messages
  pushData(...data)  // Add to buffer
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
  type: GameModes  // "QUICK" | "RANKED" | "TOURNEY"
  power: number  // 1-10 based on party
}
```

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
  battle_id: string  // Unique identifier
  parties: {}  // Keyed by session_key
  type: GameModes
  turns: []  // Array of turn actions
  aliveUnits: {}  // Track living units by user_id
  winner: number | null
}
```

### 4. Game Data Service (`src/services/game.ts`)

**Responsibility**: Long-polling data delivery

**Pattern**: HTTP long-poll (20-second timeout)

```
Client: GET /services/game/{session_key}
Server: 
  if (session.data.length > 0) {
    return session.data immediately
    clear buffer
  } else {
    wait up to 20 seconds for 'data' event
    if timeout: return empty
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
   │                    ├─Load from data/acc.json
   │  ←─{session_key}── │                        │
   │                    │                        │
   │                    │ ←─POST /auth/login─────│
   │                    ├─Create Session        │
   │                    ├─Load from data/acc.json
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
   │                    ├─If last unit: winner = opponent_id
   │                    │  → endgame()


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
var sessions: { [key: string]: Session } = {}

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
var battles: { [id: string]: Battle } = {}

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
var gameQueue: QueueItem[] = []

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

## TODO: Future Improvements

- [ ] Replace in-memory with PostgreSQL
- [ ] Replace sessions with Redis
- [ ] Add queue timeout (5-min auto-dequeue)
- [ ] Implement proper turn-based locking
- [ ] Add input validation middleware
- [ ] Add comprehensive logging
- [ ] Add error handling for disconnects
- [ ] Rate limiting on endpoints
- [ ] Health check endpoint
- [ ] Metrics collection (match duration, player count, etc.)
