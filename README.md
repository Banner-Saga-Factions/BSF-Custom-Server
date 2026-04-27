# Banner Saga Factions — Community Server

A TypeScript/Express reimplementation of the Banner Saga Factions multiplayer backend.
Reverse-engineered from Fiddler captures of the original servers.

**Status**: 🟢 Local and network 2-player battles working — Steam auth, matchmaking, battle sync, renown, and Proving Grounds roster management all functional.

---

## Quick Start

### Requirements

- Node.js 18+
- MySQL 8+
- Yarn

### Install

```bash
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server
yarn install
cp .env.example .env   # fill in MySQL credentials + JWT_SECRET (required)
```

### Database setup

```sql
CREATE DATABASE bsf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
mysql -u root -p bsf < src/db/schema.sql
```

### Run

```bash
yarn build
start-server.bat       # builds, kills stale node process, starts fresh
```

Server listens on `http://localhost:8082`.

> `yarn dev` also works for development (ts-node-dev hot-reload), but always use `start-server.bat` after a code change for a clean run — leftover compiled builds are the most common cause of "my change isn't working."

---

## Game Client

The game was removed from Steam but is preserved and self-contained (Adobe AIR runtime bundled — no separate install required).

**[⬇ Download Game Client](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/latest)**

### Launch arguments

| Argument | Params | Description |
|---|---|---|
| `--steam` | `Boolean` | Bypasses Steam authentication checks |
| `--steam_id` | `Array<steam_id>` | Overrides Steam ID. Two comma-separated IDs open two clients in one window. Must match count of `--username`. |
| `--username` | `Array<username>` | Display name(s). Required for multi-client window. |
| `--server` | URL | Points client at a custom server |
| `--factions` | | Launches directly into Factions mode |
| `--developer` | | Enables the developer overlay menu |
| `--debug` | | Verbose client logging |
| `--versus_start` | | Skips menus and enters matchmaking immediately |
| `--versus_countdown` | `Integer` | Match intro countdown duration. Set to `0` to skip. |

### Two-player local test

```powershell
.\launch-game-2p.ps1
```

Or headless (no game client needed):

```bat
test-2p-match.bat
```

Manual launch args for local 2-player:

```
--debug --server http://localhost:8082/ --username test,Pieloaf --factions --developer --steam true --steam_id 123456,293850 --versus_start --versus_countdown 0
```

With real (64-bit) Steam IDs:

```
--debug --server http://localhost:8082/ --username Gandalf,Dumbledore --factions --developer --steam true --steam_id 76561198354572128,76561198077631330 --versus_start --versus_countdown 0
```

---

## Documentation

| Document | Purpose |
|---|---|
| [docs/Community-Insights.md](docs/Community-Insights.md) | Insights, design discussions, and lessons from the founding community (2022) |
| [docs/Development.md](docs/Development.md) | Local setup, testing, debugging, contributing |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, component breakdown |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history and all bug fixes |
| [docs/serverEndpoints.md](docs/serverEndpoints.md) | HTTP API reference |
| [docs/dataStructures.md](docs/dataStructures.md) | Wire-format data structures |
| [docs/gameFlow.md](docs/gameFlow.md) | Full battle lifecycle walkthrough |

---

## What's Implemented

### ✅ Complete

- Steam authentication (session creation, 32-bit account_id derivation)
- HTTP long-polling data delivery (10s timeout)
- Matchmaking — first-come-first-served, filtered by game type and power bracket
- Battle lifecycle — ready, deploy, sync, move, action, kill, exit
- BattleSyncData hash agreement (64-bit Steam IDs converted to 32-bit account IDs so both clients construct identical entity strings)
- Endgame — kill tracking, renown awards (`WIN + kills × 3`), DB persistence
- MySQL persistence — accounts and battles tables
- Proving Grounds — party arrangement, unit promote/rename/retire/hire, stat upgrades, barracks expansion
- Discord OAuth login path (~90% complete; CSRF fix and game_id schema pending — see [docs/Plan-Enable-Mobile-Windows-Crossplay.md](docs/Plan-Enable-Mobile-Windows-Crossplay.md))
- Docker — `Dockerfile` + `docker-compose.yml`, Node 22 LTS base

### 🔴 Not yet implemented

- Ladder / ELO ranking
- User registration (new accounts are created automatically on first Steam login)
- Session cleanup for idle sessions
- Full achievement tracking (placeholder deltas sent; future work)

---

## Project Structure

```
BSF/
├── src/
│   ├── index.ts                    # Express app, routing, auth middleware
│   ├── const.ts                    # Enums (GameModes, ServerClasses)
│   ├── db/
│   │   ├── connection.ts           # mysql2 pool, query/queryOne helpers
│   │   ├── schema.sql              # DDL — accounts + battles tables
│   │   ├── account.ts              # upsertAccount, addRenown, saveParty/Roster
│   │   └── battles.ts              # saveBattleResult
│   ├── util/
│   │   └── serialization.ts        # RawInt + safeJsonStringify
│   └── services/
│       ├── auth/
│       │   ├── auth.ts             # Session class, sessionHandler, Steam login
│       │   └── discord.ts          # Discord OAuth (JWT issue + callback)
│       ├── battle/
│       │   ├── Battle.ts           # Battle logic, all /battle/* endpoints
│       │   ├── BattlePartyData.ts
│       │   └── BattleTurnData.ts
│       ├── roster.ts               # Proving Grounds /roster/* endpoints
│       ├── queue.ts                # Matchmaking
│       ├── game.ts                 # Long-polling delivery
│       ├── chat.ts                 # Global + battle chat
│       └── account.ts              # /account/info endpoint
├── data/
│   ├── acc.json                    # Default roster/party for new accounts
│   ├── first.json                  # Pushed to every client on first poll
│   ├── lboard.json                 # Static leaderboard data
│   ├── accounts.json               # Username fallback for unknown user_ids
│   ├── build-number                # Returned as build_number in login response
│   └── game_captures/              # Fiddler protocol captures (reference)
├── docs/                           # Full documentation (see table above)
├── start-server.bat                # Build + kill stale process + start
├── test-2p-match.bat               # Headless 2-player API smoke test
├── launch-game-2p.ps1              # Launch two game clients vs localhost
├── Dockerfile
├── docker-compose.yml
└── CLAUDE.md                       # Claude Code guidance
```

---

## Data Sources

### Protocol reference

All client ↔ server protocol was reverse-engineered using Fiddler Classic. Captures are in `data/game_captures/`:

```
data/game_captures/
├── factions.saz                    # Complete match capture
├── factionsTrimmed.saz             # Trimmed capture
└── extracted/raw/
    ├── 0058_s.txt                  # BattleCreateData reference
    ├── 0116_c.txt                  # Deploy request
    ├── 0123_s.txt                  # Sync data
    └── ...
```

Use [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) to inspect game client ActionScript for data structure formats and protocol expectations.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Port 8082 already in use" | `netstat -ano \| findstr :8082` (Windows) to find PID, then kill it |
| Server change not taking effect | Use `start-server.bat` — running a stale compiled build is the #1 cause |
| TypeScript errors on build | `yarn build` shows full error list |
| Battle data never arrives | Verify `GameRouter` is registered in `src/index.ts` |
| All units show as blank | Check `data/acc.json` has complete EntityDef with `name` field |
| Hash divergence / desync | Confirm `account_id` (32-bit) is used everywhere, not full 64-bit Steam ID |

---

## Contributing

1. Fork and create a branch: `git checkout -b feature/your-feature`
2. Make changes in `src/`
3. `yarn build` — must compile clean
4. Test with `test-2p-match.bat` (headless) or `launch-game-2p.ps1` (full clients)
5. Submit PR with a description of what changed and why

See [docs/Development.md](docs/Development.md) for full debug workflow and test procedures.

---

**Discord**: [Banner Saga Discord](https://discord.gg/Jf3FNpV8gv) — `@Pieloaf#1999`  
**GitHub Issues**: [BSF-Custom-Server/issues](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues)
