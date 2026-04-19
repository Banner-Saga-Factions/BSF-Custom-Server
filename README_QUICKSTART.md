# Banner Saga Factions Custom Server - Start Here

## 🚀 QUICK START (2 minutes)

### Step 1: Open Terminal 1 (PowerShell or Command Prompt)

```powershell
cd c:\Users\rleyb\Code\BSF
.\launch-server.ps1
```

**Wait for this message:**
```
Express server listening on port 8082
```

### Step 2: Open Terminal 2 (PowerShell or Command Prompt)

```powershell
cd c:\Users\rleyb\Code\BSF
.\launch-game-2p.ps1
```

**That's it!** Two game windows will launch and automatically start a battle.

---

## 📋 What Happens

1. **Terminal 1** - Server starts on port 8082 ✅
2. **Terminal 2** - Two game clients launch ✅
3. Both players auto-login (test & Pieloaf) ✅
4. Immediate queue match (first-come-first-served) ✅
5. Battle loads with 6 units per player ✅
6. Player 1 can move units ✅
7. Battle continues ✅

---

## 🆘 Troubleshooting

**"Script won't run"**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**"yarn not found"**
```bash
npm install -g yarn
```

**"Game path incorrect"**
- Edit `launch-game-2p.ps1`
- Find: `$GamePath = "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"`
- Update to your actual game location

**"Server won't start"**
- Check Terminal 1 logs for errors
- Verify: `yarn build` completes without errors
- Verify: Port 8082 is not in use: `netstat -ano | findstr :8082`

**"Cannot connect to server"**
- Verify Terminal 1 shows "Express server listening on port 8082"
- Wait 5+ seconds after startup
- Then run Terminal 2 script

---

## 📚 Full Documentation

For detailed information, see:
- **[LAUNCH_GUIDE.md](LAUNCH_GUIDE.md)** - Complete parameter reference
- **[SCRIPTS_README.md](SCRIPTS_README.md)** - Script details and advanced options
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** - IDE setup and debugging
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design overview

---

## 🎮 Test Accounts

| User | ID | Password |
|------|----|----|
| test | 123456 | (auto-login) |
| Pieloaf | 293850 | (auto-login) |

---

## ⚙️ System Requirements

- ✅ Node.js 18+ (required)
- ✅ yarn (install: `npm install -g yarn`)
- ✅ The Banner Saga Factions (Steam)
- ✅ Windows 10+ (for PowerShell)

---

## 🎯 Next Steps After Testing

1. **Confirm 2-player battle works**
2. **Test single-player queue** (`.\launch-game-1p.ps1`)
3. **Move to Phase 2** (database integration)
4. See [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md) roadmap section

---

## 📞 Still Having Issues?

See **[SCRIPTS_README.md](SCRIPTS_README.md)** comprehensive troubleshooting section with solutions for:
- Execution policy
- Missing dependencies
- Game path issues
- Server connection
- Crash/blank screen
- Port conflicts

---

**Status:** ✅ Ready to play  
**Last Updated:** April 19, 2026  
**Phase:** 1 (Local 2-player working)
