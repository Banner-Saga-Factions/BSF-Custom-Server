# System Architecture

## Overview

Banner Saga Factions Custom Server is a Node.js/Express HTTP server that emulates the official Banner Saga Factions game servers. It handles authentication, matchmaking, battle lifecycle management, and real-time synchronization between 2-player matches.

The historical Stoic stack (Java + MySQL + RabbitMQ) is captured in [HISTORY.md](HISTORY.md) — this document describes the current implementation only.

> **The other half of the system is documented too.** This file covers the server. The game program it talks to has its own suite — start at `bsf-client/docs/client-overview.md` ([local](../../bsf-client/docs/client-overview.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/client-overview.md)), which explains the whole client in one read. Its direct counterpart to this file is `bsf-client/docs/architecture.md` ([local](../../bsf-client/docs/architecture.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/architecture.md)). Worth a look before assuming a behaviour is ours: a good deal of what looks like server logic is decided in the client.

## Overview of Client ↔ Server Data Flow

The client communicates with the server over HTTP(S). The client appends its session key immediately after the route group — which puts it at the **end** of almost every URL, the exceptions being the login route (`/services/auth/login/11`), the Steam-overlay no-op (`/services/session/steam/overlay/*`), and routes that add further path parts *after* the key (`/services/roster/unit/variation/{key}/{unit_id}/{variation}/{lobby_id}`, whose exact shape the gate matches so it reads the key from the right place — #188). When the client has data to send to the server, it makes a `POST` request to a given route; in most cases the server responds with `200` and no body, with a few exceptions (e.g. `POST /services/game/leaderboards`). To receive data which is not returned synchronously, the client issues `GET /services/game/{session_key}`; the server holds the connection up to 5 seconds and returns a JSON array of pending messages, or an **empty JSON array** on timeout. The client then **waits a fixed gap before asking again — 3 seconds normally, 1 second during a battle** — so a message pushed while a poll is already open is delivered at once, while one pushed during the gap waits up to that long. The gap never grows: the client does not back off after an error. All payloads are JSON except `POST /services/game/location` and `POST /services/chat/{room}`, which are plaintext.

> **Two client behaviours to know before changing any route.** The client **re-sends a failed request by itself** — forever, with no attempt limit — whenever the response code is `0`, `404`, or `500`-and-above, so a permanent "no" must be answered with `400`/`403`/`409` instead. And it **retries requests it has already sent**, so a route that mutates state has to survive being replayed. Both are covered, with the full list of what the client requires of us, in [`client-contract.md`](./client-contract.md).

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
| `/services/game/location/{key}` | POST | plaintext | `200 OK` | `GameLocationData` → every other player | Remembers which room the player walked into and shows it beside their name on other players' friends screens (#91). Unrecognised room names are dropped. |
| `/services/vs/start/{key}` | POST | JSON | `[ServerStatusData]` | `BattleCreateData` (on match) | Adds to `gameQueue`; tries for a pair at once, then leaves the entry to the background pass. Accepts a friend match naming its opponent and map (#205). |
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
| `/services/lobby/*/{key}` | POST | **`text/plain`** — JSON or a bare integer | `200 OK`, or `409` / `403` / `400` | `LobbyData` / `LobbyOptionsData` / `LobbyPartyData` → the room's members | Eight routes over real in-memory state, reachable from inside the game since #91. Bodies arrive as `text/plain`, so this router parses them itself — see [serverEndpoints.md → Lobby Endpoints](serverEndpoints.md#lobby-endpoints). |
| `/services/download/*` | GET | — | binary / 200 | — | Static client-asset downloads. |
| `/login/discord/oauth-start` | GET | — | 302 redirect | — | Discord OAuth begin. |
| `/login/discord/oauth-callback` | GET | — | 302 redirect | — | Returns to client after Discord auth. |
| `/login/discord/session` | POST | — | `{session_key, user_id, …}` JSON (`401`/`500` on error) | — | Exchanges the Discord JWT (sent as `Authorization: Bearer`) for a session_key. The `409` seen elsewhere is the middleware fallthrough for a raw JWT sent to a game route before exchange. |
| `/health` | GET | — | `{status:"ok"}` JSON | — | Liveness probe. No auth, no session. |
| `/debug/party-limit` | GET | — | JSON | — | **Dev only — gated by `NODE_ENV !== "production"`.** |

A single middleware in `src/app.ts` extracts the session key from the **last URL path segment** and validates it against the in-memory `sessions` map before any `/services/*` handler runs. The Discord, `/health`, and `/debug/*` routes bypass this middleware entirely. Once a request is through the gate, `req.session` is attached for every route, and `req.battle` / `req.opponent` as well for the `/battle/*` routes, before the handler runs. The order of checks inside the gate, and which refusal each one produces, is in [`error-handling.md`](./error-handling.md).

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
│ • /debug/* (dev only)    │  │  • ranking table           │
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
  session_key: string         // Random 32-hex token = 128 bits (crypto.randomBytes(16), #53)
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

**Algorithm**: each waiting player carries a power window and an Elo window that start narrow and widen the longer they wait; a pair is made only when *both* sides' windows admit the other. Ported from the original `VsWorker.java`. (It was first-come-first-served within fixed power brackets before milestone M2.)

**How a match is made:**

1. Client POSTs to `/services/vs/start/:session_key` with `vs_type`, `match_handle` and `timer` (how many seconds this player gets per turn — sent by every screen on every request, unlike the next two) — plus, from the friend lobby, `forcematch` (the chosen opponent) and `scene` (the chosen map). For the rated modes (RANKED, TOURNEY) the server looks the player's real rating up before putting them in the queue, so the entry carries their true pre-match rating. The two unrated modes (QUICK and FRIEND) record a rating of 0 and never consult it. *(Technical: the route is async because it awaits `getOrCreateRanking()` for `eloWindow` modes.)*
2. `matchmaking()` in `src/services/queue.ts` tries for a pair straight away, through the same `findBestMatch()` the background pass uses. A brand-new entry has both its windows at their narrowest, so it only pairs on the spot with somebody of almost identical strength; everyone else waits for the windows to widen. *(Technical: `threshold_power` starts at `0` and `threshold_elo` at `VS_WINDOW_ELO_MIN`, or `MAX_SAFE_INTEGER` in the modes with no rating window.)*
3. Every five seconds a `setInterval` calls `processMatches()`, which for each queued entry: recomputes the entry's `power` from current `session.accountData` (so a player who promotes a unit while waiting is matched at their new strength, not the one they joined with), tries `findBestMatch`, and on miss calls `bumpItemThresholds` to widen the entry's `threshold_power` (clamped by `VS_WINDOW_POWER_MAX`, the same uniform cap for every player) and `threshold_elo` linearly over wait-time. `equalPower` modes (RANKED, TOURNEY) leave `threshold_power` locked at 0; `!eloWindow` modes (QUICK **and FRIEND**) leave `threshold_elo` infinite.
4. `findBestMatch` is the canonical filter: skip self, skip mismatched `tourney_id`, then consult `checkForceMatch` — a pair where one has named the other, and the other has either named them back **or has no preference at all**, is returned immediately, **before** the windows below; a player holding out for somebody else is skipped (#205) — then reject pairs whose power gap exceeds *either* side's `threshold_power` or whose Elo gap exceeds *either* side's `threshold_elo` (`checkWindows`), then pick the lowest-magnitude `bestMatchScore` (composite of Elo + power gap, with a ±1 type-mismatch penalty).
5. On match: `tryCreateBattle` recomputes both sides' powers one more time, re-validates the windows (a pair the step above forced together is exempt), and calls `battleHandler.addBattle(parties, mode, perSide, opts)` where `opts` carries `friendly` and the requested map and `perSide` is a two-element `{ power, elo }[]` (earlier-queued entry at `party_index=0`). `opts.timer` is the battle's single turn clock (#213), from `sharedTurnTimer(a, b)`: the lower of the two requests, except that `0` (no clock) counts only when **both** players asked for it — a deliberate divergence from the reference, which gives each side its own. The `Battle` constructor pushes `BattleCreateData` to both sessions via `pushData`; `tryCreateBattle` then takes both entries out of the queue itself and announces the change to everyone still waiting.
**What "power level" means:** the sum of `(RANK - 1)` across the units in a player's party, worked out from their live account data by `calculateLevel(session)`. It is the number both windows in step 3 are comparing.

**Settings you can change without editing code** (all optional; the Elo and power bracket defaults match the reference, the ramp does not):

| Setting | Default | What it does |
|---|---|---|
| `VS_WINDOW_POWER_TIME_SECS` | **20 s** | How long the strength window takes to open fully. Deliberately shortened from the reference's 90, so a near-empty queue pairs people instead of making them wait |
| `VS_BRACKET_ELO` | 200 | The unit a rating gap is scored in |
| `VS_BRACKET_POWER` | 4 | The same, for a strength gap |
| `BSF_MATCHMAKER_LEGACY` | off | Reverts to the pre-M2 exact-strength scan and stops the background pass, for an instant rollback |

*Technical note:* the internal constants that are **not** settings (`src/services/queue.ts`, matching `VsWorkerConfig`) are `VS_CHECK_MS=5000`, `VS_WINDOW_POWER_MIN=0`, `VS_WINDOW_POWER_MAX=4`, `VS_WINDOW_ELO_MIN=4`, `VS_WINDOW_ELO_MAX=4000`, `VS_WINDOW_ELO_TIME_SECS=1000`, `VS_QUICK_ELO_DIFF=50`. The pump and the 60 s queue-timeout sweep both `.unref()` their interval handles so they never block process shutdown; tests call the exported `stopMatchmakerPump()` in `beforeEach` to control timing under `vi.useFakeTimers()`.

**Key Types**:
```typescript
type QueueItem = {
  type: GameModes      // "QUICK" | "RANKED" | "TOURNEY" | "FRIEND"
  account_id: number
  session_key: string  // ties entry to a specific session; stale if player re-logs in
  queuedAt: Date       // for the idle timeout sweep
  power: number        // sum of (RANK-1) across party units; RECOMPUTED every pump tick
  elo: number          // snapshotted at entry, never recomputed (Elo only moves at endgame)
  threshold_power: number      // per-entry window, widens with wait time
  threshold_elo: number        // ditto; MAX_SAFE_INTEGER for modes with no Elo window
  threshold_power_max: number  // per-entry cap on threshold_power growth
  tourney_id: number   // 0 for everyone today; hard cross-tourney rejection is forward-compatible
  forcematch: number   // account_id of the one person wanted, or 0 for anybody (#205)
  scene: string        // map asked for in the friend lobby, or "" for none (#205)
  timer: number        // seconds per turn as this player asked for it; 0 means no clock (#213)
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
  aliveUnits: {}        // Track living units by string(account_id) — the 32-bit in-game
                        // id, NOT user_id. The two differ for Steam and Discord players
  winner: number | null // Server-derived: the side still standing (NOT client killerparty, #19)
  killReports: {}       // Per-entity bitmask, one bit per reporting party_index. A unit leaves
                        // aliveUnits only when every party has reported it (#18)
  unitKillCounts: {}    // Per-unit kill tally for the persistent KILLS stat (#99), applied to
                        // each side's own roster at endgame. Paired with killReportKillers,
                        // which holds the killer the first report named
  endgameStarted: bool  // One-way flag, set the moment a battle finalizes. If two "last unit
                        // killed" messages arrive at once, only the first runs endgame; the
                        // same flag stops /killed and a surrender racing each other
  startedAt: Date       // For DB persistence and duration tracking
}
```

Why the two kill-tracking fields need cross-client agreement, and what a lone modified client could otherwise fake, is in [`battle-simulation.md`](battle-simulation.md) and [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

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
sessions["3f9a1c7e4b28d05f6a1e9c3b7d24f80a"] = {
  user_id: 123456,
  session_key: "3f9a1c7e4b28d05f6a1e9c3b7d24f80a",
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

## Static Data Files

Five **static** files under `data/` are read at startup and never written. All five are cached at module load, so **editing one needs a full server restart** — `yarn dev`'s hot reload is not enough (see [`FAQ.md`](./FAQ.md)). They are not everything in that folder: the database itself lives there and is written constantly, and the client download bundle sits there too when it has been unpacked.

| File | Purpose |
|------|---------|
| `data/acc.json` | Default roster/party for new accounts; `purchasable_units` served from `/account/info` |
| `data/first.json` | Pushed to every client on first poll (currency) — cached at startup. The friends list is **not** here: it is built per player from who is signed in and sent once login finishes (#91) |
| `data/lboard.json` | Historical leaderboard baseline (original 2013 names) merged with live DB standings by `/game/leaderboards`; also the fallback if the DB build fails |
| `data/accounts.json` | Username lookup fallback for unknown `user_id`s |
| `data/build-number` | Returned in the login response as `build_number` |

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

> How to read the server's log messages, plus step-by-step help when battles get stuck, the matchmaking queue jams, or a player stops getting updates: [observability.md](observability.md).

---

## Future Improvements

- [ ] Replace in-memory sessions with Redis (enables horizontal scaling)
- [ ] Rate limiting on `/services/vs/start`
- [ ] Ranked-**ladder** presentation (seasons/tiers) — core Elo rating, RANKED/TOURNEY queues, and live leaderboards already ship
- [ ] Decide whether to use MQTT (currently installed-but-unused) or remove `async-mqtt` from `dependencies`

---

*Last updated: 2026-09-10*
