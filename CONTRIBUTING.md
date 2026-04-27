# Contributing to BSF Custom Server

This guide gets you from zero to a running server and a passing 2-player smoke test. Follow the steps in order.

---

## Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org/)
- **Yarn** — `npm install -g yarn`
- **MySQL 8+** — [Download](https://dev.mysql.com/downloads/mysql/)
- **Git**

The game client (Adobe AIR bundle, no separate runtime install) is available in the [latest GitHub release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/latest).

---

## 1. Clone and Install

```bash
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server
yarn install
```

---

## 2. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values. **`JWT_SECRET` is required** — the server will refuse to start without it. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

See `.env.example` for comments explaining each variable.

---

## 3. Initialize the Database

Create the database in MySQL:

```sql
CREATE DATABASE bsf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Load the schema:

```bash
mysql -u root -p bsf < src/db/schema.sql
```

---

## 4. Build and Start

```bash
yarn build
start-server.bat
```

`start-server.bat` builds, kills any stale Node process, and starts fresh. Always use it after code changes — running a stale build is the most common cause of "my change isn't working."

Server listens on `http://localhost:8082`.

---

## 5. Verify with the Smoke Test

With the server running, open a second terminal and run:

```bat
test-2p-match.bat
```

A passing run looks like:

```
============================================================
 BSF 2-Player Match Test
 Players: "test" (123456) vs "Pieloaf" (293850)
============================================================

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

============================================================
 RESULT: PASS — Battle <hex> created successfully
 Both players are now in a QUICK match.
============================================================
```

If any step shows `[FAIL]`, check the server console for errors.

---

## 6. Make Your Change

- Edit files in `src/`
- `yarn build` must compile clean before submitting a PR
- Re-run `test-2p-match.bat` after changes
- For full in-game testing, use `launch-game-2p.ps1` (requires the game client)

---

## 7. Submit a Pull Request

1. Fork and create a branch: `git checkout -b feature/your-feature`
2. Make changes, ensure `yarn build` is clean
3. Test with `test-2p-match.bat`
4. Open a PR with a description of what changed and why

---

## Where to Go Next

| Document | What's in it |
|---|---|
| [docs/Development.md](docs/Development.md) | Full debug workflow, gotchas, IDE setup |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and key design decisions |
| [docs/gameFlow.md](docs/gameFlow.md) | Battle lifecycle walkthrough |
| [docs/serverEndpoints.md](docs/serverEndpoints.md) | HTTP API reference |
| [docs/dataStructures.md](docs/dataStructures.md) | Wire-format data structures |
| [docs/Community-Insights.md](docs/Community-Insights.md) | History and design context from the founding community |

---

*Created with [Claude Code](https://claude.ai/code)*
