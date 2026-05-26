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
start-server.bat

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

To test the game against the custom server:
- Launch the game from the banner saga factions directory using the following commands.

### Single Client Test

```powershell
# Terminal 1: Start server
cd $env:USERPROFILE\Code\BSF\bsf-server
yarn dev

# Terminal 2: Launch game
cd "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"

# Single player (localhost)
& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --debug --factions --developer  fullscreen=false --quickload --steam false --steam_id 123456 --username test

# 2-player match (localhost)
& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --debug --factions --developer --fullscreen=false --quickload --steam=false --username test,Pieloaf --steam_id 123456,293850 --versus_start --versus_countdown 0

& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --factions --developer --debug fullscreen=false --quickload --steam false --username test,ElTaino --steam_id 123456,76561198354572136 --versus_start --versus_countdown 0

# Remote server — requires https:// prefix and --steam true (bare hostname or http:// will fail)
& '.\The Banner Saga Factions.exe' --server https://your.domain.here/ --steam true --factions
```


### Internet Multiplayer Testing

Use the `/internet-test` skill to open a Cloudflare tunnel, then paste one of these into Steam Launch Options:

#### Localhost 2-player match
```
--server http://localhost:8082/ --debug --factions --developer --debug fullscreen=false --quickload --steam false --username test,Pieloaf --steam_id 123456,293850 --versus_start --versus_countdown 0
```

#### Localhost 2-player match with long steamid
```
--server http://localhost:8082/ --debug --factions --developer --debug fullscreen=false --quickload --steam false --username Gandalf,Dumbeldore --steam_id 76561198354572128,76561198077631330 --versus_start --versus_countdown 0
```

#### CF tunnel — 2-player match (replace URL with tunnel URL from `/internet-test`)
```
--server https://<tunnel-url>/ --debug --factions --developer --debug fullscreen=false --quickload --steam false --username test,Pieloaf --steam_id 123456,293850 --versus_start --versus_countdown 0
```

#### CF tunnel — single player, auto-queue
```
--server https://<tunnel-url>/ --debug --factions --developer --debug fullscreen=false --quickload --steam false --versus_start --versus_countdown 0
```

To connect to the production GCP server instead of a tunnel, see [Deployment.md](Deployment.md) → Connecting Game Clients.

---

### Two-Player Local Test (Same Machine)

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

& '.\The Banner Saga Factions.exe' --server http://localhost:8082/ --username test,Pieloaf --factions --developer --debug --steam --steam_id 123456,293850 true --versus_start --versus_countdown 0
```
**Expected Flow**:
1. Two game clients launch in same window
2. Both login (left: test, right: Pieloaf)
3. Both enter queue
4. Immediate match (type + power bracket)
5. BattleCreateData sent to both
6. Battle scene loads with 6 units visible per player
7. ✅ Both players can move and fight
8. ✅ Post-match: renown awarded, result written to SQLite `battles` table

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
"The Banner Saga Factions.exe" --steam true --steam_id 123456 --server http://localhost:8082/ --factions --developer
```

Replace `123456` with any unique number (this is the player ID). Replace
`localhost:8082` with the server address if testing against a remote host.

**Two-player from the extracted zip** (same machine):

```powershell
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

**Cause**: An `entityClass` in `data/acc.json`'s `purchasable_units.units[]` is absent from the client's class registry (`character_classes.json.z`). `AccountInfoTxn` silently catches the `ArgumentError` thrown by `EntityDefVars.fromJson()`, leaving `config.accountInfo` at its unset default (`completed_tutorial = false`). The tutorial fires on every login no matter what the DB contains.

**Fix**: Inspect `data/acc.json` and remove any `purchasable_units` entry whose `entityClass` is not a standard Factions class (archer, axeman, bowmaster, warmaster, shieldmaster, etc.). Restart the server to reload the file.

**Correct procedure to manually skip the tutorial on a dev account**:
1. Log in once — this creates the account row via `upsertAccount()`.
2. From within `bsf-server/`, run: `sqlite3 data/bsf.db "UPDATE accounts SET completed_tutorial = 1"`
3. Restart the server to clear the in-memory session cache.

Running the `UPDATE` before the first login silently affects zero rows; the account is then created fresh on login with the default `completed_tutorial = 0`.

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

For local testing (server running on same machine):
  "The Banner Saga Factions.exe" --steam true --steam_id 123456 --server http://localhost:8082/ --factions --developer

Server repo: https://github.com/Banner-Saga-Factions/BSF-Custom-Server
```

---

## Project Structure

```
BSF/
├── src/
│   ├── index.ts                          # Express app setup, routing
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

Things that trip up contributors who are new to the codebase:

**`first.json` is cached at module load, not on every request.**
Changes to `data/first.json` require a full server restart to take effect — `yarn dev` hot-reload is not enough. Always use `start-server.bat` after changing any static data file.

**`start-server.bat` vs `yarn dev` — when to use each.**
`yarn dev` gives you hot-reload during active development. `start-server.bat` compiles TypeScript and starts a clean process — use it for functional testing. Running a stale compiled build is the #1 cause of "my change isn't working."

**Session key `"11"` is a hardcoded login bypass, not a bug.**
`POST /services/auth/login/11` skips session-key auth and is how the game client logs in. Any other path segment requires a valid session key. This is intentional.

**32-bit `account_id` vs 64-bit Steam ID — use the right one in the right place.**
`session.account_id` is the 32-bit value used in all battle messages (`party.user`, `team`, `user_id` fields, `aliveUnits` keys). `session.user_id` is the raw 64-bit Steam ID stored in the DB. Mixing them causes the DJB hash to diverge at turn 0 and the game shows a desync error. See `ARCHITECTURE.md` → Key Design Decisions for the full explanation.

**Blank units in battle usually mean `data/acc.json` is missing a `name` field.**
Every `EntityDef` in `acc.json` must have a `name` property. The client silently renders a blank unit if `name` is absent.

**`session.accountData` is the in-memory source of truth during a session.**
DB writes (`saveParty()`, `saveRoster()`) are async and fire-and-forget. Reading back from the DB mid-session will give you stale data. Always work from `session.accountData` and let the DB catch up.

**Every `entityClass` in `acc.json` `purchasable_units` must exist in the client's class registry.**
The client's `EntityDefVars.fromJson()` throws `ArgumentError("no such entity class: <name>")` for any class absent from its bundled `character_classes.json.z` registry — this is a hard error, not a silent skip. The exception is caught invisibly inside `AccountInfoTxn`; `config.accountInfo` is never updated, so `config.accountInfo.completed_tutorial` stays at its default (`false`), and the tutorial appears on every login regardless of what the database contains. No server log, no client alert, and the DB value looks correct. This is separate from the `RunMode.isClassAvailable()` whitelist check, which happens *after* the class registry lookup and genuinely skips silently. Only add a class to `purchasable_units` after confirming it appears in `character_classes.json.z`.

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

- Ladder / ELO ranking
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
| Battle data doesn't arrive | Check GameRouter is enabled in `src/index.ts` line 71 |
| All units showing as blank | Check `data/acc.json` has complete EntityDef with 'name' field |

---

---

## Game Client Notes

### Adding custom developer console commands

The game client's developer console (`--developer` flag) can be extended with custom ActionScript commands.

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