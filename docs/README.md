# Banner Saga Factions Custom Server

A TypeScript-based reverse-engineered server implementation for Banner Saga Factions multiplayer battles. Supports local 2-player matchmaking, battle initialization, and turn-based combat synchronization.

**Status**: 🟢 MVP Phase 2 Complete (DB integration, match resolution with renown rewards; end-to-end 2-player battle working)

---

## Quick Start

### 1. Install & Run

```bash
cd BSF
yarn install
cp .env.example .env   # Edit with your MySQL credentials (REQUIRED)
yarn build
```

Then start the server:
```bat
start-server.bat
```

Or manually: `node build/index.js`

Server starts on `http://localhost:8082`

### 2. Test Local 2-Player Battle

Run the headless API smoke test first:
```bat
test-2p-match.bat
```

To launch actual game clients:
```powershell
.\launch-game-2p.ps1
```

**Expected Result**:
- Both players login and get session keys
- Queue immediately finds match
- Battle scene loads with 6 units per player
- Both players can move units ✅
- Post-match: winner gets renown (WIN + kill bonuses), loser gets kill bonuses
- Battle result written to MySQL `battles` table ✅

---

## Documentation

| Document | Purpose |
|----------|---------|
| [CHANGELOG.md](CHANGELOG.md) | Release notes, all bugs fixed, known issues |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow diagrams, components |
| [docs/BUG_FIXES.md](docs/BUG_FIXES.md) | Root cause analysis of 7 critical bugs |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, debugging, testing procedures |
| [docs/gameFlow.md](docs/gameFlow.md) | Battle lifecycle diagrams |
| [docs/dataStructures.md](docs/dataStructures.md) | Data format reference |
| [docs/serverEndpoints.md](docs/serverEndpoints.md) | HTTP API routes |

---

## Features

### ✅ Implemented (Phase 1 & 2)
- Express.js server with TypeScript
- Session-based authentication (20-second long-polling)
- First-come-first-served matchmaking (type + power bracket filtering)
- 2-player battle initialization (BattleCreateData)
- Party data serialization (all 6 units)
- Protocol alignment with official Banner Saga Factions format
- MySQL2 database — accounts and battles persistence
- Battle result storage with winner/loser/renown written to `battles` table
- Match resolution: real kill tracking, renown awards (`WIN + kills × 3`)
- Input validation: `vs_type`, party arrays, roster arrays
- Security: JWT_SECRET startup guard, auth token verify try/catch, Discord path blocked (501)

### 🟠 In Progress
- Queue timeout/cleanup (idle players not auto-removed)
- Roster management endpoints (save/load)

### 🔴 Planned (Phase 3+)
- User registration & password hashing
- Docker deployment
- Multi-user testing

---

## Project Statistics

| Metric | Value |
|--------|-------|
| Language | TypeScript 5.x |
| Runtime | Node.js 18+ |
| Framework | Express.js 4.18+ |
| Database | MySQL 8+ (mysql2 pool) |
| LOC (Core) | ~1,200 lines |
| Bugs Fixed | 20+ (Phase 1+2) |
| Test Accounts | 2 (test, Pieloaf) |
| Battle Endpoints | 12 |
| Long-Poll Timeout | 20 seconds |

---

## Architecture Overview

```
Client (Flash Game)
        ↓ HTTP/Long-Poll
        ↓
[Express Router]
    ├── /auth → Session creation
    ├── /queue → Matchmaking
    ├── /battle → Battle lifecycle
    └── /game → Long-polling data delivery
        ↓
[In-Memory Services]           [MySQL Database]
    ├── Sessions {} ─────────→  accounts table
    ├── Battles {}  ─────────→  battles table
    └── Queue []
```

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Key Technologies

- **TypeScript**: Type-safe backend code
- **Express.js**: HTTP routing and middleware
- **mysql2**: MySQL connection pooling, async queries
- **EventEmitter**: Long-polling data buffering
- **Fiddler Classic**: Protocol reverse engineering (captured data in `data/game_captures/`)

---

## Data Sources

### Protocol Reference
We reverse-engineered the official Banner Saga Factions protocol using Fiddler Classic. Capture files are in:

```
data/game_captures/
├── factions.saz                    # Complete match
├── factionsTrimmed.saz             # Trimmed capture
└── extracted/raw/
    ├── 0058_s.txt                  # BattleCreateData (reference)
    ├── 0116_c.txt                  # Deploy request
    ├── 0123_s.txt                  # Sync data
    └── ...
```

### Test Data
- **Users**: `data/accounts.json` (test, Pieloaf)
- **Party**: `data/acc.json` (6 starter units)

### Client Code Analysis
Use [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) to examine game client code for:
- Data structure formats
- Protocol expectations
- Action handling

---

## What's Working

### ✅ Login Flow
```
test (user_id: 123456)
Pieloaf (user_id: 293850)
↓
Session created with unique session_key
↓
Stored in-memory with EventEmitter buffer
```

### ✅ Matchmaking
```
Both players join QUICK queue
↓
First-come-first-served within power brackets
↓
Immediate match (same power level: 5)
↓
Both removed from queue
```

### ✅ Battle Initialization
```
BattleCreateData created:
  • scene: "greathall"
  • battle_id: auto-incremented
  • timer: 30s (player 1), 45s (player 2)
  • parties: [player1_data, player2_data]
  • defs: [6 units with complete EntityDef]
↓
Delivered via /game/session_key long-polling
↓
Game client deserializes and loads battle
```

### ✅ Deployment & Initial Moves
```
Player 1 can reposition units
↓
Deploy button sends data to server
↓
Battle scene starts
↓
Player 1 can move units
```


---

## Known Issues

### 🟠 Medium (Significant)
- **Queue Cleanup**: Idle/disconnected players not auto-removed from queue (no timeout)
- **Roster Endpoints**: Save/load roster endpoints not yet implemented

### 🟡 Low (Nice-to-Have)
- **Limited Accounts**: Only 2 test users; no registration system
- **No Session Cleanup**: Idle sessions never removed (memory leak risk)

---

## Testing Checklist

See [docs/DEVELOPMENT.md → Testing Checklist](docs/DEVELOPMENT.md#testing-checklist) for complete verification steps.

**Quick Test** (30 seconds):
- [ ] `yarn dev` → Server starts
- [ ] Launch game with `--username test,Pieloaf`
- [ ] Both clients login
- [ ] Immediate match
- [ ] Battle scene loads with 6 units visible
- [ ] Player 1 moves unit ✅

---

## Common Commands

```bash
# Development
yarn install                      # Install dependencies
yarn dev                          # Start server (auto-reload)
yarn build                        # Compile TypeScript
node build/index.js               # Run compiled version

# Testing
# See docs/DEVELOPMENT.md → Local Setup

# Production (Future)
docker build -t bsf-server .
docker run -p 8082:8082 bsf-server
```

---

## Troubleshooting

### "Cannot connect to server"
```bash
# Check if server is running
yarn dev

# Verify port 8082 is free (Windows)
netstat -ano | findstr :8082
```

### "Battle scene crashes"
- Verify `data/acc.json` has complete EntityDef (name, stats, appearance)
- Check Battle.ts line 85-90: `filteredDefs` should have 6 units
- See [docs/DEVELOPMENT.md → Common Issues](docs/DEVELOPMENT.md#common-issues--fixes)

### "Second player can't move"
- This is a **known client-side UI modal issue** (not server bug)
- Server is receiving move requests correctly
- See [Known Issues](#known-issues) for status

---

## Development Workflow

### Making Changes

1. Edit file in `src/`
2. Server auto-restarts (ts-node-dev)
3. Test with `yarn dev` (Terminal 1) + game clients (Terminal 2)
4. Add logging: `console.log('[TAG]', variable)`

### Debugging

- Read logs from `yarn dev` output
- Use Fiddler Classic to capture network traffic
- Compare with protocol reference in `data/game_captures/extracted/raw/`
- Check client logs in `%AppData%/TheBannerSagaFactions/Local Store/logs/`

See [docs/DEVELOPMENT.md → Debugging Workflow](docs/DEVELOPMENT.md#debugging-workflow) for details.

---

## Project Structure

```
BSF/
├── src/
│   ├── index.ts                       # Express app
│   ├── const.ts                       # Enums
│   ├── db/
│   │   ├── connection.ts              # MySQL pool helpers
│   │   ├── schema.sql                 # DDL for accounts + battles tables
│   │   ├── account.ts                 # Account queries (upsert, renown, roster)
│   │   └── battles.ts                 # saveBattleResult()
│   └── services/
│       ├── battle/Battle.ts           # Battle logic + endgame
│       ├── queue.ts                   # Matchmaking
│       ├── game.ts                    # Long-polling
│       └── auth/auth.ts               # Sessions
├── data/
│   ├── accounts.json                  # Username fallback for unknown user_ids
│   ├── acc.json                       # Default roster/party for new accounts
│   └── game_captures/                 # Protocol reference
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BUG_FIXES.md
│   ├── DEVELOPMENT.md
│   └── ...
├── start-server.bat                   # Preflight + run server
├── test-2p-match.bat                  # Headless 2-player smoke test
├── launch-game-2p.ps1                 # Launch two game clients
├── CLAUDE.md                          # Claude Code guidance
└── package.json
```

---

## MVP Roadmap

### Phase 1: Local 2-Player (COMPLETE ✅)
- [x] Fix 7 critical bugs
- [x] Verify protocol alignment
- [x] End-to-end battle working

### Phase 2: Database (COMPLETE ✅)
- [x] MySQL schema (accounts + battles tables)
- [x] Account persistence (upsert on login, renown tracking)
- [x] Battle result storage

### Phase 3: User System (not started)
- [ ] Registration endpoint
- [ ] Password hashing
- [ ] Per-user rosters

### Phase 4: Rewards (partially complete)
- [x] Winner calculation + renown awards
- [x] Kill tracking (winnerKills, loserKills)
- [ ] Ladder/ELO updates

### Phase 5: Deployment (1 week)
- [ ] Docker Compose
- [ ] Environment config
- [ ] Staging environment

### Phase 6: Multi-User Testing (1 week)
- [ ] Deploy to cloud
- [ ] Test from different locations
- [ ] Bug iteration

**Total Estimated Timeline**: 2-3 weeks (with parallelization)

---

## Resources

### Tools Used
- [Fiddler Classic](https://www.telerik.com/fiddler/fiddler-classic) - Network traffic capture
- [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) - Client code analysis
- [VS Code](https://code.visualstudio.com/) - Editor
- [TypeScript](https://www.typescriptlang.org/) - Language

### Related Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [docs/gameFlow.md](docs/gameFlow.md) - Battle flow
- [docs/dataStructures.md](docs/dataStructures.md) - Data formats
- [docs/serverEndpoints.md](docs/serverEndpoints.md) - API routes

### Learning Resources
- [Banner Saga Wiki](https://bannersaga.fandom.com/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## Support

### Reporting Issues
1. Check [CHANGELOG.md](CHANGELOG.md) for known issues
2. Reproduce with two-player local test
3. Include server logs from `yarn dev` output
4. Reference protocol file from `data/game_captures/`

### Contributing
- Fork repository
- Create feature branch: `git checkout -b feature/your-feature`
- Make changes and test locally
- Submit PR with description of changes

---

## License

[Your License Here]

---

**Status**: MVP Phase 1 Complete  
**Last Updated**: April 19, 2026  
**Maintainer**: Richard Leyba Tejada
**Discord**: [\[Link\]  ](https://discord.com/channels/286580746200678400/944279686882660413)
**GitHub Issues**: [\[Link\]  ](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues)

---

## Quick Links

- 🚀 [Quick Start](#quick-start)
- 📚 [Documentation](#documentation)
- 🐛 [Known Issues](#known-issues)
- 🗺️ [Roadmap](#mvp-roadmap)
- 🛠️ [Development](docs/DEVELOPMENT.md)
- 🏗️ [Architecture](docs/ARCHITECTURE.md)

Some More Launch Args:

| Launch Arguments    | Params                 | Explanation |
| ------------------- | ---------------------- |-------------|
| `--steam`| `Boolean` | Tells the game client to "use" steam even if steamworks isn't running (This is required to bypass some authentication checks)|
| `--factions`| | Should tell the game to launch into factions and not go to a weird menu although doesn't always work |
|`--steam_id`| `Array<steam_id>` | Overrides default steam id. Required to run game without steam. Note: Passing two comma separated steam_ids creates two game clients in the same window; very useful for testing. **Must have a matching number of user names.**
|`--username`| `Array<user_name>` | Required for loading multiple clients in a single window. Comma separated. |
|`--server`| Server URL | Used to point the game client to a different game server |
|`--developer`||Enable a developer overlay menu. (Doesn't work when playing on official servers.) |
|`--debug`||Enables debug logging (more verbose than default logging) |
|`--versus_start`||Launches game directly into matchmaking queue. Helps to speed to up testing and avoids clicking through menus
|`--versus_countdown`| `Integer` | Determines match launch countdown duration. Set to 0 to skip match intro timer.

There are many more launch arguments althought these are the ones required to use custom servers, bypass steam checks and open multiple game clients for testing. I may document the rest of the options at a later date.

### Banner Saga Factions Developer Overlay
![Banner Saga Factions Developer Overlay](https://user-images.githubusercontent.com/49878076/198406430-f9885dc1-6cf9-4a87-9203-414e10dd013a.png)

If anyone would like to contribute feel free to make a PR with your contribution and can update this README marking off what you did or tagging it as work in progress **[WIP]** if not complete. Any help would be greatly appreciated. You can find me on Discord in the [Banner Saga Discord Server](https://discord.gg/Jf3FNpV8gv) as `@Pieloaf#1999`

See development notes [here](docs/README.md)

---
## Task List

Game Functionality


- [ ] Core Functionality
  - [x] Pseudo Login System
    - placeholder until user database established 
  - [x] Global Chat
  - [x] Queueing
  - [ ] Dequeuing :large_blue_diamond:
  - [ ] Matchmaking :large_blue_diamond:
    - It works enough to get into game but needs a **lot** of work see [here](src/queue.ts)
  - [ ] Battle
    - [x] Ready Units
    - [x] Deplot Units
    - [x] Sync Clients
    - [x] Handle Actions and Movement
    - [ ] Handle Match End :large_orange_diamond:
    - [x] In Battle Chat :large_blue_diamond:
    - [ ] Handling Surrenders/Disconnects/Unusual behaviour :question:
    - [ ] Map Rotation :large_blue_diamond:
- [ ] Other
  - [ ] Proving Grounds
    - [ ] Changing Party :large_blue_diamond:
    - [ ] Upgrading Units :large_blue_diamond:
  - [ ] Mead House
    - [ ] Purchasing New Units :large_blue_diamond:
  - [ ] Great Hall
    - [ ] Weekly Tournament :red_circle:
    - [ ] Friends Battles
       - This uses Steam's friends system so not sure what to do with this. Might be best just to leave it out as it is now, by just setting friend data to an empty array for all user accounts
  - [ ] Anticheat and Data Verification :shit:
  - [ ] Login Client :red_circle:
- [ ] Bonus
  - [ ] Map Selection :large_orange_diamond:
  - [ ] Local VS :large_orange_diamond:

---

### Difficulty Estimates

| Difficulty Estimate | Icon                   |
| ------------------- | ---------------------- |
| Easy                | :large_blue_diamond:   |
| Medium              | :large_orange_diamond: |
| Hard                | :red_circle:           |
| NO!                 | :shit:                 |
| Unkown              | :question:             |

Auxiliary Tasks
  
 In order of priority:

- Database Stuff
  - Setting up databases for user accounts, battles, sessions, game units, tournaments, etc... There's a lot 
  
- Documentation
  - which I have not done very well so far...
  
- Data Handling Refactoring
  - This was not thought about very well before starting and as a result some of the data sharing between modules could use some refactoring and clean up.



