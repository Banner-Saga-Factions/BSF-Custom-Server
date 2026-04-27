# Development Guide

## Local Setup

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org/))
- Yarn or npm
- Banner Saga Factions game (Steam)
- Fiddler Classic (optional, for protocol debugging)

### Installation

```bash
# Clone repository
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server

# Install dependencies
yarn install
# or
npm install

# Create and fill .env file (REQUIRED — server throws at startup without JWT_SECRET and DB credentials)
cp .env.example .env
```

### Database Setup

Requires MySQL 8+. Create the database and run the schema:

```sql
CREATE DATABASE bsf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
mysql -u root -p bsf < src/db/schema.sql
```

Fill in `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `JWT_SECRET` in `.env`.

### Run Server

```bash
# Compile then start (recommended)
yarn build
start-server.bat

# Development mode (auto-restart on file changes, no .env preflight)
yarn dev
```

Server runs on `http://localhost:8082`

---

## Testing

### Single Client Test

```bash
# Terminal 1: Start server
cd BSF-Custom-Server
yarn dev

# Terminal 2: Launch game
cd "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"

& '.\The Banner Saga Factions.exe' --debug --server http://localhost:8082/ \
  --username test --factions --developer --steam_id 123456 --steam true
```

### Internet Multiplayer Testing

Use the `/internet-test` skill to open a Cloudflare tunnel, then paste one of these into Steam Launch Options:

#### Localhost 2-player match
```
--debug --server http://localhost:8082/ --username test,Pieloaf --factions --developer --steam true --steam_id 123456,293850 --versus_start --versus_countdown 0
```

#### Localhost 2-player match with long steamid
```
--debug --server http://localhost:8082/ --username Gandalf,Dumbeldore --factions --developer --steam true --steam_id 76561198354572128,76561198077631330 --versus_start --versus_countdown 0
```

#### CF tunnel — 2-player match (replace URL with tunnel URL from `/internet-test`)
```
--debug --server https://<tunnel-url>/ --username test,Pieloaf --factions --developer --steam true --steam_id 123456,293850 --versus_start --versus_countdown 0
```

#### CF tunnel — single player, auto-queue
```
--debug --server https://slow-peak-stewart-focus.trycloudflare.com/ --factions --developer --steam true --versus_start --versus_countdown 0
```

**Expected Flow**:
1. Game launcher opens
2. Login with "test" account
3. Enter matchmaking
4. Waits for opponent

---

### Two-Player Local Test (Same Machine)

**Option A — use the launch script (recommended)**:
```powershell
.\launch-game-2p.ps1
```

**Option B — headless API smoke test** (no game client needed):
```bat
test-2p-match.bat
```

**Option C — manual launch**:
```bash
# Terminal 1: Start server
yarn build && start-server.bat

# Terminal 2: Launch both clients
cd "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"

& '.\The Banner Saga Factions.exe' --debug --server http://localhost:8082/ --username test,Pieloaf --factions --developer --steam_id 123456,293850 --steam true --versus_start --versus_countdown 0
```
**Expected Flow**:
1. Two game clients launch in same window
2. Both login (left: test, right: Pieloaf)
3. Both enter queue
4. Immediate match (type + power bracket)
5. BattleCreateData sent to both
6. Battle scene loads with 6 units visible per player
7. ✅ Both players can move and fight
8. ✅ Post-match: renown awarded, result written to MySQL `battles` table

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
  ```bash
  cat data/accounts.json | jq '.[] | {username, user_id}'
  ```
- Expected output:
  ```
  { "username": "test", "user_id": 123456 }
  { "username": "Pieloaf", "user_id": 293850 }
  ```

#### Issue: "Battle starts but game crashes"
```
Error: Cannot read property 'id' of undefined
```
**Fix**:
- Entity DEF fields missing (protocol issue)
- Check Battle.ts line 85-90: `filteredDefs` should have all 6 units
- Verify `data/acc.json` has roster with units

#### Issue: "Second player can't move"
```
Action sent but no response; units frozen
```
**Fix**:
- This is a **known UI modal issue** (not server bug)
- See [Known Issues](#known-issues) section below
- Debug: Check server logs for move endpoint being called

---

## Build & Compile

### TypeScript Compilation

```bash
# Build to JavaScript (outputs to build/ directory)
yarn build

# Run compiled version
node build/index.js
```

### Production Build

```bash
# Build with optimizations (requires docker)
docker build -t bsf-server:0.1.0 .
docker run -p 8082:8082 bsf-server:0.1.0
```

---

## Client Distribution (Phase 7)

### Game Client Notes

The Steam release ships the game as a **captive Adobe AIR runtime** bundle — the `Adobe AIR/` subfolder inside `win32/` contains the runtime. End users do not need to install Adobe AIR separately.

Steam location: `C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32\`

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
│   ├── CHANGELOG.md                      # Release history (v0.1.0 includes root-cause analysis for original 7 bugs)
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

## Common Commands

```bash
# Development
yarn dev                          # Start with auto-reload
yarn build                        # Compile TypeScript
yarn dev --verbose               # (Note: not implemented, use server logs)

# Testing
# Launch game (see Testing section above)

# Production
docker build -t bsf-server .
docker run -p 8082:8082 bsf-server
```

---

## Debugging Workflow

### Step 1: Identify Issue

```bash
# Check server logs for errors
yarn dev
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

```bash
# Ctrl+C to stop server
# Ctrl+C again or type 'quit' if ts-node-dev hangs

# Restart
yarn dev

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
```bash
git add src/services/queue.ts
git commit -m "fix: [ISSUE_DESCRIPTION]"
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

### 4. No Session Cleanup

**Status**: 🟡 LOW  
**Symptom**: Idle sessions never removed  
**Cause**: No timeout logic  
**Impact**: Memory leaks on long-running servers  

---

## Development Status

See [CHANGELOG.md](CHANGELOG.md) for the full release history. Current open items:

- Session cleanup for idle sessions (memory leak on long-running servers)
- Ladder / ELO ranking
- User registration (accounts are created automatically on first Steam login)
- Discord OAuth CSRF fix and `game_id` schema (prerequisite for mobile crossplay — see [Plan-Enable-Mobile-Windows-Crossplay.md](Plan-Enable-Mobile-Windows-Crossplay.md))

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

**Last Updated**: 2026-04-27