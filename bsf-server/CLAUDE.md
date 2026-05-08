# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A custom server reimplementing the backend for **The Banner Saga Factions** (a defunct multiplayer turn-based strategy game). The game client is an Adobe AIR/Flash app that communicates with this Express server over HTTP long-polling. All client protocol details were reverse-engineered from Fiddler captures in `data/game_captures/`.

## Working Style

**Explain every edit before making it.** When presenting a command to run or code change for approval, always include:
- **What it does** — what the line or block of code actually does in plain English
- **Why we need it** — the specific problem it solves or capability it enables
- **Any tradeoff or risk** — if the change has a downside worth knowing

The goal is that the user can learn from every change, not just approve it blindly.

**Present ALL planned edits before touching any file.** List every file change — each with What / Why / Tradeoff — in a single message. That message must contain **no Edit, Write, or file-modifying Bash calls** — only text. End the message with "Reply y to approve." Only after receiving explicit **y** may the next response contain tool calls that modify files. Each new batch of changes needs its own approval cycle, even if the user said "fix all" or "go ahead" earlier in the conversation.

The user responds **y** to approve and **n** to decline.

## Commands

```bash
yarn test           # Run all 50 automated tests (~3s, no DB needed)
yarn test:watch     # Re-run on file changes during development
yarn test:coverage  # Run tests + generate coverage report
yarn build          # Compile TypeScript → build/
yarn dev            # ts-node-dev hot-reload (dev only)
node build/index.js # Run compiled server (requires .env)
```

**start-server.bat** — builds, kills any running node process, then starts fresh. Always use this instead of `node build/index.js` directly — running the old build after code changes is the most common cause of "my change isn't working" during testing.  
**test-2p-match.bat** — headless 2-player API smoke test (login → queue → match creation).  
**launch-game-2p.ps1** — launches two game client windows in versus mode against localhost.

A pre-commit hook runs `yarn build && yarn test` automatically — commits are blocked if either fails.

## After Completing Changes

After finishing any bug fix, stream, or feature, follow this order — do not skip steps:
1. Run `yarn test` and confirm all tests pass. Fix any regressions before continuing.
2. Prompt the user to manually test the changes and wait for confirmation.
3. Only after the user confirms tests passed, ask: "Do you want me to update the documentation to reflect these changes?"
4. Only after docs are updated (or skipped), ask: "Do you want me to create a commit?"

Do not update docs or commit automatically. Always prompt first.

## Commit Messages

Write commit messages in plain English that a non-programmer could read and understand:
- The subject line should say **what changed and why**, not which files or functions were touched
- Avoid technical shorthand, function names, or file paths in the subject line
- Add a short body note with the technical detail (affected files, function names) for AI agents and future developers

Good:
```
Fix crash when exiting a battle after the opponent disconnects

Battle exit route was not guarded against a null opponent reference.
Affected: src/services/battle/battleRouter.ts
```

Bad: `feat: fix null ref in battleRouter.ts exit handler`

Use a conventional prefix (`fix:`, `chore:`, `docs:`) only when it genuinely adds clarity, but never at the expense of plain-English meaning.

## Code Review

After code changes or at the end of each stream, ask if users wants to spawn a code reviewer subagent to review the code written in that session:

```
Agent({ subagent_type: "general-purpose", description: "Code review", prompt: "Review the changes in <files> for correctness, security, and edge cases..." })
```

Look for: unhandled promise rejections, missing input validation, type mismatches, auth bypasses, edge cases in matchmaking/battle logic, and protocol compliance with the Fiddler captures in `data/game_captures/`.

## Environment Setup

Copy `.env.example` to `.env` and fill in values:
```
DB_PATH=./data/bsf.db
JWT_SECRET=replace-with-a-strong-random-secret
```

No database initialization step needed — `src/db/connection.ts` creates `data/bsf.db` and runs `CREATE TABLE IF NOT EXISTS` automatically on server startup.

The server fails fast at startup if `JWT_SECRET` is missing or empty.

## Architecture

### Request Flow

All game client traffic hits `POST/GET /services/*`. A single middleware in `src/index.ts` extracts the session key from the **last URL path segment** and validates it against the in-memory sessions map before routing:

- `/services/auth/login/11` — the literal `"11"` is the sentinel that bypasses auth for login
- `/services/session/steam/overlay/*` — immediately returns 200 (Steam overlay, no-op)
- Everything else — must have a valid session key or receives 403

After auth, `req.session` (and `req.battle`, `req.opponent` for battle routes) are attached before hitting route handlers.

### Session & Real-Time Data Delivery

`Session` (`src/services/auth/auth.ts`) extends `EventEmitter`. Real-time data delivery uses **long-polling**:

- `GET /services/game/:session_key` — holds the connection up to 10 seconds, listening for a `"data"` event
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
- `aliveUnits: Record<string_account_id, string[]>` — unit IDs still alive per player, keyed by `String(session.account_id)`
- `winner: number | null` — set to `killerparty` account_id (32-bit) when last unit is killed
- `endgameStarted: boolean` — a one-way flag that flips to `true` the moment a battle finalizes. Acts as a guard: if two "last-unit-killed" messages arrive at nearly the same time, only the first one runs the endgame logic; the second one sees the flag set and skips. Same flag protects against `/killed` and `/exit` (surrender) racing each other.
- `startedAt: Date` — for DB persistence

BattleRouter middleware attaches `req.battle` and `req.opponent` for every `/battle/*` route. `/battle/exit` is the only route allowed when the opponent has already disconnected.

### Endgame (Stream 3)

`endgame()` is called from `/battle/killed` (and `/battle/exit` on surrender) once `battle.endgameStarted` flips to `true`. It:
1. Computes kills from `aliveUnits` deltas — `winnerKills = loserParty.defs.length`, `loserKills = winnerParty.defs.length - aliveUnits[winnerId].length`
2. Computes renown — `winnerRenown = 20 + kills × 3`, `loserRenown = kills × 3`
3. Sends each player their achievement-progress message right away (these are placeholder zero-deltas for now and don't depend on the database)
4. Writes the renown updates and the battle-result row to SQLite. **The "you won / you lost" message and the renown total are only sent after those database writes finish** — so a player can never see "you earned 23 renown" while the DB actually saved nothing. Adds ~5–50 ms latency for the round trip, which is fine because endgame fires once per battle
5. If a database write fails, the player still gets a "battle finished" message — but with `total_renown: 0` and a chat message asking them to report it. This stops the battle screen from freezing while making it clear that no renown was actually awarded

### Database Layer

`src/db/connection.ts` — `node:sqlite` (`DatabaseSync`), WAL mode, inline schema auto-init on startup, `query<T>()`, `queryOne<T>()`, and `queryUpdate()` helpers.  
`src/db/account.ts` — `upsertAccount()` (INSERT … ON CONFLICT(user_id) DO UPDATE SET login_count), `addRenown()`, `saveParty()`, `saveRoster()`.  
`src/db/battles.ts` — `saveBattleResult()` (INSERT … ON CONFLICT(battle_id) DO UPDATE SET).  
`src/db/schema.sql` — SQLite DDL for `accounts` and `battles` tables (documentation only — schema auto-initializes from `connection.ts`).

`session.accountData` (`AccountRow | null`) is populated after login and cached in memory for the session lifetime. It is the source of truth for party/roster during a session — DB writes are synced via `saveParty()`/`saveRoster()` but in-memory is updated immediately.

### Static Data Files

| File | Purpose |
|------|---------|
| `data/acc.json` | Default roster/party for new accounts; `purchasable_units` served from `/account/info` |
| `data/first.json` | Pushed to every client on first poll (currency, friends) — cached at startup |
| `data/lboard.json` | Static leaderboard data served from `/game/leaderboards` |
| `data/accounts.json` | Username lookup fallback for unknown `user_id`s |
| `data/build-number` | Returned in the login response as `build_number` |