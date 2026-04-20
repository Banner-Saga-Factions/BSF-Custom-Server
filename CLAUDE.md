# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A custom server reimplementing the backend for **The Banner Saga Factions** (a defunct multiplayer turn-based strategy game). The game client is an Adobe AIR/Flash app that communicates with this Express server over HTTP long-polling. All client protocol details were reverse-engineered from Fiddler captures in `data/game_captures/`.

## Commands

```bash
yarn build          # Compile TypeScript → build/
yarn dev            # ts-node-dev hot-reload (dev only)
node build/index.js # Run compiled server (requires .env)
```

**start-server.bat** — runs the compiled server with preflight checks for `.env` and `build/`.  
**test-2p-match.bat** — headless 2-player API smoke test (login → queue → match creation).  
**launch-game-2p.ps1** — launches two game client windows in versus mode against localhost.

No test suite exists. Use `yarn build` to verify TypeScript compiles clean before committing.

## Environment Setup

Copy `.env` and fill in values:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=bsf
JWT_SECRET=replace-with-a-strong-random-secret
```

Initialize the database:
```bash
mysql -u root -p bsf < src/db/schema.sql
```

The server fails fast at startup if `JWT_SECRET` is missing or `DB_PORT` is non-numeric.

## Architecture

### Request Flow

All game client traffic hits `POST/GET /services/*`. A single middleware in `src/index.ts` extracts the session key from the **last URL path segment** and validates it against the in-memory sessions map before routing:

- `/services/auth/login/11` — the literal `"11"` is the sentinel that bypasses auth for login
- `/services/session/steam/overlay/*` — immediately returns 200 (Steam overlay, no-op)
- Everything else — must have a valid session key or receives 403

After auth, `req.session` (and `req.battle`, `req.opponent` for battle routes) are attached before hitting route handlers.

### Session & Real-Time Data Delivery

`Session` (`src/services/auth/auth.ts`) extends `EventEmitter`. Real-time data delivery uses **long-polling**:

- `GET /services/game/:session_key` — holds the connection up to 20 seconds, listening for a `"data"` event
- `session.pushData(...items)` — appends to `session.data[]` and emits `"data"` to flush the waiting poll
- `session.pollingActive` — guards against concurrent polls stealing each other's data

On first poll, `getInitialData()` pre-fills the session buffer with queue state and static data from `data/first.json` (cached at module load — requires server restart to pick up file changes).

### Matchmaking & Battle Lifecycle

1. Client POSTs to `/services/vs/start/:session_key` with `vs_type` and `match_handle`
2. `matchmaking()` in `src/services/queue.ts` looks for another player with the same `type` AND `power` level
3. On match: `battleHandler.addBattle()` creates a `Battle` instance, pushes `BattleCreateData` to both sessions via `pushData`, and removes both from the queue
4. Power level = sum of `(RANK - 1)` across party units, computed from `session.accountData`

### Battle State

`Battle` (`src/services/battle/Battle.ts`) tracks:
- `parties: Record<session_key, BattlePartyData>` — initial party including `defs[]` (all units)
- `aliveUnits: Record<string_user_id, string[]>` — unit IDs still alive per player
- `winner: number | null` — set to `killerparty` user_id when last unit is killed
- `startedAt: Date` — for DB persistence

BattleRouter middleware attaches `req.battle` and `req.opponent` for every `/battle/*` route. `/battle/exit` is the only route allowed when the opponent has already disconnected.

### Endgame (Stream 3)

`endgame()` is called from `/battle/killed` when `battle.winner` is set. It:
1. Computes kills from `aliveUnits` deltas — `winnerKills = loserParty.defs.length`, `loserKills = winnerParty.defs.length - aliveUnits[winnerId].length`
2. Computes renown — `winnerRenown = 20 + kills × 3`, `loserRenown = kills × 3`
3. Fire-and-forget `Promise.all([addRenown, addRenown, saveBattleResult])` — DB writes don't block client messages
4. Pushes `BattleFinishedData` + `RenownMessage` to both sessions with real values

### Database Layer

`src/db/connection.ts` — mysql2 pool, `query<T>()` and `queryOne<T>()` helpers.  
`src/db/account.ts` — `upsertAccount()` (INSERT … ON DUPLICATE KEY UPDATE login_count), `addRenown()`, `saveParty()`, `saveRoster()`.  
`src/db/battles.ts` — `saveBattleResult()` (INSERT … ON DUPLICATE KEY UPDATE).  
`src/db/schema.sql` — DDL for `accounts` and `battles` tables.

`session.accountData` (`AccountRow | null`) is populated after login and cached in memory for the session lifetime. It is the source of truth for party/roster during a session — DB writes are synced via `saveParty()`/`saveRoster()` but in-memory is updated immediately.

### Static Data Files

| File | Purpose |
|------|---------|
| `data/acc.json` | Default roster/party for new accounts; `purchasable_units` served from `/account/info` |
| `data/first.json` | Pushed to every client on first poll (currency, friends) — cached at startup |
| `data/lboard.json` | Static leaderboard data served from `/game/leaderboards` |
| `data/accounts.json` | Username lookup fallback for unknown `user_id`s |
| `data/build-number` | Returned in the login response as `build_number` |

### Key Gotchas

- **`first.json` is cached at module load** — changes require server restart.
- **Session key `"11"`** is the hardcoded bypass for unauthenticated login — any other value requires a valid session.
- **Express strips the `/services` prefix** inside `ServiceRouter` — path checks must use `/session/...` not `/services/session/...`.
- **"News of the Banner" popup** is client-side, not server-triggered. Fix by copying `global_0.sol` → `global_1.sol` (patching byte 25 from `0x30` → `0x31`) in `%AppData%\TheBannerSagaFactions\Local Store\#SharedObjects\app.game.air.swf\`.
- `daily_login_streak` and `roster_rows` in the DB are **not auto-updated** by the server.
- `accounts.json` is only used as a username fallback — all actual account data comes from MySQL.
