# Banner Saga Factions — Community Server

A Node.js / TypeScript reimplementation of the Banner Saga Factions multiplayer backend. Reverse-engineered from Fiddler captures of the original Stoic servers in 2022. Supports Steam authentication, matchmaking, 2-player battle synchronization, and Proving Grounds roster management.

**Status:** 🟢 Operational — Steam auth, matchmaking, battle sync, renown awards, and Proving Grounds are functional on a single GCP e2-micro instance.

---

## 🗺️ Start Here

| If you want to… | Read |
|---|---|
| Run a local server | The [Quick Start](#-quick-start) below |
| Contribute code, run tests, push a PR | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Understand the protocol or the 32-bit ID rule | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Trace a battle end-to-end | [docs/gameFlow.md](docs/gameFlow.md) |
| Deploy to GCP / Docker / Caddy | [docs/Deployment.md](docs/Deployment.md) |
| Understand the project's history | [docs/HISTORY.md](docs/HISTORY.md) |
| Look up a battle / wire message shape | [docs/dataStructures.md](docs/dataStructures.md) |
| Look up a database table or column | [docs/database-schema.md](docs/database-schema.md) |
| Add or change a database migration | [docs/database-migrations.md](docs/database-migrations.md) |
| Look up an HTTP error code or the client's error handling | [docs/error-handling.md](docs/error-handling.md) |
| Understand the security model and trust boundaries | [docs/security.md](docs/security.md) |
| Know what the server enforces vs. defers in battle | [docs/battle-simulation.md](docs/battle-simulation.md) |
| Troubleshoot a problem or a surprising behavior | [docs/FAQ.md](docs/FAQ.md) |
| Read the server's logs, or fix a stuck battle or queue | [docs/observability.md](docs/observability.md) |

---

## 🛠️ Tech Stack

| Layer | Choice |
|---|---|
| Runtime | **Node.js ≥ 23.4** (see `package.json` → `engines`) |
| Language | TypeScript 4.8 |
| Web framework | Express.js 4 |
| Database | **`node:sqlite`** (Node built-in — no native binaries) |
| Real-time messaging | HTTP long-polling (`async-mqtt` is installed for a planned MQTT migration but not yet wired into runtime paths) |
| Reverse proxy / TLS | Caddy 2 (production only, via `docker-compose.yml`) |
| Target host | GCP e2-micro (1 GB RAM, free tier) |

---

## ⚡ Quick Start

### Prerequisites

- Node.js **23.4 or newer** — `node --version` must report `v23.4.0+`
- Yarn — `npm install -g yarn`
- Git

> No database server to install. SQLite is built into Node 22.5+ via `node:sqlite`; the DB file is created automatically on first run.

### 1. Install

```bash
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server/bsf-server
yarn install
```

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and set **`JWT_SECRET`** — the server will refuse to start without it. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.example` is the canonical list of every variable the server reads. Other variables (`DB_PATH`, `BSF_DOMAIN`, `DISCORD_*`) are optional for local dev.

### 3. Run

**Windows:**

> **Path note:** Replace `$env:USERPROFILE\Code\BSF\bsf-server` with your actual clone path if different.

```powershell
cd $env:USERPROFILE\Code\BSF\bsf-server ; yarn build ; .\start-server.bat
```

**Linux / macOS:**
```bash
yarn build
node ./build/index.js
```

The server listens on `http://localhost:8082` and creates `./data/bsf.db` (SQLite, WAL mode) on first request.

### 4. Verify

```powershell
cd $env:USERPROFILE\Code\BSF\bsf-server ; yarn test
```

All tests pass. If they fail in a fresh checkout, your environment is wrong — check Node version and `yarn install` output before continuing.

For an end-to-end smoke test (login → queue → match), with the server running:

```bat
test-2p-match.bat
```

---

## What Works Today

<details>
<summary>Click to expand</summary>

**✅ Implemented**
- Steam authentication & 32-bit `account_id` derivation
- HTTP long-polling data delivery (5 s timeout, `/services/game/:session_key`)
- First-come-first-served matchmaking, filtered by game type and power bracket
- Battle lifecycle: ready → deploy → sync → move → action → kill → exit
- Endgame: kill tracking, Elo rating, renown awards (WIN + per-kill + situational bonuses), `battle` table persistence
- Proving Grounds: party arrangement, unit promote/rename/retire/hire, stat upgrades, barracks expansion
- Idle session eviction (30 min) and queue eviction (5 min)
- `/health` liveness endpoint
- Docker + Caddy production stack
- Discord OAuth login path (server-side complete — JWT issued and exchanged for a session via `POST /login/discord/session`; client-side wiring tracked in [Plan-Enable-Mobile-Windows-Crossplay.md](misc/Plan-Enable-Mobile-Windows-Crossplay.md))

**🔴 Not yet**
- Explicit user registration (accounts auto-created on first Steam login)
- Full achievement tracking (placeholder deltas only)
- MQTT real-time transport (library installed; not yet integrated)

</details>

---

## 🤝 Community

- **Discord:** [Banner Saga Discord](https://discord.gg/Jf3FNpV8gv) — `@Pieloaf#1999`
- **Issues / roadmap:** [GitHub Issues](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues)
- **Game client download:** [latest release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/latest) (Adobe AIR runtime bundled — no separate install)

---

*Last updated: 2026-05-05*
