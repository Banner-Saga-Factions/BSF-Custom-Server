# Banner Saga Factions Custom Server - Quick Start Guide

This directory contains automated launch scripts to get the game running with minimal setup.

## TL;DR - Start Here

**You need 2 terminals open:**

**Terminal 1 (Server):**
```powershell
.\launch-server.ps1
# Wait for: "Express server listening on port 8082"
```

**Terminal 2 (Game):**
```powershell
.\launch-game-2p.ps1
# Two game clients will launch and battle immediately
```

That's it! The battle will start automatically.

---

## Available Scripts

### 1. Server Scripts

#### `launch-server.ps1` (PowerShell - Recommended)
Starts the development server with automatic checks.

**Usage:**
```powershell
cd c:\Users\rleyb\Code\BSF
.\launch-server.ps1
```

**What it does:**
- ✓ Checks if Node.js is installed
- ✓ Checks if yarn is installed
- ✓ Starts the server on port 8082
- ✓ Shows color-coded status output

**Expected output:**
```
Starting Banner Saga Factions Custom Server...
Server will listen on http://localhost:8082/

✓ Node.js is installed
✓ yarn is installed

Running: yarn dev
yarn run v1.22.22
$ ts-node-dev --respawn src/index.ts
Express server listening on port 8082
```

#### `launch-server.bat` (Command Prompt)
Alternative for Windows cmd.exe users.

**Usage:**
```cmd
cd c:\Users\rleyb\Code\BSF
launch-server.bat
```

**What it does:**
- Same as PowerShell version
- Uses batch commands instead
- Pauses on completion for error review

---

### 2. Game Client Scripts

#### `launch-game-2p.ps1` (Two-Player - Recommended)
Launches both game clients and auto-starts a battle.

**Usage:**
```powershell
.\launch-game-2p.ps1
```

**Prerequisites:**
- Server must be running (see `launch-server.ps1` above)
- Game must be installed at: `C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32\`

**What it does:**
- ✓ Checks if server is running
- ✓ Checks if game executable exists
- ✓ Launches two game clients (test & Pieloaf)
- ✓ Auto-logs both players in
- ✓ Auto-matches players
- ✓ Starts battle immediately

**Expected behavior:**
1. Two game windows appear side-by-side
2. Both login automatically
3. Both get placed in queue
4. Match is found immediately
5. Battle scene loads
6. Player 1 can move units ✅
7. Player 2 attempts to move (may be blocked by UI modal ⏳)

#### `launch-game-1p.ps1` (Single-Player - Queue Testing)
Launches one game client to test queue matching.

**Usage:**
```powershell
.\launch-game-1p.ps1
```

**Optional Parameters:**
```powershell
.\launch-game-1p.ps1 -Username "test" -SteamId "123456" -ServerUrl "http://localhost:8082/"
```

**What it does:**
- ✓ Checks if server is running
- ✓ Checks if game executable exists
- ✓ Launches one game client
- ✓ Client waits in queue for opponent
- ✓ Useful for testing queue timeout (20 seconds)

---

## Common Workflows

### Workflow 1: Quick Two-Player Local Battle (5 minutes)

1. Open Terminal 1 (PowerShell)
2. `cd c:\Users\rleyb\Code\BSF && .\launch-server.ps1`
3. Wait ~5 seconds for "Express server listening on port 8082"
4. Open Terminal 2 (PowerShell)
5. `cd c:\Users\rleyb\Code\BSF && .\launch-game-2p.ps1`
6. Battle starts automatically
7. Test gameplay

### Workflow 2: Test Queue Matching (10 minutes)

1. Open Terminal 1: `.\launch-server.ps1`
2. Open Terminal 2: `.\launch-game-1p.ps1`
3. First player queues
4. Wait 5-10 seconds
5. Open Terminal 3: `.\launch-game-1p.ps1 -Username "Pieloaf" -SteamId "293850"`
6. Match is found immediately
7. Battle starts
8. Both clients launch

### Workflow 3: Manual Testing (Command Prompt)

1. Terminal 1: `launch-server.bat`
2. Terminal 2: `cd "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"`
3. Terminal 2: `"The Banner Saga Factions.exe" --debug --server http://localhost:8082/ --username test --factions --developer --steam_id 123456 --steam true`

---

## Troubleshooting

### Script won't run: "The execution policy prevents..."

**Problem:** PowerShell execution policy blocks scripts.

**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then try again:
```powershell
.\launch-server.ps1
```

### "ERROR: yarn is not installed"

**Problem:** yarn command not found.

**Solution:**
```bash
npm install -g yarn
```

Then restart your terminal and try again.

### "ERROR: Node.js is not installed"

**Problem:** Node.js is not installed or not in PATH.

**Solution:**
1. Download: https://nodejs.org/ (LTS version)
2. Run installer
3. Restart your terminal
4. Try script again

### "Cannot connect to server"

**Problem:** Game script says server isn't running.

**Solution:**
1. Check Terminal 1 - is server running?
2. Look for: "Express server listening on port 8082"
3. If not, restart `launch-server.ps1`
4. Wait 5 seconds for full startup
5. Then run game script

### "Game executable not found"

**Problem:** Game path incorrect or not installed.

**Solution:**
1. Verify Banner Saga Factions is installed via Steam
2. Expected path: `C:\Program Files (x86)\Steam\steamapps\common\The Battle Saga Factions\win32\`
3. Check if folder exists in File Explorer
4. If different location, edit script: Change `$GamePath` variable

### "Battle crashes or shows blank"

**Problem:** Client can't deserialize battle data.

**Solution:**
1. Check Terminal 1 for server errors
2. Verify server compiled: `yarn build` (should complete in 3 seconds)
3. Restart server: `.\launch-server.ps1`
4. Wait for full startup
5. Launch game again

---

## Test Accounts

| Username | Steam ID | Status |
|----------|----------|--------|
| test | 123456 | ✅ Ready |
| Pieloaf | 293850 | ✅ Ready |

Both accounts have 6 starter units pre-configured.

---

## Server Information

- **Port:** 8082
- **URL:** http://localhost:8082/
- **Type:** In-memory (no database yet)
- **Protocol:** HTTP/JSON with 20-second long-polling

---

## Development

See [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md) for:
- Detailed parameter reference
- Manual command examples
- Architecture overview
- Known issues and roadmap

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for:
- Full development setup
- IDE configuration
- Debug tips
- Build procedures

---

## Next Steps

After successful local 2-player testing:

1. **Phase 2:** Database integration (PostgreSQL)
2. **Phase 3:** User registration system
3. **Phase 4:** Battle completion and rewards
4. **Phase 5:** Docker deployment
5. **Phase 6:** Internet multi-user testing

See [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md) roadmap section for full details.

---

**Status:** Ready for local testing ✅  
**Last Updated:** April 19, 2026
