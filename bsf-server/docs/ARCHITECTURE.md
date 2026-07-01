# System Architecture

## Overview

Banner Saga Factions Custom Server is a Node.js/Express HTTP server that emulates the official Banner Saga Factions game servers. It handles authentication, matchmaking, battle lifecycle management, and real-time synchronization between 2-player matches.

The historical Stoic stack (Java + MySQL + RabbitMQ) is captured in [HISTORY.md](HISTORY.md) — this document describes the current implementation only.

## Overview of Client ↔ Server Data Flow

The client communicates with the server over HTTP(S). All request URLs end with the client's session key with the exception of the login route (`/services/auth/login/11`) and the Steam-overlay no-op (`/services/session/steam/overlay/*`). When the client has data to send to the server, it makes a `POST` request to a given route; in most cases the server responds with `200` and no body, with a few exceptions (e.g. `POST /services/game/leaderboards`). To receive data which is not returned synchronously, the client issues `GET /services/game/{session_key}` every ~2 seconds; the server holds the connection up to 5 seconds and returns a JSON array of pending messages, or `200` with no body on timeout. All payloads are JSON except `POST /services/game/location` and `POST /services/chat/{room}`, which are plaintext.

## Endpoint Transport Map

Every `/services/*` route is one of three transport patterns. "Long-poll target" means the route does not return data directly — instead it pushes via `session.pushData()`, and the client receives it on its next `GET /services/game/{session_key}`.

| Route | Method | Body | Direct response | Long-poll target | Notes |
|---|---|---|---|---|---|
| `/services/auth/login/11` | POST | JSON | `{session_key, user_id, build_number, display_name, vbb_name}` | — | The literal `"11"` is the auth-bypass sentinel for login. |
| `/services/auth/logout/{key}` | POST | JSON | `200 OK` | — | Removes session, dequeues player. |
| `/services/account/info/{key}` | GET | — | `AccountInfoData` JSON | — | Reads from `session.accountData`. |
| `/services/account/party/update/{key}` | POST | JSON | `200 OK` | — | Mutates `accountData`, fire-and-forget `saveParty()`. |
| `/services/account/roster/update/{key}` | POST | JSON | `200 OK` | — | Mutates `accountData`, fire-and-forget `saveRoster()`. |
| `/services/game/{key}` | GET | — | `[...messages]` or `200` empty | **(this is the long-poll itself)** | 5s timeout. `pollingActive` guards concurrent polls (`429`). |
| `/services/game/leaderboards/{key}` | POST | JSON | `LeaderboardsData` JSON | — | Served from static `data/lboard.json`. |
| `/services/game/location/{key}` | POST | plaintext | `200 OK` | — | No-op (location string discarded). |
| `/services/vs/start/{key}` | POST | JSON | `[ServerStatusData]` | `BattleCreateData` (on match) | Adds to `gameQueue`; `matchmaking()` runs synchronously. |
| `/services/vs/cancel/{key}` | POST | JSON | `200 OK` | — | `dequeuePlayer(session_key)`. |
| `/services/battle/ready/{key}` | POST | JSON | `200 OK` | `BattleReadyData` → opponent | |
| `/services/battle/deploy/{key}` | POST | JSON | `200 OK` | `BattleDeployData` → opponent | |
| `/services/battle/sync/{key}` | POST | JSON | `200 OK` | `BattleSyncData` → opponent | DJB hash validation between turns. |
| `/services/battle/query/{key}` | POST | JSON | `200 OK` | (replays `turns[turn]` if present) | |
| `/services/battle/move/{key}` | POST | JSON | `200 OK` | `BattleMoveData` → opponent | |
| `/services/battle/action/{key}` | POST | JSON | `200 OK` | `BattleActionData` → opponent | |
| `/services/battle/killed/{key}` | POST | JSON | `200 OK` | `BattleKilledData` → opponent; `BattleFinishedData` + `RenownMessage` → both (on last kill) | Triggers `endgame()` when `aliveUnits` empties. |
| `/services/battle/surrender/{key}` | POST | JSON | `200 OK` | `BattleSurrenderData` → opponent; `BattleFinishedData` + `RenownMessage` → both | Calls shared `finalizeSurrender()` + `endgame()`. Allowed when opponent is gone. Body `{battle_id, turn}`; `turn` ignored server-side. |
| `/services/battle/exit/{key}` | POST | JSON | `{status:"success", battle_id}` | (no broadcast on its own; reuses `finalizeSurrender()` if battle still live) | Allowed when opponent is gone. Shares the surrender helper with `/battle/surrender`. |
| `/services/chat/{room}/{key}` | POST | plaintext | `200 OK` | `ChatMessage` → room members | Global or battle-scoped depending on `{room}`. |
| `/services/roster/*/{key}` | POST | JSON | `200 OK` | — | Roster CRUD against `session.accountData`. Includes `/unit/stats/reset` (factory-default stats restore, no renown refund). |
| `/services/lobby/*/{key}` | POST | JSON / plaintext int | `200 OK` | — | Stateless 200 stubs covering `LobbyTxn` / `LobbyOptionsTxn` / `LobbyInviteTxn`. Real lobby state pending — see [serverEndpoints.md → Lobby Endpoints](serverEndpoints.md#lobby-endpoints). |
| `/services/download/*` | GET | — | binary / 200 | — | Static client-asset downloads. |
| `/login/discord/oauth-start` | GET | — | 302 redirect | — | Discord OAuth begin. |
| `/login/discord/oauth-callback` | GET | — | 302 redirect | — | Returns to client after Discord auth. |
| `/login/discord/session` | POST | — | `{session_key, user_id, …}` JSON (`401`/`500` on error) | — | Exchanges the Discord JWT (sent as `Authorization: Bearer`) for a session_key. The `501` seen elsewhere is the middleware fallthrough for a raw JWT sent to a game route before exchange. |
| `/health` | GET | — | `{status:"ok"}` JSON | — | Liveness probe. No auth, no session. |
| `/debug/party-limit` | GET | — | JSON | — | **Dev only — gated by `NODE_ENV !== "production"`.** |

A single middleware in `src/index.ts` extracts the session key from the **last URL path segment** and validates it against the in-memory `sessions` map before any `/services/*` handler runs. The Discord, `/health`, and `/debug/*` routes bypass this middleware entirely.

The original Stoic stack (Java / MySQL / RabbitMQ) is documented in [HISTORY.md](HISTORY.md).

### Client framework

The game client is built on **[Starling](https://gamua.com/starling/)**, an ActionScript game engine that runs on Adobe AIR's Stage3D layer. When reading client code via JPEXS, Starling's API docs help interpret rendering and animation code.

### Key Design Decisions

**Why HTTP long-polling instead of WebSockets?**
The game client is a Flash/AIR binary compiled to speak HTTP — adding WebSocket support would require ActionScript source changes. Long-polling (`GET /services/game/:session_key`, 5s timeout) is a drop-in substitute that requires no client changes and handles BSF's player scale (dozens of concurrent users) without issue. The original Stoic server used RabbitMQ for the same purpose; see [HISTORY.md](HISTORY.md).

**MQTT is installed but unused.**
`async-mqtt@^2.6.3` is in `package.json` `dependencies` because earlier prototypes intended an MQTT broker as a faster substitute for the 2-second client polling cadence. As of this branch, **no file under `src/services/*.ts` imports `async-mqtt`** — the package ships in the bundle but contributes zero runtime behavior. Do not add MQTT use without an issue and design discussion first.

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
│   Express HTTP Server    │  │  Session Manager (Memory)  │
│   Port: 8082             │  │  Stores active sessions    │
│                          │  │  30-min idle eviction      │
│ Routes:                  │  └────────────┬───────────────┘
│ • /auth/login            │               │ node:sqlite
│ • /vs/start (queue)      │  ┌────────────▼───────────────┐
│ • /game/* (polling)      │  │  SQLite (DatabaseSync)     │
│ • /battle/* (actions)    │  │  WAL mode                  │
│ • /chat/*                │  │  ./data/bsf.db (default)   │
│ • /health                │  │  • accounts table          │
│ • /debug/* (dev only)    │  │  • battles table           │
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
  winner: number | null // Server-derived: the side still standing (NOT client killerparty, #19)
  startedAt: Date       // For DB persistence and duration tracking
}
```

### 4. Game Data Service (`src/services/game.ts`)

**Responsibility**: Long-polling data delivery

**Pattern**: HTTP long-poll (5-second timeout)

```
Client: GET /services/game/{session_key}
Server: 
  if (session.data.length > 0) {
    return session.data immediately
    clear buffer
  } else {
    wait up to 5 seconds for 'data' event
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

> What the server enforces vs. defers during a battle (it runs no combat simulation): [battle-simulation.md](battle-simulation.md).

```
┌──────────────────────────────────────────────────────────────┐
│ LOGIN PHASE                                                  │
└──────────────────────────────────────────────────────────────┘

Player 1              Server                  Player 2
   │                    │                        │
   │─POST /auth/login─→ │                        │
   │                    ├─Create Session         │
   │                    ├─upsertAccount() → SQLite (accounts)
   │                    ├─Load accountData (roster/party from DB)
   │  ←─{session_key}── │                        │
   │                    │                        │
   │                    │ ←─POST /auth/login─────│
   │                    ├─Create Session         │
   │                    ├─upsertAccount() → SQLite (accounts)
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
   │                    ├─If last unit: battle.winner = side still standing (server-derived, #19)
   │                    │  → endgame() [async, fire-and-forget]
   │                    │    - compute kills from aliveUnits deltas
   │                    │    - new Elo via calculateNewElo (ranking.ts)
   │                    │    - renown via computeRenownAwards (WIN/KILLS/
   │                    │      UNDERDOG/EXPERT/STREAK — see renownAwards.ts)
   │                    │    - Promise.all: addRenown × 2, ranking rows, saveBattle → SQLite
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

> HTTP status codes the server emits and how the client reacts: [error-handling.md](error-handling.md). The threat model and enforced security boundaries: [security.md](security.md).

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

## Database Layer

The server uses Node's built-in `node:sqlite` module (`DatabaseSync` from `src/db/connection.ts`). No npm package, no native binaries, no separate driver install.

> Per-table columns + ER diagram: [database-schema.md](database-schema.md). How to change the schema safely: [database-migrations.md](database-migrations.md).

| Property | Value |
|---|---|
| Driver | `node:sqlite` (`DatabaseSync`) — Node `>=23.4` built-in |
| Default path | `./data/bsf.db` (overridable via `DB_PATH` env var) |
| Accepted forms | `*.db`, `*.sqlite`, or `:memory:` (used by `yarn test:db`) |
| Journal mode | **WAL** — enabled at startup. On ext4 (the GCP persistent-disk default), WAL works. A `WAL mode not active` log line means the underlying filesystem doesn't support it. |
| Schema init | `CREATE TABLE IF NOT EXISTS` runs on every startup from inline DDL in `connection.ts`. `src/db/schema.sql` is a documentation copy. |
| Files | `connection.ts` (driver + helpers), `account.ts` (`upsertAccount`, `addRenown`, `saveParty`, `saveRoster`), `battles.ts` (`saveBattle`) |

**Single-instance only.** In-memory sessions, queue, and battle state cannot be shared across processes. Do not run more than one app container against the same `bsf.db` — WAL handles multi-reader/single-writer fine, but the session state would diverge.

## Health & Debug Endpoints

Three non-`/services/*` HTTP routes are mounted directly on the Express app and bypass the session-key middleware:

| Route | Auth | Available in production? | Purpose |
|---|---|---|---|
| `GET /health` | none | yes | Liveness probe — returns `{status:"ok"}`. Suitable for Caddy / GCP / Docker healthchecks. |
| `GET /debug/party-limit` | none | **no** — gated by `NODE_ENV !== "production"` | Returns the configured party-size cap. |

The `/debug/*` gate is `app.ts` checking `process.env.NODE_ENV !== "production"` before mounting the router. Production deployments should always set `NODE_ENV=production` (the Dockerfile does this).

---

## Future Improvements

- [ ] Replace in-memory sessions with Redis (enables horizontal scaling)
- [ ] Rate limiting on `/services/vs/start`
- [ ] Ranked-**ladder** presentation (seasons/tiers) — core Elo rating, RANKED/TOURNEY queues, and live leaderboards already ship
- [ ] Decide whether to use MQTT (currently installed-but-unused) or remove `async-mqtt` from `dependencies`

---

*Last updated: 2026-05-05*
