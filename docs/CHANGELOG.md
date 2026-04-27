# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-04-26

### 🏟️ Proving Grounds: Roster Management Routes

New `src/services/roster.ts` mounted at `/roster`, implementing all 7 Proving Grounds
routes extracted and adapted from the `Atmakuja_DB_Changes` branch. All routes write
against the current `mysql2/promise` stack and keep `session.accountData` in sync as
the in-memory source of truth.

**New routes:**
- `POST /roster/party/arrange` — replaces the active party; validates all IDs exist in
  current roster, rejects unknowns with 400
- `POST /roster/unit/promote` — ranks a unit up by 1, updates name and class; costs
  20 renown (rank 1→2) or 80 (rank 2→3); capped at rank 3
- `POST /roster/unit/rename` — renames a unit; costs 10 renown
- `POST /roster/unit/retire` — removes a unit from roster and party atomically in a
  single DB write; was two separate writes that could desync on partial failure
- `POST /roster/unit/hire` — purchases from the Mead House; validates renown, barracks
  capacity, and unit ID uniqueness before writing
- `POST /roster/unit/stats/purchase` — applies stat deltas; validates bounds (1–5,
  integer, no duplicates), rejects unknown stats; renown cost is client-computed
  (known gap, deferred to a future stream)
- `POST /roster/unlock` — expands barracks by 1 slot; costs 60 renown

**New DB helpers (`src/db/account.ts`):**
- `saveRosterAndSpendRenown()` — single UPDATE combining roster save + renown deduction;
  replaces the prior two-statement pattern where a second-write failure skipped renown
- `saveRosterAndParty()` — single UPDATE for roster + party; used by retire to prevent
  desync if the second write previously failed
- `expandBarracks()` — now uses `AND renown >= 60` in SQL; returns `boolean` so the
  route can detect a race-condition 402 at the DB level; prevents negative renown
- `queryUpdate()` added to `src/db/connection.ts` — returns `affectedRows` for
  conditional UPDATE checks

**Correctness fixes (from code review):**
- Routes mutating roster element fields (promote, rename, stats/purchase) now save old
  values and restore in the catch block — DB failure no longer permanently dirtied
  in-memory session state
- Routes adding/removing roster entries (hire, retire) build the new array first and
  assign to `acc` only after the DB write succeeds
- `stats/purchase` validates all deltas before mutating any — a mixed valid/invalid
  multi-stat request no longer partially corrupts in-memory stats
- Hire now checks unit ID uniqueness after ID generation, covering client-supplied IDs
  containing `_start_` that previously bypassed the collision check

**Smoke test:**
- Added `smoke-test-roster-proving_grounds.bat` — 9 automated checks; creates a fresh
  account per run via timestamp steam_id so no manual DB setup is needed

---

## [0.2.1] - 2026-04-26

### 🔧 Infrastructure & Dev Tooling

- **Dockerfile**: Upgraded base image from `node:20-alpine` to `node:22-alpine` (LTS — supported until April 2027); renamed build stages to `build_env` and `runtime_env` for clarity. Extracted and improved from community PR #8 (original targeted EOL Node 21).
- **docs/Development.md**: Added 2-player localhost test launch command using full 64-bit Steam IDs, useful for validating the 32-bit `account_id` derivation path end-to-end.

---

## [0.2.0] - 2026-04-20

### 🗄️ Stream 1: Database Foundation

- Added MySQL2 connection pool (`src/db/connection.ts`) — `query<T>()` / `queryOne<T>()` helpers
- Added `src/db/schema.sql` — `accounts` and `battles` tables with proper types and indexes
- Added `src/db/account.ts` — `upsertAccount()`, `getAccountByUserId()`, `addRenown()`, `saveParty()`, `saveRoster()`
- Added `src/db/battles.ts` — `saveBattleResult()` (INSERT … ON DUPLICATE KEY UPDATE)
- Accounts are seeded automatically on first login; `login_count` incremented on re-login
- `session.accountData` (AccountRow) now populated after login; used as in-memory truth for party/roster during a session

### ⚔️ Stream 3: Match Resolution (Endgame Rewrite)

- Added `BattleRenownAwardTypes` enum to `src/const.ts` (KILLS, WIN, UNDERDOG, DAILY, etc.)
- `endgame()` in `Battle.ts` fully rewritten — was entirely hardcoded (renown=31, KILLS:2)
- Kill computation from `aliveUnits`: `winnerKills = loserParty.defs.length`, `loserKills = winnerParty.defs.length − aliveUnits[winnerId].length`
- Renown formula: `winnerRenown = 20 + kills × 3`, `loserRenown = kills × 3`
- DB persistence: fire-and-forget `Promise.all([addRenown × 2, saveBattleResult])` — does not block client messages
- `BattleFinishedData` and `RenownMessage` now sent to both players with real values
- Added `startedAt: Date = new Date()` to `Battle` class for battle duration tracking
- `/battle/killed` route updated to call `endgame(data).catch(...)` (fire-and-forget)

### 🔒 Security & Stability Fixes

- **CRIT-1**: `res.sendStatus(403)` — was `res.status(403)`, leaving socket open without a response body
- **CRIT-2**: Server throws at startup if `JWT_SECRET` is missing; `verify()` wrapped in try/catch to handle tampered/expired tokens
- **CRIT-3**: Discord JWT path now returns 501 (was reaching routes that expected `req.session`, causing TypeError)
- **MED-9**: Steam overlay path fixed — Express strips `/services` prefix inside ServiceRouter; check is now `/session/steam/overlay/`
- **MED-7**: `pollingActive` guard on `GET /game/:session_key` — returns 429 if a poll is already active (prevents double-send)
- **MED-5**: `DB_PORT` validated as numeric at startup — throws with a clear message if NaN
- **MED-4**: `vs_type` validated against `GameModes` enum on `POST /vs/start` — returns 400 for invalid values
- **MED-8**: Discord OAuth JWT now includes `expiresIn: "7d"`
- **HIGH-2**: `POST /account/update` validates `party.ids` and `roster.defs` are arrays before writing to DB — returns 400
- **NEW-2**: `POST /account/update` DB writes wrapped in try/catch — returns 500 on DB failure
- **NEW-3**: `GET /game/leaderboards` readFileSync wrapped in try/catch — returns 500 if `lboard.json` missing
- **Fix #7**: `/vs/start` returns 409 if player is already queued
- **Fix #15**: Matchmaking now filters by both `type` AND `power` level (was type-only)
- **HIGH-8**: Existing session evicted on re-login

### 🔄 Stream 4: Queue Reliability

- `QueueItem` now stores `session_key` and `queuedAt` — entries are tied to a specific session, not just `account_id`
- `matchmaking()` looks up the opponent by `session_key` instead of `user_id` — prevents ghost matches when a player re-logs in while queued
- `/vs/cancel` now looks up by `session_key` (was `account_id`) — consistent with the rest of queue logic
- Added 5-minute idle timeout: `setInterval` runs every 60s, evicts stale entries, and broadcasts updated queue counts
- Exported `dequeuePlayer(session_key)` — removes a player's queue entry by session key and notifies remaining players
- `addSession()` calls `dequeuePlayer` before evicting an old session on re-login
- Logout route calls `dequeuePlayer` before `removeSession` — queue is always clean on logout

### 🗂️ Stream 5: Roster Management Hardening

- `POST /account/update` now validates party IDs against the player's current roster — returns 400 with offending IDs if any are unknown
- Party size capped at 6 — returns 400 if `party.ids.length > 6`
- Per-element type guard on `party.ids` — non-string or empty-string elements return 400
- Roster unit structure validated — each def must have non-empty `id`, `entityClass`, and `stats[]`
- `saveRoster()` now updates `roster_json` and `roster_rows` atomically in a single `UPDATE` (was two separate queries — MED-1 fix)
- Empty-string `id`/`entityClass` now rejected by roster validation (MED-2 fix)

### ⚡ Latency & Polling Improvements

- `src/services/game.ts` — Long-poll timeout reduced from 20s to 10s; `Connection: keep-alive` header added to timeout responses to minimize the re-poll gap
- `src/index.ts` — Added middleware to disable Nagle's Algorithm (`socket.setNoDelay(true)`) for immediate packet transmission on all responses
- `src/services/auth/auth.ts` — Added `pollStartTime` field to `Session`; timing instrumentation logs (`elapsedMs`) added to poll start, data arrival, and keep-alive paths in `game.ts`

### 🐛 Bug Fix: New Account roster_rows Initialization

- `src/db/account.ts` — `upsertAccount()` INSERT now sets `roster_rows = DEFAULT_ROSTER.length`; previously the column was left at the schema default (1) regardless of actual roster size, causing the client roster grid to render only 1 row for new accounts

### 🐳 Stream 6: Docker Deployment

- Fixed `Dockerfile`: added `EXPOSE 8082`, changed `CMD` to exec form (`["node", "./index.js"]`) for proper SIGTERM handling, removed debug `RUN printenv`
- Added `.dockerignore` — excludes `.env`, `.git/`, `node_modules/`, `data/game_captures/`, `docs/`, build artifacts, and scripts from the Docker build context
- Added `docker-compose.yml` — orchestrates MySQL 8 + app; schema auto-initializes via `/docker-entrypoint-initdb.d/` on first boot; named volume `db-data` persists across restarts; app waits for DB health check before starting

### 🔑 Stream 8: Discord OAuth Login

- Implemented end-to-end Discord OAuth2 flow in `src/services/auth/discord.ts`
- `GET /login/discord` redirects to Discord authorization URL (scope: `identify` only)
- `GET /login/discord/oauth-callback` exchanges code for tokens, fetches Discord user, calls `upsertAccount()`, signs a 7-day JWT, and redirects to `bsf://auth?access_token=<jwt>&new_user=<bool>&username=<name>`
- `POST /login/discord/session` exchanges a Discord JWT for a `session_key` — the same format Steam login returns; use this key for all game traffic
- Session exchange uses `getAccountByUserId` first (avoids double-incrementing `login_count`); falls back to `upsertAccount` only if account is missing
- Moved `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` from hardcoded constants to env vars with fallbacks
- Added startup warning if `DISCORD_CLIENT_SECRET` is missing
- `.env.example` updated with all three Discord env vars
- `docker-compose.yml` passes Discord vars through to the app container
- Updated CRIT-3 comment in `src/index.ts` — the 501 block is correct and intentional; Discord users must exchange JWT via `/login/discord/session` before using game routes

**Note:** Discord snowflake IDs above `Number.MAX_SAFE_INTEGER` still lose precision via `parseInt()` in the Discord OAuth path — this is tracked and partially addressed by the Steam ID precision fix below; a full BigInt/string solution for Discord IDs is a future stream.

**Stream 8 post-review patches (`src/services/auth/discord.ts`, `docker-compose.yml`):**
- **CRIT-1**: OAuth callback now allowlists Discord error codes before forwarding to `bsf://` redirect — known codes (`access_denied`, `temporarily_unavailable`) pass through; anything else maps to `oauth_error`; no-code path produces `missing_access_code`
- **CRIT-2**: Added precision-loss warning guard after `parseInt` on Discord snowflake IDs in both `/oauth-callback` and `/session` — logs a warning when the stringified result doesn't match the original ID
- **MED-1**: Removed erroneous `Content-Type: application/x-www-form-urlencoded` header from the `GET` request to Discord's `/users/@me` endpoint (header is only valid on POST bodies)
- **MED-3**: Anchored Bearer token regex from `/Bearer (.*)/` to `/^Bearer\s+(\S+)$/` — rejects tokens with embedded spaces or trailing garbage
- **MED-5**: Removed redundant Discord env vars from `docker-compose.yml` `environment` block — `env_file: .env` already supplies them; explicit `environment` entries were pulling from the host shell (not `.env`), which caused silent empty-string values if the vars weren't exported in the shell

### ⚔️ Endgame Protocol Fixes

Verified against Fiddler captures (`0737_s.txt`, `0746_s.txt`) — `BattleFinishedData` format did not match the original server, preventing the renown screen from appearing.

**`BattleFinishedData` protocol compliance (`src/services/battle/Battle.ts`):**
- `reliable_msg_id` corrected to `{battle_id}_finished_0` (was `_finished_{user_id}`, different per player)
- `user_id` corrected to `0` (was session user_id)
- `total_renown` now combined winner + loser renown (was per-player)
- `rewards` now two objects — winner first, loser second — same `BattleFinishedData` sent identically to both players (was separate per-player objects with one reward each)
- `rewards[].achievements` corrected to `{}` empty object (was `[]` empty array)

**Kill computation fix:**
- `winnerKills` now uses `loserParty.defs.length − aliveUnits[loserId].length` (was `loserParty.defs.length` — hardcoded assumption that loser had 0 units alive, wrong for surrender)

**Surrender endgame (`/battle/exit`):**
- When a player calls `/battle/exit` before a natural winner is set (`battle.winner === null`), the server now declares the opponent as winner and calls `endgame()` before cleaning up — both players receive `BattleFinishedData` and the opponent can exit normally
- Note: mid-battle surrender is not a protocol endpoint — the client has no explicit surrender call; this handles the case where a player exits the game client mid-battle

**Dev tooling:**
- `start-server.bat` now runs `yarn build` before killing the node process and restarting — prevents testing against a stale build
- Added `_debugWeakUnits` flag and `POST /debug/weak-units` endpoint in `src/index.ts` — sets STRENGTH=1/ARMOR=0 on all units at battle creation for faster testing; defaults `false` (client-side combat ignores server-sent stats, so this has no gameplay effect but the infrastructure is in place)
- 1-unit party testing: set both test accounts to a 1-unit party via `UPDATE accounts SET party_ids_json = JSON_ARRAY(JSON_VALUE(party_ids_json, '$[0]')) WHERE user_id IN (123456, 293850)` for faster match completion

### 🔧 Steam ID Precision Fix & Internet Multiplayer Testing

**Steam ID precision fix (`src/db/account.ts`, `src/services/auth/auth.ts`):**

- **Root cause:** Real Steam IDs (e.g. `76561198354572130`) exceed `Number.MAX_SAFE_INTEGER` (2^53-1). `parseInt`/`Number` rounds them to the nearest IEEE 754 representable value. mysql2's binary protocol then sends the rounded JS Number as a DOUBLE, causing `upsertAccount` INSERT to write one value and the subsequent SELECT to find nothing — `[LOGIN] DB error during upsertAccount: Error: upsertAccount: row missing after INSERT`.
- All DB functions (`getAccountByUserId`, `upsertAccount`, `addRenown`, `saveParty`, `saveRoster`) now accept `number | string`; SQL params always pass `String(user_id)` — mysql2 sends the exact string, MySQL does precise string-to-BIGINT conversion
- Login route now validates `steam_id` with `/^\d{1,20}$/` regex (rejects non-numeric/empty); preserves the original string for DB calls; `Number(steamIdStr)` is used only for the in-memory `Session` object (may lose precision but stays internally consistent for the session lifetime)
- **Existing installs:** if your `accounts` table was created before `schema.sql` set `BIGINT UNSIGNED`, run: `ALTER TABLE accounts MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL;`

**Internet multiplayer testing results:**

- **ngrok HTTPS: broken** — Adobe AIR's HTTP client fails on 20-second GET long-polls over HTTPS; login POSTs succeed but `GET /services/game/SESSION_KEY` hangs indefinitely; game stays on loading screen with no poll logged on server
- **Cloudflare Tunnel: confirmed working** — run `cloudflared tunnel --url http://localhost:8082`; use the `https://xxxx.trycloudflare.com` URL; server log shows `[GAME-POLL] START` and poll holds correctly
- `--versus_start` requires `--steam_id` to be set explicitly in launch args — does not activate when Steam ID is sourced implicitly from the Steam client via `--steam true` alone
- Working remote play Steam launch options: `--server https://CF_URL/ --factions --developer --steam true --steam_id YOUR_STEAM_ID --versus_start --versus_countdown 0`

### ⚔️ Stream 7: Battle Endgame Fixes & Dev Tooling

**Bug fixes (`src/services/battle/Battle.ts`):**
- `killerparty` from JSON body arrives as a string; strict `===` against `number` always failed → `Number(req.body.killerparty)` fixes winner identification (winner was always the wrong player)
- BattleRouter middleware opponent-guard checked `req.path.startsWith("/battle/exit")` but Express strips the `/battle` mount prefix inside the router — path is `/exit/:session_key` inside the router, so the guard never matched and exit was blocked after opponent left
- `/exit` route was registered as `BattleRouter.post("/battle/exit/...")` — double `/battle` prefix (mounted at `/battle` + route path `/battle/exit`) caused a 404; corrected to `BattleRouter.post("/exit/...")`

**Dev tooling:**
- Added module-level `_debugPartyLimit` and exported `setDebugPartyLimit()` in `Battle.ts` — caps party size at battle-creation time for quick testing
- Added unauthenticated `POST /debug/party-limit` endpoint in `src/index.ts` — sets/clears the cap without requiring auth
- `start-server.bat` now kills any existing `node` process before starting (prevents `EADDRINUSE :::8082` on rapid restarts)
- Added `launch-game-2p-quickbattle.ps1` — calls `/debug/party-limit` before launch, clears it after game closes; enables fast 1v1 testing with a single warrior per side
- Added `data/client-README.txt` — README template for the GitHub Release game client zip

### 🛠️ Dev Tooling

- Added `start-server.bat` — preflight checks `.env` and `build/` before starting server
- Added `test-2p-match.bat` — headless 2-player API smoke test (login → queue → match)
- Fixed `launch-game-2p.ps1` / `launch-game-1p.ps1` — server health check now uses `Test-NetConnection` (TCP) instead of HTTP
- Added `CLAUDE.md` — codebase guidance for Claude Code

### 🐛 Bug Fixes

- "News of the Banner" popup blocking Pieloaf's window: root cause was missing `news_date` key in `global_1.sol` Flash Local Shared Object — fixed by patching from `global_0.sol`
- Removed `src/middleware/validation.ts` (superseded by inline validation)
- `first.json` no longer contains `Tourney`/`TourneyWinnerData` objects (unused)

---

## [0.1.0] - 2026-04-19

### 🎯 Critical Release: 7 Blocking Bugs Fixed

**Summary**: Battle flow now functional end-to-end for 2-player matches. Protocol aligned with official Banner Saga Factions server format based on reverse-engineered Fiddler captures. **Ready for multi-user testing after database integration.**

**Status**: 
- ✅ Matchmaking → Battle Creation → Unit Deployment working
- ✅ Both players visible with correct units
- ✅ Protocol matches official server format
- ⏳ Movement restrictions (UI modal blocking, not server bug)

---

## 🐛 Bug Fixes

### 1. 🔴 CRITICAL: Array Index Syntax Error in Unit Death Tracking

**File**: `src/services/battle/Battle.ts` (Line 301)

**Issue**: Game crashes when unit dies. Prevents battle from ending.

**Before**:
```typescript
let killed_idx = party.indexOf[req.body.entity];  // ❌ Wrong syntax
battle.aliveUnits[req.body.killedparty].splice(killed_idx);  // ❌ Missing deleteCount
```

**After**:
```typescript
let killed_idx = party.indexOf(req.body.entity);  // ✅ Correct function call
battle.aliveUnits[req.body.killedparty].splice(killed_idx, 1);  // ✅ Remove 1 element
```

**Impact**: Unit death now tracked correctly. Battle can detect when last unit dies and trigger end-game flow without crashing.

**Test**: Kill unit in battle → should update alive units list and trigger end-game when appropriate.

---

### 2. 🔴 CRITICAL: Party Filtering Logic Commented Out

**File**: `src/services/battle/Battle.ts` (Lines 81-119)

**Issue**: Only 1/6 units sent to clients instead of full party. Game UI breaks with missing units.

**Before**:
```typescript
defs: [acc.roster.defs[0]],  // ❌ Only first unit!
//(acc.roster.defs as any[]).filter((unit) =>  // ❌ Filtering commented out
//  acc.party.ids.includes(unit.id)
//),
```

**After**:
```typescript
let filteredDefs = (acc.roster.defs as any[]).filter((unit) =>
    acc.party.ids.includes(unit.id)
);

defs: filteredDefs,  // ✅ All 6 units, correctly filtered by party.ids
```

**Impact**: Clients receive complete party (all 6 units) instead of just first unit. Battle board displays correct composition for both players.

**Test**: Start battle → both players see 6 units each on board.

---

### 3. 🔴 CRITICAL: Missing Response in `/battle/exit` Endpoint

**File**: `src/services/battle/Battle.ts` (Line ~315)

**Issue**: Client hangs indefinitely when trying to exit battle. No HTTP response sent.

**Before**:
```typescript
BattleRouter.post("/battle/exit/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    delete battle.parties[data.session.session_key];
    if (!battle.parties.length) battleHandler.removeBattle(battle.battle_id);
    // ❌ NO RESPONSE - client times out
});
```

**After**:
```typescript
BattleRouter.post("/battle/exit/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    delete battle.parties[data.session.session_key];
    if (Object.keys(battle.parties).length === 0) battleHandler.removeBattle(battle.battle_id);
    res.json({ status: "success", battle_id: battle.battle_id });  // ✅ Response sent
});
```

**Impact**: Players can cleanly exit battles and return to menu. HTTP request completes properly.

**Test**: End battle → click exit → immediately return to main menu without timeout.

---

### 4. 🔴 CRITICAL: Parties Data Structure (Array → Object)

**File**: `src/services/battle/Battle.ts` (Line 27-30)

**Issue**: Opponent lookup fails. Undefined cascade errors.

**Before**:
```typescript
this.parties = [];  // ❌ Array - breaks keyed lookup by session_key
this.parties[session.session_key] = party;  // ❌ Creates sparse array
parties: Object.values(this.parties),  // ❌ May contain undefined values
```

**After**:
```typescript
this.parties = {};  // ✅ Object for proper key-value mapping
this.parties[session.session_key] = party;  // ✅ Clean key-value storage
parties: Object.values(this.parties),  // ✅ Always 2 valid parties
```

**Impact**: Battle party data properly keyed. Opponent lookup (`battleHandler.getOpponent()`) now works reliably. No undefined errors.

**Test**: Start battle → verify `battle.parties[session_key]` exists and `Object.keys(battle.parties).length === 2`.

---

### 5. 🔴 CRITICAL: Queue Cleanup Only Removes One Player on Match

**File**: `src/services/queue.ts` (Lines 68-88)

**Issue**: Matched players not fully removed from queue. Duplicate matches occur. Ghost queue entries persist.

**Before**:
```typescript
battleHandler.addBattle([opponent, challenger], match.type, match.power);
gameQueue.splice(gameQueue.indexOf(match), 1)[0];  // ❌ Only removes opponent
// ❌ Challenger never removed from queue!
```

**After**:
```typescript
battleHandler.addBattle([opponent, challenger], match.type, match.power);
gameQueue.splice(gameQueue.indexOf(match), 1);  // Remove opponent
gameQueue.splice(gameQueue.indexOf(item), 1);   // ✅ Also remove challenger
console.log(`[MATCHMAKING] Queue size after removal: ${gameQueue.length}`);
```

**Impact**: Both matched players cleanly removed from queue. Queue state accurate. No duplicate matches for same players.

**Test**: Two players queue → should match and both disappear from queue. Queue size should decrease by 2.

---

### 6. 🔴 CRITICAL: GameRouter Disabled (Commented Out)

**File**: `src/index.ts` (Line 71)

**Issue**: Battle data buffered but never delivered. Clients don't receive game state updates via long-polling.

**Before**:
```typescript
ServiceRouter.use("/chat", ChatRouter);
// ServiceRouter.use("/game", GameRouter);  // ❌ COMMENTED OUT
ServiceRouter.use("/vs", QueueRouter);
```

**After**:
```typescript
ServiceRouter.use("/chat", ChatRouter);
ServiceRouter.use("/game", GameRouter);  // ✅ ENABLED
ServiceRouter.use("/vs", QueueRouter);
```

**Impact**: `/services/game/{session_key}` endpoint now accessible. Clients can fetch buffered battle data (BattleCreateData, unit positions, moves, actions). Long-polling works.

**Test**: After battle created, client calls `/services/game/{session_key}` → receives BattleCreateData immediately.

---

### 7. 🟠 HIGH: Protocol Misalignment with Official Server

**File**: `src/services/battle/Battle.ts` (Lines 44-56, 81-119), `src/services/battle/BattlePartyData.ts`

**Issue**: Client crashes parsing BattleCreateData. Format doesn't match official Banner Saga Factions protocol.

**Reference**: Verified against official Fiddler capture: `data/game_captures/extracted/raw/0058_s.txt` (March 2022 match)

#### **a) Missing EntityDef 'name' Field**

**Before**:
```typescript
// Only minimal fields sent
{ 
    id: "warrior_1", 
    entityClass: "warrior", 
    stats: [...]  
    // ❌ Missing: name, start_date, appearance_acquires, appearance_index
}
```

**After**:
```typescript
// Complete EntityDef with all fields
{
    class: "tbs.srv.data.EntityDef",
    id: "warrior_1",
    entityClass: "warrior",
    name: "Thales",  // ✅ Restored
    stats: [
        { class: "tbs.srv.data.Stat", stat: "RANGE", value: 1 },
        { class: "tbs.srv.data.Stat", stat: "STRENGTH", value: 15 },
        { class: "tbs.srv.data.Stat", stat: "KILLS", value: 148 },  // ✅ Included
        { class: "tbs.srv.data.Stat", stat: "BATTLES", value: 154 },  // ✅ Included
        // ... all stats
    ],
    start_date: 1610826014832,  // ✅ Restored
    appearance_acquires: 0,  // ✅ Restored
    appearance_index: 0  // ✅ Restored
}
```

#### **b) Scene Field**

**Before**:
```typescript
scene: "rand"  // ❌ Incorrect
```

**After**:
```typescript
scene: "greathall"  // ✅ Matches official protocol
```

#### **c) Timer Values**

**Before**:
```typescript
timer: 45  // ❌ Hardcoded same for both players
```

**After**:
```typescript
timer: idx === 0 ? 30 : 45  // ✅ Player 1 gets 30s, Player 2 gets 45s
```

**Impact**: BattleCreateData now matches official protocol exactly. Game client successfully deserializes without crashing. Protocol-compliant battle initialization.

**Test**: Start battle → no client crash → both players render units correctly.

---

## ✨ Improvements

### Logging & Debugging
- Added comprehensive battle initialization logging
  - `[BATTLE]` prefix for battle events
  - `[MATCHMAKING]` prefix for queue events
- Clarified protocol requirements in code comments
- Documented which fields must match official format

### Code Quality
- Removed unnecessary field sanitization (now sends complete objects)
- Improved error messages in queue matching
- Better variable naming (filteredDefs, queueSizeBefore, queueSizeAfter)

---

## ✅ Verification

### Full Battle Flow (Local 2-Player Testing)

1. ✅ **Login**: Test (123456) and Pieloaf (293850) authenticate
2. ✅ **Queue**: Both players join QUICK queue
3. ✅ **Matchmaking**: First-come-first-served matching finds both players
4. ✅ **Battle Creation**: BattleCreateData generated with both parties
5. ✅ **Data Delivery**: Clients receive BattleCreateData via long-polling
6. ✅ **Game Start**: Both players see greathall scene with units rendered
7. ✅ **Party Display**: Each player sees 6 units (not 1)
8. ✅ **Deployment**: Players configure unit positions
9. ✅ **Sync**: Turn synchronization messages exchange
10. ⏳ **Movement**: Test player can move; Pieloaf restricted (UI modal blocking)

### Protocol Alignment (Verified Against Official)

- Battle ID: ✅ 20 hex characters
- Reliable Message IDs: ✅ Format `{battle_id}_{action}_{user_id}`
- EntityDef: ✅ All required fields (id, entityClass, name, stats, start_date, appearance_*)
- BattlePartyData: ✅ All required fields (user, team, display_name, defs, elo, power, session_key, timer, etc.)
- Timer Values: ✅ 30s for player[0], 45s for player[1]
- Scene: ✅ "greathall"

---

## ⏳ Known Issues

### 1. Second Player Movement Restriction
- **Status**: 🔴 BLOCKING
- **Symptom**: Pieloaf player cannot move units despite server receiving move requests
- **Likely Cause**: Client UI modal blocking interaction (not server-side bug)
- **Workaround**: Close modal manually or investigate client-side move validation
- **Next Steps**: Add move request logging to debug opponent lookup and permission checks

### 2. In-Memory Data (Not Persisted)
- **Status**: 🟠 MEDIUM
- **Symptom**: All sessions, battles, queue entries lost on server restart
- **Cause**: No database integration
- **Impact**: Testing limited to single session; server restarts during development lose active games
- **Timeline**: Fixed in Phase 2 (Database Integration)

### 3. Hardcoded Test Data
- **Status**: 🟡 LOW
- **Symptom**: Limited to 2 test users; new accounts require manual JSON edit
- **Cause**: No user registration system
- **Impact**: Multi-user testing limited
- **Timeline**: Fixed in Phase 3 (User Registration)

### 4. No Session Cleanup
- **Status**: 🟡 LOW
- **Symptom**: Sessions persist indefinitely; orphaned battles never cleaned
- **Cause**: No idle timeout or cleanup job
- **Impact**: Memory leaks on long-running servers
- **Timeline**: Fixed in Phase 2 (Session Cleanup)

---

## 🧪 Recommended Testing

### For This Release

**Scenario 1: Full Battle Match**
```
1. Launch: & '.\The Banner Saga Factions.exe' --debug --server http://localhost:8082/ \
    --username test,Pieloaf --factions --developer --steam_id 123456,293850 --steam true
2. Both players queue (QUICK mode)
3. Match should be found immediately
4. Both players see greathall with 6 units each
5. Deploy units and attempt moves
```

**Scenario 2: Battle Exit**
```
1. Complete battle or abandon
2. Click "Exit Battle"
3. Should return to main menu without timeout
```

**Scenario 3: Protocol Verification**
```
1. Capture traffic with Fiddler
2. Compare BattleCreateData structure with data/game_captures/extracted/raw/0058_s.txt
3. Verify: EntityDef has 'name', scene="greathall", parties array populated
```

### For Next Release

- Multi-player testing across internet (after database integration)
- Session persistence after server restart
- Queue timeout behavior (5-min auto-dequeue)
- New user registration flow

---

## Impact Summary

| Bug | Before | After | Severity |
|---|---|---|---|
| 1. Array index syntax | Crash on unit death | Unit tracking works | 🔴 CRITICAL |
| 2. Party filtering | 1/6 units visible | 6/6 units visible | 🔴 CRITICAL |
| 3. Missing HTTP response | Client hangs on exit | Clean battle exit | 🔴 CRITICAL |
| 4. Parties array vs object | Opponent not found | Opponent found | 🔴 CRITICAL |
| 5. Queue cleanup | Ghost queue entries | Queue always clean | 🔴 CRITICAL |
| 6. GameRouter disabled | No data delivered | Long-poll works | 🔴 CRITICAL |
| 7. Protocol misalignment | Client crash on parse | Battle loads correctly | 🟠 HIGH |

---

## Lessons Learned

1. **Type safety**: TypeScript would have caught `indexOf[...]` vs `indexOf(...)` with `noImplicitAny`
2. **Commented-out code**: Active development comments must be cleaned up or marked `// TODO` — silent no-ops are hard to find
3. **HTTP basics**: Every Express endpoint must send a response; missing `res.send()` is a common mistake
4. **Data structure intent**: `{}` for key-value maps, `[]` for ordered lists — initializing wrong and using right silently corrupts state
5. **Protocol compliance**: Reverse-engineer the exact wire format before implementing — the client has no tolerance for missing fields

## Prevention Strategies

- [ ] Enable strict TypeScript (`strict: true` in `tsconfig.json`)
- [ ] `yarn build` must pass before committing (already enforced)
- [ ] Protocol tests against Fiddler captures in `data/game_captures/extracted/raw/`
- [ ] Integration tests for full login → queue → battle flow (see `docs/Test-Framework-Plan.md`)

---

## 📚 References

- **Official Protocol**: `data/game_captures/extracted/raw/0058_s.txt`
- **Battle Flow**: `docs/gameFlow.md`
- **Data Structures**: `docs/dataStructures.md`
