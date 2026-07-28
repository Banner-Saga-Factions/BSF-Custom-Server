# Protocol cross-reference: `bsf-server` ↔ original Stoic Java

One-line index from each `bsf-server` route to the Java handler in the original Stoic server that defined its wire format. Java paths are relative to `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\` unless noted.

For request/response *shapes*, see [`serverEndpoints.md`](./serverEndpoints.md). For the pinned reference SHA and milestone context, see [`../../REFERENCE.md`](../../REFERENCE.md). For the milestone plan, see [`../misc/Plan-Integrate-Original-Stoic-Server.md`](../misc/Plan-Integrate-Original-Stoic-Server.md).

**The third direction.** This file maps each route *backwards* to the 2013 Java server. `bsf-client/docs/wire-protocol.md` ([local](../../bsf-client/docs/wire-protocol.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/wire-protocol.md)) maps the same routes *forwards* to the game client that calls them — it describes itself as this file's opposite-direction mirror, links here route by route, and carries the route-by-route index of which client class calls each one. (`bsf-client/docs/game-flow.md` → "The actions" ([local](../../bsf-client/docs/game-flow.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/game-flow.md)) lists those same classes grouped by what they do, without routes.) Between the three, any route can be traced from the original server, through ours, to the code that calls it.

## Status legend

- **shipped** — route exists in `bsf-server` and handles the wire format. May still gain features later (e.g. Elo wired into an existing endgame).
- **stub** — route exists but no-ops (returns `200 OK` with empty body).
- **M1 / M1.5 / M2 / M3a / M3b / M4 / M5 / M6 / M7+** — port target in the milestone plan; not yet implemented or implemented partially.
- **missing** — the client calls it and the original server had it, but `bsf-server` doesn't answer it yet. Distinct from *n/a*: this one is a gap, not a design difference.
- **n/a** — exists only on one side, deliberately.

## Auth

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/auth/login/11` | `tbs/srv/web/svc/auth/login/LoginSvc.java` | shipped (Steam-only; vBulletin path skipped) |
| `POST /services/auth/logout/:session_key` | `tbs/srv/web/svc/auth/logout/LogoutSvc.java` | shipped |

## Account

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `GET /services/account/info/:session_key?` | `tbs/srv/web/svc/account/info/AccountSvc.java` | shipped |
| `POST /services/account/update/:session_key` | (no single Java analogue; party/roster persistence is split across `PartySvc` + `UnitHireSvc` etc.) | shipped (BSF aggregate route) |
| `POST /services/account/tutorial/:session_key` | `tbs/srv/web/svc/account/tutorial/AccountTutorialSvc.java` | shipped 2026-05-21 (M3a) |

## Roster

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/roster/party/arrange/:session_key?` | `tbs/srv/web/svc/roster/party/PartySvc.java` | shipped |
| `POST /services/roster/unit/hire/:session_key?` | `tbs/srv/web/svc/roster/unit/hire/UnitHireSvc.java` | shipped |
| `POST /services/roster/unit/promote/:session_key?` | `tbs/srv/web/svc/roster/unit/promote/UnitPromoteSvc.java` | shipped |
| `POST /services/roster/unit/rename/:session_key?` | `tbs/srv/web/svc/roster/unit/rename/UnitRenameSvc.java` | shipped |
| `POST /services/roster/unit/retire/:session_key?` | `tbs/srv/web/svc/roster/unit/retire/UnitRetireSvc.java` | shipped — refunds hire + rank-up renown (diverges from Java, which did not refund) |
| `POST /services/roster/unit/stats/purchase/:session_key?` | `tbs/srv/web/svc/roster/unit/stats/UnitStatsSvc.java` (purchase path) | shipped |
| `POST /services/roster/unit/stats/reset/:session_key?` | `tbs/srv/web/svc/roster/unit/stats/UnitStatsSvc.java` (reset path) | shipped (plan's M4 / Blocker #7 is already closed at `roster.ts:226`) |
| *(no bsf-server route)* — client calls `POST /services/roster/unit/variation/:session_key/:unit_id/:variation/:lobby_id` | `tbs/srv/web/svc/roster/unit/variation/UnitVariationSvc.java` | **missing** — the unit-appearance route, and the root cause behind #98 / #72 / #119. **Two things the port has to handle.** The path doesn't *end* at the session key — three more segments follow it (the Java original declares the same shape). And our session gate reads the key from the **last** path segment (`app.ts:90`), which here is `lobby_id`, so the request is refused with `403` before any handler runs. Client caller: `UnitVariationTxn`. See [`../misc/Plan-Fix-Variation-IAP-Deadend.md`](../misc/Plan-Fix-Variation-IAP-Deadend.md) |
| `POST /services/roster/unlock/:session_key?` | `tbs/srv/web/svc/roster/unlock/RosterRowUnlockSvc.java` | shipped |

## Battle

All battle routes are dispatched in `bsf-server/src/services/battle/Battle.ts`. On the Java side, all of these methods live in a single `BattleSvc.java` (sub-paths via Jersey annotations) backed by `tbs/srv/battle/BattleSystem.java` and `tbs/srv/battle/BattleMonitor.java`.

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/battle/ready/:session_key` | `tbs/srv/web/svc/battle/BattleSvc.java` (`ready`) | shipped |
| `POST /services/battle/deploy/:session_key` | `BattleSvc.java` (`deploy`) | shipped |
| `POST /services/battle/sync/:session_key` | `BattleSvc.java` (`sync`) | shipped |
| `POST /services/battle/query/:session_key` | `BattleSvc.java` (`query`) | shipped |
| `POST /services/battle/move/:session_key` | `BattleSvc.java` (`move`) | shipped |
| `POST /services/battle/action/:session_key` | `BattleSvc.java` (`action`) | shipped |
| `POST /services/battle/killed/:session_key` | `BattleSvc.java` (`killed`) → `tbs/srv/battle/BattleMonitor.checkBattleFinished()` + `BattleRanking` + `RenownSystem` | shipped — Elo is still **M1**, the 6 renown award types are still **M1.5** |
| `POST /services/battle/exit/:session_key` | `BattleSvc.java` (`exit`) | shipped |
| `POST /services/battle/surrender/:session_key` | `BattleSvc.java` (`surrender` path) | shipped (plan's M4 / Blocker #8 is already closed at `Battle.ts:519`) |

## Versus / queue

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/vs/start/:session_key` | `tbs/srv/web/svc/vs/VsSvc.java` → `tbs/srv/worker/VsWorker.java` (NOT `VsSystem.java`, which is just a RabbitMQ wrapper) | shipped — power-recompute-at-match-creation race + band-expansion math are still **M2** |
| `POST /services/vs/cancel/:session_key` | `VsSvc.java` (cancel path) | shipped |

## Game (long-poll + misc)

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `GET /services/game/:session_key` (long-poll) | `tbs/srv/web/svc/game/GameSvc.java` | shipped — collapses several Java GET handlers into one long-poll |
| `POST /services/game/leaderboards/:session_key` | `tbs/srv/web/svc/game/LeaderboardSvc.java` | shipped (live from DB `ranking` table, merged with the `data/lboard.json` historical baseline; #84) |
| `POST /services/game/location/:session_key` | `tbs/srv/web/svc/game/LocationSvc.java` | shipped |

## Chat

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/chat/:room/:session_key` | `tbs/srv/web/svc/chat/ChatSvc.java` | shipped |

## Lobby

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/lobby/invite/:session_key` | `tbs/srv/web/svc/lobby/LobbySvc.invite` → `tbs/srv/util/LobbySystem.invite` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/uninvite/:session_key` | `LobbySvc.uninvite` → `LobbySystem.uninvite` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/exit/:session_key` | `LobbySvc.exit` → `LobbySystem.exit` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/join/:session_key` | `LobbySvc.join` → `LobbySystem.join` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/decline/:session_key` | `LobbySvc.decline` → `LobbySystem.decline` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/options/:session_key` | `LobbySvc.options` → `LobbySystem.option` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/ready/:session_key` | `LobbySvc.ready` → `LobbySystem.ready` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/unready/:session_key` | `LobbySvc.unready` → `LobbySystem.unready` | shipped 2026-05-24 (M3b) |

## Session

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `* /services/session/steam/overlay/:session_key/:flag` | `tbs/srv/web/svc/session/steam/overlay/SessionSteamOverlaySvc.java` | shipped (special-cased no-op pass-through in `app.ts` middleware) |

## Download (BSF-only)

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `GET /services/download/` | — | n/a — BSF-only update channel |
| `GET /services/download/checksum` | — | n/a — BSF-only update channel |

## Discord OAuth (BSF-only, outside `/services`)

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `GET /login/discord/` | — | n/a — BSF-only |
| `GET /login/discord/oauth-callback` | — | n/a — BSF-only |
| `POST /login/discord/session` | — | n/a — BSF-only |

## Originals not yet wired into `bsf-server`

| Java handler | Status / milestone |
|---|---|
| `tbs/srv/web/svc/admin/AdminSvc.java` | **M5** — admin endpoints gated on a new `BSF_ADMIN_KEY` env var (deliberately not the original's `ADMIN_KEY`). |
| `tbs/srv/web/svc/iap/init/IapInitSvc.java`, `iap/info/IapInfoSvc.java`, `iap/finalize/IapFinalizeSvc.java` | **M7+** — IAP/Steam micro-txn. Port shapes; leave `finalize` disabled. |
| `tbs/srv/web/svc/tourney/TourneyJoinSvc.java` | **M7+** — tournaments. |
| `tbs/srv/web/svc/monitor/MonitorSvc.java` | superseded by `GET /health` — no port needed. |
