Set up an internet multiplayer test session using Cloudflare Tunnel.

## Context

Adobe AIR long-polling (20-second GET `/services/game/SESSION_KEY`) fails over HTTPS with ngrok.
Cloudflare Tunnel is confirmed working. The tunnel URL changes each session.

**Never use ngrok for this project** — it breaks the long-poll.

## Step 1: Check Server

Run `Test-NetConnection -ComputerName localhost -Port 8082 -InformationLevel Quiet` to check if the BSF server is running on port 8082.

If not running, tell the user: "Start the server first with `start-server.bat`, then re-run `/internet-test`."

## Step 2: Check / Start Cloudflare Tunnel

Check if cloudflared is already running:
```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue
```

If not running, tell the user to open a new terminal and run:
```
cloudflared tunnel --url http://localhost:8082
```
Then ask them to paste the `https://xxxx.trycloudflare.com` URL here before continuing.

If already running, ask the user for the current tunnel URL (it's printed in the cloudflared terminal output).

## Step 3: Output Ready-to-Use Instructions

With the tunnel URL confirmed, output the following (substituting the real URL):

---

**Your tunnel URL:** `https://xxxx.trycloudflare.com`

### Steam Launch Options (set in game Properties → Launch Options)

**Both players use:**
```
--server https://xxxx.trycloudflare.com/ --factions --developer --steam true --versus_start --versus_countdown 0
```

Share this URL with your friend — they set the same launch options and click Play.

### What to Watch in Server Logs

After both players launch the game, confirm:
- `[AUTH]` login entries for both steam_ids
- `[GAME-POLL] START` for both sessions (confirms long-poll works)
- `[MATCHMAKING] Battle created` once both are in queue

---

## Step 4: Troubleshoot if Needed

| Symptom | Fix |
|---------|-----|
| Loading screen hang, no `[GAME-POLL]` in logs | Tunnel URL wrong or expired — restart cloudflared |
| `[AUTH]` entry missing | Game not connecting to tunnel — check URL has trailing slash |
| Only one player's poll appears | Other player's game not pointed at same tunnel URL |
