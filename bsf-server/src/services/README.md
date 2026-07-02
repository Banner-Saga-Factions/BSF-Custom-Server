# `src/services/` — Service layer

Each file or subfolder here handles one part of the game backend. Every request
from the game client comes in under `POST/GET /services/*`, has its session
checked in `src/index.ts`, and is then handed to the matching handler in this
folder. See [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md#component-architecture)
for the subsystem overview and
[`serverEndpoints.md`](../../docs/serverEndpoints.md) for the route map.

| Path | Role |
|---|---|
| `auth/` | Session model, login, Discord OAuth, and the 30-minute session reaper. |
| `battle/` | Battle lifecycle, Elo, and renown — see [`battle/README.md`](battle/README.md). |
| `account.ts` | `/account/info` and `/account/update`. |
| `roster.ts` | Roster changes: arrange / promote / rename / retire / hire / stats / unlock. |
| `queue.ts` | Matchmaking — the queue, the 5-second re-check, and the power/Elo windows. **A single file, not a `queue/` directory.** |
| `game.ts` | The `/services/game` long-poll that delivers pushed data to clients. |
| `lobby.ts` | The 8 lobby endpoints (invite / uninvite / exit / join / decline / options / ready / unready) — kept in memory only. |
| `chat.ts` | Chat message relay. |
| `download.ts` | Game-client download routes. |
| `*.test.ts` | `matchmaker.test`, `matchmaker0058.test`, `matchmakerTick.test`, `queue.test`. |

> **#82 deviation:** the doc-gaps issue originally listed a `src/services/queue/README.md`, but queue is the single file `queue.ts`, so its orientation lives here instead.

**More detail:** [`gameFlow.md`](../../docs/gameFlow.md) (battle + matchmaking lifecycle) · [`serverEndpoints.md`](../../docs/serverEndpoints.md) (every route).

**Gotchas** (full list in [`docs/FAQ.md`](../../docs/FAQ.md)):

- Express strips the `/services` prefix inside the routers — match on `/session/...`, not `/services/session/...`.
- The session key is the **last** part of the URL path; `"11"` is the login bypass.
- Only one long-poll runs per session at a time (`pollingActive`).
