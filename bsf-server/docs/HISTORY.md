# Project History & Heritage

This document preserves the historical context of the Banner Saga Factions
(BSF) server architecture and the process used to reconstruct it. For the
current implementation see [ARCHITECTURE.md](ARCHITECTURE.md).

## Original Stoic server stack

The official server (operational until 2022) used the following technologies.
Our implementation aims for **protocol parity, not implementation parity** —
the wire format the game client expects is faithfully reproduced; the
internals look nothing like the original.

| Layer | Original (Stoic) | This implementation |
|---|---|---|
| Language | Java | TypeScript / Node.js |
| OS | Linux | Cross-platform (Docker, deployed on Ubuntu 22.04) |
| Database | MySQL | SQLite (`node:sqlite`) |
| Real-time messaging | **RabbitMQ** | HTTP long-polling |

RabbitMQ was used by Stoic for pub/sub event delivery (queue updates, battle
events) — the equivalent of what `session.pushData()` + `GET /services/game`
do in this codebase. Our HTTP long-polling approach is a functional substitute
for a small player base. If scaling beyond a few dozen concurrent players
becomes a goal, a message broker is the reference architecture.

## Reverse-engineering process

The logic in this repository was reconstructed primarily through Fiddler /
SAZ captures of the game client recorded in 2022, before the official servers
went dark.

- **Data sources:** see `data/game_captures/` for the raw traffic logs and
  the extracted per-message text dumps under `extracted/raw/`.
- **Client black box:** the game client is an Adobe AIR / Flash application.
  We emulate the server responses it expects to ensure maximum compatibility
  with the original `.swf` files. While we may eventually modify client code
  to support advanced features, our priority remains a "zero-patch"
  onboarding experience for the community.

## Key design evolutions

**MySQL → SQLite (late 2026).** The first iterations of this server used
MySQL via `mysql2` to mirror the original Stoic schema. The MySQL dependency
was removed in favor of `node:sqlite` to simplify deployment and reduce
memory overhead on $0 GCP free-tier hosting (e2-micro, 1 GB RAM). See
`SQLiteMigrationPlan.md` for the full plan and
`Plan-ServerSetupAndDeployment.md` for the resulting deploy story (both archived
in local history, not in the public repo).

**MQTT (introduced, then shelved).** `async-mqtt@^2.6.3` was added to
`dependencies` while exploring whether an MQTT broker could replace the
2-second client polling cadence with push delivery. As of the current
branch the dependency is **installed but unused** — no source file under
`src/services/*.ts` imports it. The decision to either adopt MQTT for real
or drop the dependency is tracked under "Future Improvements" in
[ARCHITECTURE.md](ARCHITECTURE.md).

**Discord OAuth (wired end-to-end).** The Discord login flow is complete:
`oauth-start` → `oauth-callback` (issues a JWT, redirects `302 bsf://auth?...`)
→ `POST /login/discord/session` exchanges the verified JWT for a session key.
The `501 Not Implemented` you may see is the session-gate middleware fallthrough
(`src/app.ts:113-116`) when a *raw* Discord JWT is sent to a game route before
being exchanged — not this login flow. See [`error-handling.md`](error-handling.md).

---

*Last updated: 2026-05-05*
