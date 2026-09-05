# Development Guide

## Local Setup

### Prerequisites
- Node.js 24+ ([Download](https://nodejs.org/))
- Yarn or npm
- Banner Saga Factions game (Steam)
- Fiddler Classic (optional, for protocol debugging)

### Installation

```powershell
# Clone repository
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server

# Install dependencies
yarn install
# or
npm install

# Create and fill .env file (REQUIRED — server throws at startup without JWT_SECRET)
Copy-Item .env.example .env
```

### Database Setup

No setup needed. The server uses **SQLite** via Node's built-in `node:sqlite` module. On first startup, `src/db/connection.ts` automatically creates `data/bsf.db` and all tables.

Fill in `DB_PATH` (optional — defaults to `./data/bsf.db`) and `JWT_SECRET` in `.env`.

### Run Server

```powershell
# Compile then start (recommended)
yarn build
.\start-server.bat

# Development mode (auto-restart on file changes, no .env preflight)
yarn dev
```

Server runs on `http://localhost:8082`

---

## Testing

### Automated Tests

The test suite uses [vitest](https://vitest.dev/) + supertest. All tests mock the DB layer — no database connection needed.

```powershell
yarn test           # Run all tests once (~3s)
yarn test:watch     # Watch mode — re-runs on save
yarn test:coverage  # Tests + HTML coverage report in coverage/
yarn test:ci        # Verbose output + coverage (used in CI)
```

**Test layout:**

| File | What it tests |
|------|--------------|
| `src/const.test.ts` | Protocol string constants |
| `src/db/account.test.ts` | `parseRow()` JSON parsing |
| `src/services/auth/auth.test.ts` | Session shape, sessionHandler CRUD, `getInitialData()` |
| `src/services/queue.test.ts` | Matchmaking pairing logic |
| `src/services/battle/Battle.test.ts` | Constructor, aliveUnits, `setReliableMessageData()` |
| `test/routes/auth.test.ts` | Login, logout, session middleware |
| `test/routes/account.test.ts` | Account info, party/roster update validation |
| `test/routes/queue.test.ts` | Queue join, duplicate guard, vs_type validation |
| `test/routes/battle.test.ts` | Kill recording, endgame winner, exit flow |

Coverage thresholds (enforced): 70% lines, 70% functions, 60% branches.

### Manual Testing

> **Path note for contributors:** Commands in this section use `$env:USERPROFILE\Code\BSF\bsf-server` as the server root. If you cloned elsewhere, replace that part with your actual path (e.g. `C:\Users\yourname\projects\bsf-server`).

> **to add renown to accounts for testing**
   sqlite3 $env:USERPROFILE\Code\BSF\bsf-server\data\bsf.db "UPDATE accounts SET renown=1000 WHERE user_id='76561198354572136'; SELECT user_id, username,renown, roster_rows FROM accounts WHERE user_id='76561198354572136';"

   sqlite3 $env:USERPROFILE\Code\BSF\bsf-server\data\bsf.db "UPDATE accounts SET renown=100;"

To test the game against the custom server:
- Launch the game from the banner saga factions directory using the following commands.

### Which screen a launch command lands on

Six of the game's launch options write the same single setting — `--run_mode`, `--kiosk`, `--beta`,
`--developer`, `--factions` and `--versus_start`. Each one overwrites it, nothing on screen says so,
and **whichever of the six comes last is the one that counts.** Where you arrive follows from that:

| Last run-mode option on the line | Where you land |
| --- | --- |
| `--factions` | the town |
| `--versus_start` | the match search, already queued — it **skips the town** |
| `--developer`, or none of the six at all | the main menu |

**The main menu is not a dead end.** Clicking the combat option there carries on to wherever the line
would have gone anyway — the town, or the match search if a match was asked for. So ending on
`--developer` costs one click, and buys developer mode: every unit class unlocked for hire and
promotion, and the debug console's on-screen button.

**`--versus_start` sets two things, and only one of them can be taken back.** It sets the run mode
*and* asks for a match, and that second half is never cleared afterwards. So a line with
`--versus_start` early and `--developer` last keeps **both** — developer privileges, and the match
search one click from the main menu. That is the combination a two-client developer test needs.
*(Traced through the code, not yet run — confirm it before relying on it.)*

Two more things before copying any line below. The game reads only `--flag` and `--flag value` —
never `--flag=value`, and never a bare `key=value`. And while it logs every word it is given, it
never says which ones it failed to recognise — those are simply skipped, so the command still runs,
just not as intended. That is how `--quickload`, which exists nowhere in the game, survived in seven
of the commands below for years.

*Technical: `GameMainAir.as:412-536` parses the six run-mode flags; `:714` sets `startInFactions` on
an exact `runMode == RunMode.FACTIONS` test; `ReadyState` enters `FactionsState` only when that is
true; `MainMenuPage.combatClickHandler` is the one click out. Complete flag table:
`bsf-client/docs/architecture.md` → "Boot sequence"
([local](../../bsf-client/docs/architecture.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/architecture.md)).*

### Single Client Test

```powershell
# Terminal 1: Start server
cd $env:USERPROFILE\Code\BSF\bsf-server
yarn dev

# Terminal 2: Launch game
cd "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"

# Single player (localhost) — --developer is the last run-mode option, so this lands at the MAIN
# MENU with developer mode on. One click on the combat option reaches the town from there.
# See "Which screen a launch command lands on" above.
& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --debug --factions --developer --steam false --steam_id 123456 --username test

# 2-player match (localhost) — --versus_start is the last run-mode option, so this goes straight
# to the MATCH SEARCH and queues, skipping the town, and cancels --developer along the way: no
# developer privileges. Keep --versus_start --versus_countdown 0 for 2-on-one-PC (see
# § Two-Player Local Test below).
& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --debug --factions --developer --steam false --username test,Pieloaf --steam_id 123456,293850 --versus_start --versus_countdown 0

# Same, with a real Steam id for the second player. Also goes straight to the MATCH SEARCH;
# --developer is cancelled by the later --versus_start.
& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --factions --developer --debug --steam false --username test,ElTaino --steam_id 123456,76561198354572136 --versus_start --versus_countdown 0

# Remote server — requires https:// prefix and --steam true (bare hostname or http:// will fail)
& '.\The Banner Saga Factions.exe' --server https://your.domain.here/ --steam true --factions
```


### Internet Multiplayer Testing

Use the `/internet-test` skill to open a Cloudflare tunnel, then paste one of these into Steam Launch Options.

In all four lines below `--versus_start` is the last run-mode option, so it cancels the `--developer`
before it and no launch here has developer privileges. The first three go straight to the match
search and queue, skipping the town. The fourth does not get that far — see the note under it. See
[Which screen a launch command lands on](#which-screen-a-launch-command-lands-on) above.

#### Localhost 2-player match
```
--server http://localhost:8082/ --debug --factions --developer --steam false --username test,Pieloaf --steam_id 123456,293850 --versus_start --versus_countdown 0
```

#### Localhost 2-player match with long steamid
```
--server http://localhost:8082/ --debug --factions --developer --steam false --username Gandalf,Dumbeldore --steam_id 76561198354572128,76561198077631330 --versus_start --versus_countdown 0
```

#### CF tunnel — 2-player match (replace URL with tunnel URL from `/internet-test`)
```
--server https://<tunnel-url>/ --debug --factions --developer --steam false --username test,Pieloaf --steam_id 123456,293850 --versus_start --versus_countdown 0
```

#### CF tunnel — single player (needs a player id adding, see below)
```
--server https://<tunnel-url>/ --debug --factions --developer --steam false --versus_start --versus_countdown 0
```

> **This one passes no player identity, so it stops at the login screen** — Steam is off and, unlike
> the three lines above, there is no `--steam_id`. Nothing signs it in by itself, because automatic
> sign-in belongs to a run mode this line never uses. Add `--steam_id 123456` (any number) and it
> behaves like the others.

To connect to the production GCP server instead of a tunnel, see [Deployment.md](Deployment.md) → Connecting Game Clients.

---

### Two-Player Local Test (Same Machine)

> **⚠️ 2-on-one-PC requirement:** Every 2-player launch command in this section includes `--versus_start --versus_countdown 0`. Those flags are **not optional** on a single-PC test setup — FMOD's audio extension only initializes for the first client, the second falls back to silent mode, and without the flags the audio-enabled client hangs at the battle "loading" screen forever (the local `POST /services/battle/ready` never fires). See [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) and [BSF-Client#7](https://github.com/Banner-Saga-Factions/BSF-Client/issues/7). Two real machines do not hit this — each gets real FMOD.

**Option A — use the launch script (recommended)**:

```powershell
# Terminal 1: Start server
cd $env:USERPROFILE\Code\BSF\bsf-server ; .\start-server.bat
```

```powershell
# Terminal 2: Launch 2-player game (6 units per side)
cd $env:USERPROFILE\Code\BSF\bsf-server ; .\launch-game-2p.ps1

# 1 unit per player (quick battle)
cd $env:USERPROFILE\Code\BSF\bsf-server ; .\launch-game-2p-quickbattle.ps1
```

**Option B — headless API smoke test** (no game client needed):
```powershell
cd $env:USERPROFILE\Code\BSF\bsf-server ; .\test-2p-match.bat
```

Expected output (passing):
```
[1/6] Checking server is reachable on port 8082...
[OK]   Server is up.
[2/6] Login Player 1 (test / steam_id=123456)...
[OK]   P1 session_key = <hex>
[3/6] Login Player 2 (Pieloaf / steam_id=293850)...
[OK]   P2 session_key = <hex>
[4/6] Queueing Player 1 for QUICK match...
[OK]   Player 1 queued.
[4/6] Queueing Player 2 (triggers matchmaking)...
[OK]   Player 2 queued. Matchmaking should have fired.
[5/6] Polling Player 1 for BATTLE_CREATE_DATA...
[OK]   Battle created! battle_id = <hex>
[6/6] Polling Player 2 for BATTLE_CREATE_DATA...
[OK]   Player 2 confirmed same battle_id = <hex>

RESULT: PASS — Battle <hex> created successfully
```

If step 5 shows `[FAIL] No BATTLE_CREATE_DATA received`, the most common cause is a power-level mismatch: both accounts must have the same total `(RANK-1)` sum across their party units. Check the server console for `[MATCHMAKING]` lines.

**Option C — manual launch**:
```powershell
# Terminal 1: Start server
cd $env:USERPROFILE\Code\BSF\bsf-server ; yarn build ; .\start-server.bat

# Terminal 2: Launch both clients
cd "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"

# --versus_start is the last run-mode option, so this goes straight to the MATCH SEARCH and
# queues, skipping the town, and cancels --developer.
# Previously written `--steam --steam_id 123456,293850 true`, which switched Steam OFF and threw both
# player ids away: --steam takes the very next word as its value, so it swallowed --steam_id.
& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --username test,Pieloaf --factions --developer --debug --steam true --steam_id 123456,293850 --versus_start --versus_countdown 0
```
**Expected Flow**:
1. Two game clients launch in same window
2. Both login (left: test, right: Pieloaf)
3. Both enter queue
4. Immediate match (type + power bracket)
5. BattleCreateData sent to both
6. Battle scene loads with 6 units visible per player
7. ✅ Both players can move and fight
8. ✅ Post-match: renown awarded, result written to the SQLite `battle` table

---

### Release-Zip Smoke Test

Validates the end-user distribution path documented in
[Client Distribution → Creating the GitHub Release Zip](#creating-the-github-release-zip).
Run this after cutting a new `BannerSagaFactions-client.zip` to confirm the
artifact actually launches against a fresh server.

The launch strings below match `README.txt` shipped inside the zip — keep them
in sync if you change either.

```powershell
# Terminal 1: Start server
cd $env:USERPROFILE\Code\BSF\bsf-server
yarn build ; .\start-server.bat       # Windows; use ./start-server.sh on macOS/Linux
```

**Single player from the extracted zip** (no Steam install required):

```powershell
cd <extracted-zip-folder>
# --developer is the last run-mode option: lands at the MAIN MENU with developer mode on, and one
# click on the combat option reaches the town.
"The Banner Saga Factions.exe" --steam true --steam_id 123456 --server http://localhost:8082/ --factions --developer
```

Replace `123456` with any unique number (this is the player ID). Replace
`localhost:8082` with the server address if testing against a remote host.

**Two-player from the extracted zip** (same machine):

```powershell
# Goes straight to the MATCH SEARCH and queues, skipping the town; --versus_start cancels --developer.
"The Banner Saga Factions.exe" --steam true --steam_id 123456,293850 --server http://localhost:8082/ --factions --developer --username test,Pieloaf --versus_start --versus_countdown 0
```

**Expected flow**:
1. Game launches without an Adobe AIR install prompt (runtime is bundled)
2. Login completes against the local server
3. Both players enter the queue and immediately match
4. Battle scene loads with 6 units per side

If login fails with "Connection refused", the server isn't reachable from the
extracted folder's working directory — confirm port 8082 is free
(`netstat -ano | findstr :8082`) and that any firewall prompt was accepted.

---

## Debug Tips

### View Server Logs

The server logs important events with prefixes:

```
[BATTLE] User 123456: party has 6 unit IDs, roster has 7 units, filtered to 6 units
[MATCHMAKING] Checking power level...
[MATCHMAKING] Found opponent, creating battle...
[MATCHMAKING] Battle created between 123456 and 293850
```

**To increase verbosity**:
- Add `console.log()` statements in specific endpoints
- Restart server with `yarn dev`

### Debug Routes

Four debug-only HTTP routes are exposed at `/debug/*`. All are gated by the `NODE_ENV !== "production"` guard in `src/app.ts -> the debug-router block`, so they return 404 on the production GCP server and are reachable only when running locally (`yarn dev` or `start-server.bat`).

All examples below use `Invoke-RestMethod` because PowerShell mangles `curl -d '{\"key\": "value"}'` — the backslash-escapes are bash-only and reach the server literally.

#### `/debug/party-limit` — temporarily cap roster size

Trims every party served to the client to the first N units. Useful when reproducing single-unit or small-party bugs without editing `data/acc.json`. Pass `null` (or omit `limit`) to clear the cap.

```powershell
# Cap parties to 1 unit
Invoke-RestMethod -Uri http://localhost:8082/debug/party-limit -Method Post -ContentType "application/json" -Body '{"limit": 1}'

# Clear the cap (back to normal 6 units)
Invoke-RestMethod -Uri http://localhost:8082/debug/party-limit -Method Post -ContentType "application/json" -Body '{"limit": null}'
```

Setter: `setDebugPartyLimit()` in `src/services/battle/Battle.ts`.

#### `/debug/fast-timer` — shrink per-turn timer to 15s

Shortens each player's turn to a flat 15s instead of the length they asked for. Defaults to ON in dev / OFF in production. Useful when testing the stall-surrender path or just running iterations faster.

**It deliberately leaves a request for _no_ clock alone.** A player who chose "Zero" in the friend lobby still gets no clock here, because this switch is on by default on every developer machine — including in the test run — and rewriting a zero to 15s would make issue #213 impossible to reproduce or test locally.

```powershell
# Turn fast timer ON (15s per turn, except for players who asked for no clock)
Invoke-RestMethod -Uri http://localhost:8082/debug/fast-timer -Method Post -ContentType "application/json" -Body '{"enabled": true}'

# Turn fast timer OFF (each player gets the length they asked for)
Invoke-RestMethod -Uri http://localhost:8082/debug/fast-timer -Method Post -ContentType "application/json" -Body '{"enabled": false}'
```

Setter: `setDebugFastTimer()` in `src/services/battle/Battle.ts`; the flag is read by `resolveTurnTimer()` in the same file when building `BattlePartyData.timer`.

#### `/debug/renown` — add or subtract renown for a session

Adjusts a logged-in player's renown by `amount` (positive or negative). Identify the player by either `session_key` (preferred — exact match) or `account_id` (32-bit). The session must already be active — the route returns 404 if the player isn't currently logged in.

```powershell
# Add 100 renown to the player whose session_key is shown in the login response
Invoke-RestMethod -Uri http://localhost:8082/debug/renown -Method Post -ContentType "application/json" -Body '{"session_key": "abcdef0123456789abcdef0123456789", "amount": 100}'

# Subtract 50 renown from account_id 123456 (the 32-bit BSF id, not the raw Steam id)
Invoke-RestMethod -Uri http://localhost:8082/debug/renown -Method Post -ContentType "application/json" -Body '{"account_id": 123456, "amount": -50}'
```

The response is `{"renown": <new total>}`. The new total is written to the DB and reflected in `session.accountData.renown` immediately. Note: the running client's on-screen renown counter is only refreshed by routes that push a `RenownMsg` (e.g. `/unit/retire`); this debug route does not push, so the client will only see the change after its next `/account/info` call.

### Capture Network Traffic

Use Fiddler Classic to monitor game ↔ server communication:

1. **Install Fiddler Classic**: [Download](https://www.telerik.com/fiddler/fiddler-classic)
2. **Configure game**: Add `--fiddler` or just run Fiddler before game
3. **View captured data**:
   - Right-click request → "Inspectors" tab
   - Switch to "TextView" to see JSON payloads
   - Compare with `data/game_captures/extracted/raw/*.txt`

### Common Issues & Fixes

#### Issue: "Connection refused" 
```
Error: Cannot connect to http://localhost:8082
```
**Fix**: 
- Check server is running: `yarn dev` in Terminal 1
- Verify port 8082 is not in use: `netstat -ano | findstr :8082`

#### Issue: "Invalid steam ID"
```
Error: User 123456 not found in accounts.json
```
**Fix**:
- Verify `data/accounts.json` has the test accounts:
  ```powershell
  Get-Content data\accounts.json | ConvertFrom-Json | Select-Object username, user_id
  ```
- Expected output:
  ```
  username  user_id
  --------  -------
  test       123456
  Pieloaf    293850
  ```

#### Issue: "Battle starts but game crashes"
```
Error: Cannot read property 'id' of undefined
```
**Fix**:
- Entity DEF fields missing (protocol issue)
- Check Battle.ts line 85-90: `filteredDefs` should have all 6 units
- Verify `data/acc.json` has roster with units

#### Issue: "News of the Banner" popup every session

**Symptom**: A "News of the Banner" modal appears on the main menu every time the game launches, even for returning players.

**Cause**: The popup is purely client-side — the server sends no data to trigger or suppress it. The game reads the `news_date` property from `global_0.sol` (a Flash Local Shared Object) and shows the popup if the property is missing or if its day-of-month is earlier than the last news article's day-of-month. `Date.date` in ActionScript returns 1–31 (day of month, not a full timestamp), so any stored date whose day component is 31 suppresses the popup permanently. A fresh install or any event that resets `global_0.sol` loses `news_date` and brings the popup back. What triggers the reset is not yet known.

**Multi-client note**: SOL files are keyed by Adobe AIR wrapper index, not by user (`GameConfig.as:296` — `new PrefBag("global_" + param6, ...)`). Single-client launch reads `global_0.sol` only. Dual-client launch (`--username a,b`) reads `global_0.sol` for the **left** window and `global_1.sol` for the **right** window — each window needs its own patch. (An earlier troubleshooting note here claimed `global_1.sol` was unrelated to the popup; that was based on single-client testing only and was wrong.)

**Fix**: Run `bsf-server/fix-news-popup.ps1` from a PowerShell window:

```powershell
.\fix-news-popup.ps1                       # auto: use bak if available, otherwise synthetic
.\fix-news-popup.ps1 -Mode bak             # require bak; error if missing
.\fix-news-popup.ps1 -Mode synthetic       # force a hard-coded 2040-01-31 date
.\fix-news-popup.ps1 -SolName global_1     # patch the second-instance SOL (dual-client right window)
```

Modes:
- **`bak`** — extracts the real `news_date` from `global_0.sol.bak` and copies it into `global_0.sol`. Preserves the last-seen-news date the client previously stored.
- **`synthetic`** — writes a hard-coded `news_date` of `2040-01-31`. Day-of-month is 31, which is the maximum any month can have, so the client's day-of-month comparison can never trigger the popup again. Use this on a clean install where no bak exists.
- **`auto`** (default) — picks `bak` if `global_0.sol.bak` is present, otherwise falls back to `synthetic`.

The script backs up the current `global_0.sol` to `global_0.sol.bak2` before writing, so any mistake is one `Copy-Item` away from being undone. See [`fix-news-popup.ps1`](../fix-news-popup.ps1) for the AMF3 byte-layout details and the length-header rewrite logic.

---

#### Issue: "Second player can't move"
```
Action sent but no response; units frozen
```
**Fix**:
- This is a **known UI modal issue** (not server bug)
- See [Known Issues](#known-issues) section below
- Debug: Check server logs for move endpoint being called

If you see nothing wrong on the server and no errors in network traffic it can be useful to check the client logs which, on Windows, are located in %AppData%/TheBannerSagaFactions\Local Store\logs with A-0.log.txt being the most recent session logs.

#### Issue: Tutorial appears every session despite `completed_tutorial = 1` in the DB

**Cause**: `AccountInfoTxn` builds the account-info object by running the client's `EntityDefVars.fromJson()` on **every** unit it receives — both the `purchasable_units` from `data/acc.json` *and* the player's saved roster from the DB. If `fromJson()` throws an `ArgumentError` on *any* unit, `AccountInfoTxn` silently catches it, the whole entity list fails to build, and `config.accountInfo` is left at its unset default (`completed_tutorial = false`). The tutorial then fires on every login no matter what the DB says — the client never gets far enough to read the DB value. Two distinct things make `fromJson()` throw, and both look identical from the server (no server log, DB value looks correct):

- **Unknown entity class** — the unit's `entityClass` is absent from the client's class registry (`character_classes.json.z`). Error text: `no such entity class: <name>`.
- **Unknown ability id** — the class *exists*, but an ability it references in `attacks`/`actives` is absent from the ability registry (`_ability_index.json.z`). Error text: `invalid/unknown ability id <name>`, thrown from `AbilityDefFactory.fetch()` via `EntityDef.setupClassAbilities()`.

**Diagnose**: Read the client log at `%APPDATA%\TheBannerSagaFactions\Local Store\logs\A-0.log.txt`. Bad units show as `EntityListDefVars Failed to load entity def: ArgumentError: ...`, followed by `AccountInfoAction fail: Error: Failed to load entity list. Errors: N`. The `ArgumentError` text identifies which of the two causes you have; `N` is how many units are affected.

**Fix**: Depends on the error.

- *Unknown entity class* — remove the offending unit or add its class to `character_classes.json.z`. The unit can be in `acc.json`'s `purchasable_units` **or** in the player's saved DB roster — check both.
- *Unknown ability id* — register the missing ability in `_ability_index.json.z` (and ship its def file), or repoint the class's `attacks`/`actives` back to an ability that already exists.

**Worked example (2026-06-05):** the `spearman` class's `attacks` had been repointed to a custom `abl_spear_str`, but that ability was never added to `_ability_index.json.z`. Two promoted spearmen sat in the test account's **DB roster** (not `acc.json`), so the log showed `invalid/unknown ability id abl_spear_str` twice and `Errors: 2`. Registering the ability in the manifest fixed it. Editing `acc.json` would have done nothing, because the bad units were in the roster.

**A brand-new account no longer plays the tutorial at all** (#230). It is created already marked as having done it, so there is nothing to skip — the three-step procedure that used to live here is no longer needed for a fresh dev account. To get the tutorial back for new accounts, set `SKIP_TUTORIAL=false` in `.env` and restart. To watch the tutorial without changing the server at all, launch the game with its own `--tutorial` flag, which plays it whatever the server says.

**Skipping it on an account that already exists** (created before #230, or one part-way through) still needs the manual route, because the value is only ever written when the row is created:
1. From within `bsf-server/`, run: `sqlite3 data/bsf.db "UPDATE accounts SET completed_tutorial = 1"`
2. Restart the server — `session.accountData` is cached in memory for the life of the session, so a running server will keep serving the old value.

Note this is a *repair*, not a skip: if the tutorial is firing on an account whose database row already says `1`, the `UPDATE` will change nothing and the cause is the account-info build failure diagnosed above, not the flag.

---

## Build & Compile

### TypeScript Compilation

```powershell
# Build to JavaScript (outputs to build/ directory)
yarn build

# Run compiled version
node build/index.js
```

### Production Build

```powershell
# Build with optimizations (requires docker)
docker build -t bsf-server:0.1.0 .
docker run -p 8082:8082 bsf-server:0.1.0
```

---

## Client Distribution (Phase 7)

### Game Client Notes

The Steam release ships the game as a **captive Adobe AIR runtime** bundle — the `Adobe AIR/` subfolder inside `win32/` contains the runtime. End users do not need to install Adobe AIR separately.

Steam location on Windows: `C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32\`

### Creating the GitHub Release Zip

1. Copy the entire `win32\` folder
2. Add a `README.txt` inside with launch instructions (see below)
3. Zip the folder as `BannerSagaFactions-client.zip`
4. Upload to GitHub → Releases → `client-v1.0`

**README.txt template**:
```
Banner Saga Factions — Community Server Client

Extract anywhere and run:
  "The Banner Saga Factions.exe" --steam true --steam_id <any_number> --server http://<server-url>/ --factions --developer

That takes you to the main menu. Click the combat option there to enter the town.

For local testing (server running on same machine):
  "The Banner Saga Factions.exe" --steam true --steam_id 123456 --server http://localhost:8082/ --factions --developer

Server repo: https://github.com/Banner-Saga-Factions/BSF-Custom-Server
```

The file that actually ships is [`data/client-README.txt`](../data/client-README.txt); the block above
is an abridged copy of it. Change the launch lines in both.

---

## Project Structure

```
BSF/
├── src/
│   ├── app.ts                            # Express app, session gate, error catch-all
│   ├── index.ts                          # Process handlers and listen()
│   ├── http/asyncRouter.ts               # Routers that cannot lose an async failure
│   ├── const.ts                          # Enums (ServerClasses, GameModes)
│   ├── services/
│   │   ├── auth/
│   │   │   ├── auth.ts                   # Session class & handler
│   │   │   └── discord.ts                # Discord OAuth
│   │   ├── battle/
│   │   │   ├── Battle.ts                 # Main battle logic
│   │   │   ├── BattlePartyData.ts        # Type definitions
│   │   │   └── BattleTurnData.ts         # Turn data types
│   │   ├── queue.ts                      # Matchmaking logic
│   │   ├── game.ts                       # Long-polling data delivery
│   │   ├── chat.ts                       # Chat service
│   │   ├── account.ts                    # Account info endpoint
│   │   └── download.ts                   # Game client downloads
│   └── build/                            # Compiled JavaScript (generated)
├── data/
│   ├── accounts.json                     # Test user accounts
│   ├── acc.json                          # User roster/party data
│   ├── game_captures/                    # Fiddler captures (protocol reference)
│   ├── first.json                        # Initial data on login
│   ├── lboard.json                       # Leaderboard data
│   └── build-number                      # Server version
├── docs/
│   ├── Development.md                    # This file
│   ├── CHANGELOG.md                      # (moved to repo root)
│   ├── ARCHITECTURE.md                   # System design
│   ├── dataStructures.md                 # Wire-format data structures
│   ├── gameFlow.md                       # Battle lifecycle walkthrough
│   └── serverEndpoints.md                # HTTP API reference
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── README.md                             # Project overview + quick start
```

---

## Key Files to Know

### Battle Flow Files

| File | Purpose |
|------|---------|
| `src/services/battle/Battle.ts` | Main battle class, all endpoints |
| `src/services/queue.ts` | Matchmaking algorithm |
| `src/services/game.ts` | Long-polling delivery |

### Protocol/Data Files

| File | Purpose |
|------|---------|
| `docs/dataStructures.md` | Entity/party/turn data formats |
| `docs/gameFlow.md` | Battle lifecycle |
| `docs/serverEndpoints.md` | HTTP API routes |
| `data/game_captures/extracted/raw/*.txt` | Official protocol reference |

### Test Data

| File | Purpose |
|------|---------|
| `data/accounts.json` | Test users (test, Pieloaf) |
| `data/acc.json` | Party roster with 6 starter units |

---

## Key Gotchas for New Developers

Consolidated into [`FAQ.md`](FAQ.md) (area-tagged: build, sessions, battle, persistence, client registry, …). Symptom-specific troubleshooting with full diagnostics stays above under [Common Issues & Fixes](#common-issues--fixes) — including the "News of the Banner" popup and the "tutorial every session" registry errors.

---

## Common Commands

> All commands below assume your terminal is already in `$env:USERPROFILE\Code\BSF\bsf-server`. Adjust that path to match your local clone.

```powershell
# Development
yarn dev                          # Start with auto-reload
yarn build                        # Compile TypeScript
yarn dev --verbose               # (Note: not implemented, use server logs)

# Automated tests
yarn test                         # Run full suite (~3s, no DB needed)
yarn test:watch                   # Watch mode during development
yarn test:coverage                # Tests + coverage report

# Manual / integration testing
# Launch game (see Manual Testing section above)

# Production
docker build -t bsf-server .
docker run -p 8082:8082 bsf-server
```

---

## Debugging Workflow

### Step 1: Identify Issue

```powershell
# Check server logs for errors
cd $env:USERPROFILE\Code\BSF\bsf-server ; yarn dev
# Look for [ERROR], [CRASH], or missing [BATTLE] logs
```

### Step 2: Add Logging

Edit the relevant file and add `console.log()`:

```typescript
// Example: src/services/queue.ts
const matchmaking = (item: QueueItem, challenger: Session) => {
    console.log(`[DEBUG] matchmaking called for user ${challenger.user_id}`);
    console.log(`[DEBUG] gameQueue length: ${gameQueue.length}`);
    console.log(`[DEBUG] Queue items:`, gameQueue);
    
    // ... rest of function
}
```

### Step 3: Restart & Test

```powershell
# Ctrl+C to stop server
# Ctrl+C again or type 'quit' if ts-node-dev hangs

# Restart
cd $env:USERPROFILE\Code\BSF\bsf-server ; yarn dev

# Run test scenario again
# (Two-player battle in Terminal 2)
```

### Step 4: Read Output

```
[DEBUG] matchmaking called for user 123456
[DEBUG] gameQueue length: 2
[DEBUG] Queue items: [
  { account_id: 123456, type: 'QUICK', power: 5 },
  { account_id: 293850, type: 'QUICK', power: 5 }
]
[MATCHMAKING] Found opponent...
```

### Step 5: Fix & Commit

Once fixed:
```powershell
git add src/services/queue.ts
git commit -m 'Fix [plain-English description of what changed and why]'
git push origin <your-branch-name>
```

---

## Testing Checklist

### Local 2-Player Battle

- [ ] **Login Phase**
  - [ ] Both players login successfully
  - [ ] Sessions created with unique session_keys
  - [ ] Display names shown (test, Pieloaf)

- [ ] **Queue Phase**
  - [ ] Both join QUICK queue
  - [ ] Server immediately finds match (first-come-first-served)
  - [ ] Both removed from queue

- [ ] **Battle Initialization**
  - [ ] BattleCreateData sent to both via /game long-polling
  - [ ] No client crash (protocol aligned)
  - [ ] Battle scene loads ("greathall")

- [ ] **Battle UI**
  - [ ] Both players visible in scene
  - [ ] 6 units visible per player (not 1, not blank)
  - [ ] Unit names display (Thales, Solon, etc.)
  - [ ] Unit stats visible (health, armor, etc.)

- [ ] **Deployment**
  - [ ] Player 1 can reposition units
  - [ ] Player 2 can reposition units
  - [ ] Deploy button sends BattleDeployData

- [ ] **Turn Sync**
  - [ ] After deployment, sync messages exchange
  - [ ] No desyncs or crashes
  - [ ] Turn counter increments

- [ ] **Movement** (Known to be partially broken)
  - [ ] Player 1 can move unit
  - [ ] Player 2 attempted move (blocked by UI modal)
  - [ ] Move data reaches server (check logs)

- [ ] **Battle Exit**
  - [ ] Player can exit battle
  - [ ] Returns to main menu without timeout
  - [ ] Battle cleaned up on server

---

## Known Issues

### 1. Limited Test Accounts

**Status**: 🟡 LOW  
**Symptom**: Only 2 test users (test, Pieloaf)  
**Cause**: No user registration system  
**Workaround**: Additional users can be added by logging in with a new `steam_id` — account is seeded automatically via `upsertAccount()`

### 4. Session Cleanup

**Status**: ✅ FIXED  
**Symptom**: Idle sessions were never removed  
**Fix**: Sessions are evicted after 30 minutes of inactivity. The TTL resets on every poll request and every `pushData` call. When a mid-battle player is evicted, the opponent's TTL clock is also reset to prevent cascading eviction.  

---

## Development Status

See [CHANGELOG.md](../CHANGELOG.md) for the full release history. Current open items:

- Ranked-ladder presentation (Elo rating, RANKED matchmaking, and live leaderboards already ship)
- User registration (accounts are created automatically on first Steam login)
- Discord OAuth CSRF fix and `game_id` schema (prerequisite for mobile crossplay — see [Plan-Enable-Mobile-Windows-Crossplay.md](../misc/Plan-Enable-Mobile-Windows-Crossplay.md))

---

## Useful Resources

### Official Fiddler Captures
```
data/game_captures/
  ├── factions.saz                    # Complete match capture
  ├── factionsTrimmed.saz             # Smaller capture
  └── extracted/
      └── raw/
          ├── 0058_s.txt              # BattleCreateData (reference)
          ├── 0116_c.txt              # Deploy request
          ├── 0123_s.txt              # Sync data
          └── ...
```

Use these to compare protocol format when implementing new features.

### Documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [gameFlow.md](gameFlow.md) - Battle lifecycle
- [dataStructures.md](dataStructures.md) - Data formats
- [serverEndpoints.md](serverEndpoints.md) - API routes

### Related Projects
- [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) - Decompile game client
- [Fiddler Classic](https://www.telerik.com/fiddler/fiddler-classic) - Network traffic capture

---

## IDE Setup (VS Code)

### Extensions (Recommended)
- TypeScript Vue Plugin (Volar)
- ESLint
- Prettier - Code formatter
- Thunder Client or REST Client (for API testing)

### Launch Configuration (.vscode/launch.json)
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "ts-node",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "restart": true,
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "preLaunchTask": "npm: build"
    }
  ]
}
```

### Debugging
1. Set breakpoint in VS Code (click line number)
2. Run Launch Configuration (F5)
3. Server will pause at breakpoint
4. Step through code (F10, F11)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Port 8082 already in use" | `lsof -i :8082` (Mac/Linux) or `netstat -ano \| findstr :8082` (Windows) to find process, then kill |
| TypeScript errors | Run `yarn build` to see full compilation errors |
| Game client can't find server | Check firewall; ensure `http://localhost:8082` is accessible from game |
| Battle data doesn't arrive | Check GameRouter is mounted in `src/app.ts` (the `ServiceRouter.use("/game", ...)` line) |
| All units showing as blank | Check `data/acc.json` has complete EntityDef with 'name' field |

---

---

## Game Client Notes

### Adding custom developer console commands

The game client's developer console (`--developer` flag) can be extended with custom ActionScript commands.
Note that the `launch-game-*.ps1` scripts do **not** give you the console's on-screen button, nor
its two developer-only commands (`video` and `tt`): each has `--versus_start` after `--developer`,
which cancels it. The keyboard shortcut still opens the console in any run mode. See
[Which screen a launch command lands on](#which-screen-a-launch-command-lands-on).

1. Open the game client SWF in [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) and navigate to `scripts/game/cfg/GameConfig`.
2. On line ~906, `addShellCmds` registers commands in this format:
   ```actionscript
   this.shell.add("COMMAND_NAME", FUNCTION_TO_CALL);
   ```
3. Add your function and register it in `addShellCmds`. It will then be available in the in-game developer console.

---

---

## Continuous Integration

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request:

1. `yarn install --frozen-lockfile`
2. `yarn build` — TypeScript compile check
3. `yarn test:ci` — full test suite with coverage

No database is required. All tests mock the DB connection layer.

**Pre-commit hook:** `simple-git-hooks` runs `yarn build && yarn test` locally before each commit. It installs automatically when you run `yarn install` (via the `prepare` script).

If you bypass the hook with `git commit --no-verify`, CI will catch failures on push.

---

**Last Updated**: 2026-05-05