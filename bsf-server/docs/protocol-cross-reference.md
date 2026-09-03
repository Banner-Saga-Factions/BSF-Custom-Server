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

> **New-account setup runs at login on both sides, and we ported two thirds of it.** `AccountInit`
> sits in the Java package named after `/account/info`, but its only caller is the login route
> (`tbs/srv/web/svc/auth/login/LoginSvc.java:279`), so the original set a first-time player up in the
> same place we do. `AccountInit.setupUser` gives them three things out of one starting-account file:
> a roster, a party, and a pile of renown — `GameConfig.java:231` reads the number,
> `AccountInit.java:96` applies it. We read a file of the same shape (`data/acc.json`) for the roster
> and the party in `src/db/account.ts`, and dropped the renown until #227. Two deliberate divergences
> remain: the amount is 10,000 rather than the file's 19, and we grant it once when the account row is
> created, where the original re-applied it as a floor whenever the roster was empty.
>
> **A third divergence, added by #230: we now decide the tutorial, where the original left it to the
> database.** The 2013 server had this same column — `account_info.completed_tutorial`, added late as
> migration `db/game/69/apply.sql` and also defaulting to `0` — and `AccountInit.setupUser` never
> touched it, so every new account on the original server played the tutorial by the default alone.
> We write the value explicitly in the INSERT instead, defaulting to "already done". The wire key,
> the route (`/services/account/tutorial/{sessionKey}`) and the one-way write are all unchanged;
> only who chooses the starting value has moved. The reason is that this server's players are people
> who already own and have played the game, which was not true of the audience the original was
> written for.

## Roster

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/roster/party/arrange/:session_key?` | `tbs/srv/web/svc/roster/party/PartySvc.java` | shipped |
| `POST /services/roster/unit/hire/:session_key?` | `tbs/srv/web/svc/roster/unit/hire/UnitHireSvc.java` | shipped |
| `POST /services/roster/unit/promote/:session_key?` | `tbs/srv/web/svc/roster/unit/promote/UnitPromoteSvc.java` | shipped |
| `POST /services/roster/unit/rename/:session_key?` | `tbs/srv/web/svc/roster/unit/rename/UnitRenameSvc.java` | shipped |
| `POST /services/roster/unit/retire/:session_key?` | `tbs/srv/web/svc/roster/unit/retire/UnitRetireSvc.java` | shipped — refunds hire + rank-up renown (diverges from Java, which did not refund) |
| `POST /services/roster/unit/stats/purchase/:session_key?` | `tbs/srv/web/svc/roster/unit/stats/UnitStatsSvc.java` (purchase path) | shipped |
| `POST /services/roster/unit/stats/reset/:session_key?` | `tbs/srv/web/svc/roster/unit/stats/UnitStatsSvc.java` (reset path) | shipped (plan's M4 / Blocker #7 is already closed at `roster.ts -> the /unit/stats/reset handler`) |
| `POST /services/roster/unit/variation/:session_key/:unit_id/:variation/:lobby_id` | `tbs/srv/web/svc/roster/unit/variation/UnitVariationSvc.java` | **shipped** 2026-08-29 (#98/#72/#119/#188) — the unit-appearance route. Two things the port had to handle, and both are done: the address does not *end* at the session key (three parts follow it, as in the Java original), so `src/app.ts` matches this route's exact shape to find the key rather than reading the last segment; and the route had to land in the same change as that fix, because a corrected read against a missing route would have produced a `404` the client retries for ever (see R5). **Three deliberate divergences from the original:** it charges nothing (every colour is granted, so the game asks for no payment and the two must agree); an unknown unit answers `400` as the original did, but a *repeat* answers `200` where the original answered `400` "already using variation"; and it does not yet notify the lobby (`LobbySystem.notifyVariation`). Client caller: `UnitVariationTxn`. |
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
| `POST /services/game/location/:session_key` | `tbs/srv/web/svc/game/LocationSvc.java` | shipped (#91 — stores the room and tells the player's friends, as the Java one did via `FriendSystem.notifyLocation`) |

## Friends

**There was never a friend route to port.** The original had no friend endpoint of any kind: friendship
was Steam's, fetched from the Steam Web API by a background worker at sign-in and pushed to the player
over its message queue. Ours is pushed the same way, on the long poll, but the list is simply everyone
signed in — we have no Steam friend graph to import, and the game ships no way for a player to build one.

| `bsf-server` behaviour | Java counterpart | Status |
|---|---|---|
| `FriendsData` pushed at sign-in and whenever somebody joins | `tbs/srv/worker/FriendWorker.doCollectFriends` (triggered by `FriendSystem.collectFriends` from `AccountInit`) | shipped 2026-08-27 (#91) — same message, different source for the names |
| `FriendOnlineData` pushed on sign-in, sign-out and time-out | `tbs/srv/util/FriendSystem.notifyOnline`, called from the Java session's create and expire paths | shipped 2026-08-27 (#91) |
| `GameLocationData` pushed on a room change | `tbs/srv/util/FriendSystem.notifyLocation` | shipped 2026-08-27 (#91) |
| — *(deliberately not ported)* | `friend_battle_record` table + the FRIEND renown bonus in `BattleMonitor` | **declined 2026-08-27 (#205).** Friend matches shipped without it, so the trigger this row was waiting on has now passed. The original paid 6 renown the first time you ever fought a given person, once per pair for life, and stored the pair twice — once per direction — so the lookup was a single row. Revisit only if friend matches need a reason to be worth playing |

## Chat

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/chat/:room/:session_key` | `tbs/srv/web/svc/chat/ChatSvc.java` | shipped |

## Lobby

All eight shipped in M3b but were unreachable from inside the game until the friends list landed
(#91, 2026-08-27) — the only way to invite anyone is to pick a name off a screen that was always blank.

| `bsf-server` route | Java handler | Status |
|---|---|---|
| `POST /services/lobby/invite/:session_key` | `tbs/srv/web/svc/lobby/LobbySvc.invite` → `tbs/srv/util/LobbySystem.invite` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/uninvite/:session_key` | `LobbySvc.uninvite` → `LobbySystem.uninvite` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/exit/:session_key` | `LobbySvc.exit` → `LobbySystem.exit` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/join/:session_key` | `LobbySvc.join` → `LobbySystem.join` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/decline/:session_key` | `LobbySvc.decline` → `LobbySystem.decline` | shipped 2026-05-24 (M3b) |
| `POST /services/lobby/options/:session_key` | `LobbySvc.options` → `LobbySystem.option` | shipped 2026-05-24 (M3b); **divergence narrowed 2026-08-31 (#213)** — the reference accepts this from any session at all, we accept it from anyone in *that* lobby and refuse everybody else. Owner-only was too tight: both players' screens carry the map and turn-length buttons, so the invited player's clicks were thrown away |
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
| Per-player turn length (`data.timer` on the queue entry, `VsSvc.java:58` → `VsWorker.java:701-703`) | **ported 2026-08-31 (#213)**. Each side's `BattlePartyData.timer` is that player's own request, as the reference does; before this we invented it from the seat, which came from misreading capture `0058_s.txt`. **Three divergences.** (1) **We give the battle one clock, not one per player.** `sharedTurnTimer` takes the lower of the two requests, except that `0` (no clock) counts only when both asked for it — otherwise one modified client could take a stranger's clock away and, because a no-clock battle is never ended by our per-turn deadline, stall for ever. (2) We bound the value (whole numbers 0–300, else 45); the reference reads it unchecked, and a negative would reach a countdown the game builds without checking. (3) The reference's `dTimer` matchmaking term (`VsWorker.java:751`), which prefers pairing players who want the same length, is left out — see [`idea-triage.md`](./idea-triage.md). Note the server's own per-turn deadline is **ours**: the reference has no turn timeout of any kind. |
| `VsType.FRIEND` handling in `tbs/srv/worker/VsWorker.java` (the `forcematch` pairing and the `friendly` battle rules) | **ported 2026-08-27 (#205)**, verified end to end in the running game including the endgame (renown `+0` with an empty breakdown, rating and win/loss written to ladder 0). `VsType.FRIEND(equalPower=false, eloWindow=false)` copied into `MODE_CONFIG`; `checkForceMatch` ported, consulted **before** the power/rating windows as the reference does; `friendly` requires both sides to have asked (`VsWorker.java:705`). **Three divergences.** (1) The reference's mirror-image force-match branch (`VsWorker.java:789`) tests the wrong side's field and can never fire; we implement the behaviour its comments describe, in both directions. (2) `allowRanking=false` was **not** ported — a friend match moves rating and win/loss here, a decision taken rather than inherited; only the no-renown half of the original's answer was kept. (3) The requested map is checked against a short allow-list first, because a name the game cannot find makes it abandon the battle. |
