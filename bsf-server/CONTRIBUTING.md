# Contributing to BSF Custom Server

This is the single source of truth for local development, testing, the git workflow,
coding standards, and the memory-management rules that keep the server stable on a
1 GB-RAM host.

If you only want a 60-second project overview, start with [README.md](README.md).
If you want to run the server, follow this file.

> **Last verified against branch:** `RichardElTaino-MVP_documentation-Phase1`

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | `>=24` | Matches the `node:24-alpine` image used in production. Required for the built-in `node:sqlite` module. *(`package.json` `engines` currently says `>=23.4.0` — that field is stale and should be bumped to `>=24` to match the Dockerfile.)* |
| **Yarn** | any recent v1.x | `npm install -g yarn` |
| **Git** | any | |
| **SQLite tooling** | not required | DB driver is built into Node — no native binaries, no `sqlite3` install. |

> **No MySQL.** Older docs reference MySQL — that has been replaced by SQLite via
> `node:sqlite`. Ignore any setup step that asks you to `CREATE DATABASE` or load
> a `.sql` file.

The game client (Adobe AIR bundle, no separate runtime install) is on the
[latest GitHub release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/latest).

---

## 2. Quick Start

The repo is a monorepo with two top-level folders: `bsf-server/` (this Node server) and `bsf-client/` (a git **submodule** pointing at the game-client repo). All the `package.json` / `Dockerfile` / source you will touch lives inside `bsf-server/`.

```bash
# Server-only — submodule not needed
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server/bsf-server
yarn install
cp .env.example .env
```

If you also need the client source, clone with submodules instead:

```bash
git clone --recurse-submodules https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
# or, if you already cloned without --recurse-submodules:
git submodule update --init
```

Edit `.env` and set **`JWT_SECRET`** — the server exits at startup if it is
missing or empty. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then build and start:

```bash
yarn build
start-server.bat        # Windows — builds, kills any stale node, starts fresh
```

The server listens on `http://localhost:8082`.

On macOS / Linux use the equivalent shell script:

```bash
./start-server.sh       # builds, kills any stale node process, starts fresh
```

Or for hot-reload during development: `yarn dev`.

The SQLite database (`./data/bsf.db` by default) is created on first boot
along with all tables — no manual schema step.

---

## 3. Required Data Files

The server reads three JSON files **at module load time**. If any is missing,
`src/services/auth/auth.ts` throws and the process crashes before listening:

| File | Purpose |
|---|---|
| `data/build-number` | Returned in the login response as `build_number` |
| `data/first.json` | Pushed to every client on first long-poll (currency, friends) |
| `data/accounts.json` | Username lookup fallback for unknown `user_id`s |

These are tracked in the repo. Do not delete them. Edits to any of them require
a **full server restart** — `yarn dev` hot-reload picks up `.ts` changes only,
not the cached JSON.

---

## 4. Running Tests

The suite uses Vitest + Supertest. **All tests mock the DB layer**, so no
database, no `.env`, and no running server are needed.

```bash
yarn test            # full run (~3s)
yarn test:watch      # re-run on save
yarn test:coverage   # adds an HTML coverage report
yarn test:ci         # verbose + coverage (used by CI)
yarn test:db         # opt-in DB-integration tests against a real :memory: SQLite
```

Coverage thresholds enforced by CI: **70% lines, 70% functions, 60% branches**.

If a clean checkout fails before you have changed anything, double-check
`node --version` is `>=23.4.0` and that `yarn install` finished cleanly.

### 2-Player Smoke Test

With the server running:

```bat
test-2p-match.bat
```

This logs in two test accounts (`test` / `Pieloaf`), queues both, and asserts
the same `battle_id` reaches both via long-polling. A `[FAIL]` at step 5 is
almost always a power-level mismatch — both parties must have the same total
`(RANK - 1)` sum. Watch the server console for `[MATCHMAKING]` lines.

For a full in-game test use `launch-game-2p.ps1` (Windows + game client
required). See [docs/Development.md § Manual Testing](docs/Development.md#manual-testing)
for single-client, 2-player, long-Steam-ID, Cloudflare-tunnel, and
DuckDNS/GCP launch-flag variants.

---

## 5. Git Workflow

### Branching

```bash
git checkout -b feature/<short-name>
# or
git checkout -b fix/<short-name>
```

### Pre-commit hook

`simple-git-hooks` is installed by `yarn install` (via the `prepare` script)
and runs **`yarn build && yarn test`** before every commit. A failing build
or test blocks the commit locally.

If you bypass it with `git commit --no-verify`, the same checks run in CI on
push and will fail there.

### Commit messages

**Always quote commit messages with single quotes** so the same line works in
bash, zsh, cmd.exe, and PowerShell:

```bash
git commit -m 'fix: guard battle exit against null opponent'
git commit -m 'feat: evict idle sessions after 30 minutes'
```

Write the subject in plain English — what changed and why, not which functions
were touched. Put file names and function names in the body.

Good:
```
Fix crash when exiting a battle after the opponent disconnects

Battle exit route was not guarded against a null opponent reference.
Affected: src/services/battle/battleRouter.ts
```

Avoid: `feat: fix null ref in battleRouter.ts exit handler`

Use a conventional prefix (`fix:`, `feat:`, `chore:`, `docs:`) only when it
adds clarity, never at the expense of plain-English meaning.

### Pull requests

1. Push your branch and open a PR against `main`.
2. CI must be green — `yarn build`, `yarn test:ci`.
3. Describe **what changed and why**, not how. Link any related issue.
4. If you changed behavior visible to the game client, run `test-2p-match.bat`
   and paste the `[OK]` block in the PR description.

---

## 6. Coding Standards

The server runs on a **GCP e2-micro (1 GB RAM)** in production. Every standard
below exists because we have hit the failure mode it prevents.

### 6.1 Memory management — non-negotiable

Two patterns are already in the codebase. New caches must follow one of them.

**Idle eviction** — `src/services/auth/auth.ts`:

```ts
// Sessions evicted after 30 minutes of inactivity
setInterval(reapIdleSessions, 5 * 60 * 1000).unref();
```

The TTL resets on every poll request and every `pushData` call. When a
mid-battle player is evicted, the opponent's TTL clock is also reset to
prevent cascading eviction. `.unref()` is required so the timer does not
hold the event loop open during shutdown.

**Periodic sweep** — `src/services/queue.ts`:

```ts
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;   // 5 min
// swept every 60 s
```

Rules for any new in-memory `Map` / `Record` that grows from client input:

- Implement either idle TTL (`auth.ts` style) or a fixed-age sweep (`queue.ts` style).
- Always call `.unref()` on `setInterval` / `setTimeout` you create at module scope.
- Have a clean-up path on every disconnect / timeout / error branch — never
  rely on the GC alone.
- Never `console.log` an entire battle or session object — they contain
  circular references and large `defs[]` arrays.

### 6.2 `accountData` is the in-session source of truth

`session.accountData` is populated at login and held in memory for the session
lifetime. DB writes (`saveParty()`, `saveRoster()`) are **fire-and-forget** —
reading back from the DB mid-session returns stale data. Mutate
`session.accountData` and let the DB catch up asynchronously.

### 6.3 32-bit `account_id` vs 64-bit Steam ID

`auth.ts` derives:

```ts
STEAM_ID_BASE = 76561197960265728
account_id    = Number(user_id - STEAM_ID_BASE)   // 32-bit
```

| Field | Width | Used in |
|---|---|---|
| `session.user_id` | 64-bit | DB rows, login, Steam |
| `session.account_id` | 32-bit | All battle messages: `party.user`, `team`, `user_id`, `aliveUnits` keys, DJB hash inputs |

Mixing them causes the client-side DJB hash to diverge at turn 0 and the game
shows a desync error. Pick the right one for the layer you are in.

### 6.4 TypeScript / language rules

- **No `var`.** `const` by default, `let` only when reassignment is needed.
- **`parseInt(value, 10)`** — always pass the radix.
- **Explicit null checks** (`val !== null`, `val !== undefined`) over truthy
  checks where `0`, `""`, or `false` are valid.
- **Wrap every DB call in `try / catch`.** Clean up in-memory state before
  returning a 500.
- **No `any`.** Type DB rows via the helpers in `src/db/*` (`AccountRow`,
  `BattleRow`).

### 6.5 Logging

Use the established prefixes so log greps keep working:

```
[BATTLE] ...
[MATCHMAKING] ...
[AUTH] ...
[QUEUE] ...
```

`console.log` is fine for now — there is no logger framework. Do not add one
without discussing first.

---

## 7. Doc ↔ Code Cross-Reference

When you change one of these areas, update the matching doc in the same PR.

| Doc | Code area |
|---|---|
| [README.md](README.md) | Top-level scope, prerequisites, quick start |
| [CONTRIBUTING.md](CONTRIBUTING.md) (this file) | Local dev workflow, testing, coding standards |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | `src/index.ts` (routing), `src/services/auth/auth.ts`, `src/services/game.ts`, `src/db/*` |
| [docs/serverEndpoints.md](docs/serverEndpoints.md) | All `/services/*`, `/login/discord/*`, `/health`, `/debug/*` route handlers |
| [docs/gameFlow.md](docs/gameFlow.md) | `src/services/queue.ts`, `src/services/battle/Battle.ts`, `endgame()` |
| [docs/dataStructures.md](docs/dataStructures.md) | `src/services/battle/BattlePartyData.ts`, `BattleTurnData.ts`, wire formats |
| [docs/Development.md](docs/Development.md) | Steam launch flags, Fiddler captures, IDE setup, debug recipes |
| [CHANGELOG.md](CHANGELOG.md) | Any user-visible change |
| [docs/HISTORY.md](docs/HISTORY.md) | Original Stoic stack, MySQL era, decommissioned subsystems |
| [Plan-ServerSetupAndDeployment.md](Plan-ServerSetupAndDeployment.md) | `Dockerfile`, `docker-compose.yml`, Caddy config, GCP runbook |

---

## 8. Where Things Live

```
bsf-server/
├── src/
│   ├── index.ts                      # Express app + session middleware
│   ├── const.ts                      # Protocol enums (ServerClasses, GameModes)
│   ├── db/
│   │   ├── connection.ts             # node:sqlite, WAL mode, query helpers
│   │   ├── account.ts                # upsertAccount, addRenown, saveParty, saveRoster
│   │   ├── battles.ts                # saveBattleResult
│   │   └── schema.sql                # DDL — informational; auto-applied by connection.ts
│   └── services/
│       ├── auth/
│       │   ├── auth.ts               # Session, sessionHandler, idle eviction
│       │   └── discord.ts            # Discord OAuth (incomplete — returns 501)
│       ├── battle/
│       │   ├── Battle.ts             # Battle state, endgame, renown
│       │   ├── BattlePartyData.ts
│       │   └── BattleTurnData.ts
│       ├── queue.ts                  # Matchmaking + 5-min queue sweep
│       ├── game.ts                   # Long-poll delivery
│       ├── chat.ts
│       ├── account.ts
│       └── download.ts
├── data/                             # build-number, first.json, accounts.json, acc.json, lboard.json
├── docs/                             # ARCHITECTURE, gameFlow, serverEndpoints, dataStructures, etc.
├── Dockerfile                        # node:24-alpine
├── docker-compose.yml                # app + caddy + db-data volume
└── package.json                      # engines.node = ">=23.4.0"
```

---

## 9. Common Gotchas

**Stale build.** `yarn dev` does not rebuild the compiled `build/` directory.
If you are running `start-server.bat` or `node build/index.js`, run `yarn build`
first. This is the single most common "my change isn't working" cause.

**`first.json` and friends are cached at module load.** Any edit to a JSON
file in `data/` requires a full restart, not a hot-reload.

**Session key `"11"` is a hardcoded login bypass — not a bug.**
`POST /services/auth/login/11` is how the game client logs in; any other path
segment is treated as a real session key and rejected if it does not match.

**Blank units in battle = missing `name` in `data/acc.json`.** Every
`EntityDef` must have a `name` property; the client silently renders blanks
otherwise.

**Discord OAuth returns 501.** The session-exchange step is not implemented.
The login route exists end-to-end but a 501 at the callback is expected.

**MQTT is in `dependencies` but not used.** `async-mqtt@^2.6.3` is installed
because earlier prototypes used it; no source file imports it today.
Do not add MQTT use without a discussion in an issue first.

---

## 10. Where to Go Next

| Doc | What's in it |
|---|---|
| [README.md](README.md) | Project overview, scope, quick start |
| [docs/Development.md](docs/Development.md) | Full debug recipes, IDE setup, Steam launch flags, internet-test |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, request flow, design decisions |
| [docs/serverEndpoints.md](docs/serverEndpoints.md) | HTTP API reference + transport (long-poll vs JSON) |
| [docs/gameFlow.md](docs/gameFlow.md) | Battle lifecycle, matchmaking, endgame |
| [docs/dataStructures.md](docs/dataStructures.md) | Wire-format payloads |
| [CHANGELOG.md](CHANGELOG.md) | Release history + root-cause notes |
| [docs/HISTORY.md](docs/HISTORY.md) | Original Stoic stack and the MySQL era |
| [docs/Deployment.md](docs/Deployment.md) | GCP e2-micro deploy runbook |

---

*Last updated: 2026-05-05*