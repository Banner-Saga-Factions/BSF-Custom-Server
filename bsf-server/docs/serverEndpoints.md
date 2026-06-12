# Endpoints

These are all the server endpoints that the client makes requests to.

All endpoints are formatted as `services/{service name}/{some action}/{session key}`

There is a looooot of data so this will be very much WIP for a long time and subject to change as more of the data is understood.

Two routing exceptions worth noting: the login route is `services/auth/login/11` (the trailing `11` is an auth-bypass sentinel, not a session key), and the Steam-overlay no-op uses `services/session/steam/overlay/*`. Routes outside `services/*` (`/login/discord/*`, `/health`, `/debug/*`) bypass the session-key middleware entirely.

**Transport pattern.** Every battle/chat route below is "fire-and-forget at the request level" — the handler returns `200 OK` with no useful body, and the actual response is pushed via `session.pushData()` into the recipient's buffer and delivered on their next `GET services/game/{session_key}` long-poll. Auth/account/queue routes return inline. The Quick Reference Table at the bottom of this file classifies each route.

> **Cross-reference:** for the Java `*Svc.java` analogue of each route below and milestone status, see [`protocol-cross-reference.md`](./protocol-cross-reference.md). For the pinned reference SHA and top-7 highest-value Java paths, see [`../../REFERENCE.md`](../../REFERENCE.md).

## Auth Endpoints

  ### Login

  `POST services/auth/login/11`

  Request
  Key|Value|Description
  ---|---|---|
  `child_number` | `int` | No idea what this is. Possibly an index if two clients are running in the same window? `Unused`
  `client_config` | `JSON` | Client metadata (e.g. O.S., language, screen resolution) `Unused`
  `display_name` | `string` | User display name, set by the username launch argument. `Unused`
  `password` | `string` | Used for Virtual Bulletin Board (VBB) login on official servers. `Unused`
  `steam_auth_ticket` | `string` | Steam Authentication Ticket used for authentication via Steam on official servers. `Unused`
  `steam_id` | `int` | Users Steam ID. Can be overridden with launch arg `--steam_id`. `Used` for user authentication in this implementation
  `username` | `string` | Used for VBB login on official servers. `Unused`
  
  Response
  Key|Value|Description
  ---|---|---|
  `build_number`| `string`| Server build number. Using 1.10.51 as its the same as official servers.
  `display_name`| `string` | Display name used by game client.
  `session_key`|`string`|Session key for the user session. Included in all future requests.
  `user_id`|`int`|User ID number — this is the **64-bit Steam ID**. The 32-bit `account_id` used in all battle messages is derived server-side as `user_id - 76561197960265728` — see [ARCHITECTURE.md → Key Design Decisions](./ARCHITECTURE.md#key-design-decisions).
  `vbb_name`|`string`|VBB-style display name. Equals the value of `display_name`. Was hardcoded `null` before issue #57; the client stored that as the username for the rest of the session, so any UI that printed the username showed nothing.

  **Side effects:** `upsertAccount()` writes the account row to SQLite; `accountData` (party, roster, renown, login streak) is loaded into `session.accountData` for the lifetime of the session.

---
  ### Logout

  `POST services/auth/logout/{session_key}`

  Request 
  Key|Value|Description
  ---|---|---|
  `steam_id` | `int` | Users Steam ID. `Unused`.
  `steam_ticket` | `string` | Steam Authentication Ticket used for authentication via Steam on official servers `Unused`
  
  Response
  
  `200 OK`

  **Side effects:** `dequeuePlayer(session_key)` runs first so a stale queue entry can't outlive the session, then `removeSession(session_key)`.

## Account Endpoints

  ### Account Info

  `GET services/account/info/{session_key}`

  Response
  Key|Value|Description
  ---|---|---|
  `completed_tutorial`|`boolean `|Indicates if the game client should start the first tutorial battle 
  `daily_login_bonus`|`int`| Renown bonus corressponding to daily login streak
  `daily_login_streak`|`int`| Number of consecutive days player logged in
  `iap_sandbox`|`boolean`| Always `false` in this server — no IAP path exists.
  `login_count`| `int` | Total user login count
  `party`|`JSON`|Object containing user party data. For deatils see [`party`](./dataStructures.md#party)
  `purchaseable_units`|`JSON`|Object containing units availbale for the player to purchase. FOr details see [`PurchasableUnitData`](./dataStructures.md#purchasableunitdata)
  `purchases`|`?`|Always empty in this server — no IAP path exists.
  `renown`|`int`| Amount of renown in user account
  `roster`|`JSON`|Object containing all users battle units. For details see [`roster`](./dataStructures.md#wip)
  `roster_rows`|`int`| Number of barracks **grid rows** the client renders. Total unit capacity is `roster_rows × 9` (9 slots per row). Capped at `MAX_ROSTER_ROWS = 8` (72 slots). Mutated only by `POST services/roster/unlock/{session_key}` (60 renown per row) and at account creation.
  `unlocks`|`?`|Always empty in this server — no IAP path exists.

  This handler returns the in-memory `session.accountData` snapshot — the authoritative source during a session. DB writes (`saveParty`, `saveRoster`) are fire-and-forget; reading back from SQLite mid-session would return stale data.

  ### Party Update

  `POST services/account/update/{session_key}`

  Updates the player's active party (Proving Grounds "Save Party"). The submitted `party.ids` array must contain only IDs that exist in the player's roster; the server caps it at 6 and rejects unknown IDs.

  **Side effects:** updates `session.accountData.party` in memory and persists via `saveParty()` to SQLite.

  ### Roster Update

  `POST services/roster/party/arrange/{session_key}`

  Handles all Proving Grounds roster mutations: hire, retire, rename, promote, stat upgrades, and barracks-row expansion.

  **Side effects:** updates `session.accountData.roster_json` in memory and persists via `saveRoster()` to SQLite. `roster_rows` is **only** mutated by `POST /roster/unlock` (calling `expandBarracks()`), which costs 60 renown per row and rejects with `400 {"error":"barracks at max"}` once `roster_rows >= MAX_ROSTER_ROWS` (8).

  ### Roster Stats Purchase

  `POST services/roster/unit/stats/purchase/{session_key}`

  Spends renown to increase one or more of a unit's stat values. Called by the client's `PurchaseStatsTxn` (per `game/session/actions/PurchaseStatsTxn.as`); the AS3 stat panel batches every `+` click on a stat into one delta per stat when the player hits Confirm, so a single request often carries the cumulative delta for several stats.

  Request

  Key|Value|Description
  ---|---|---|
  `unit_id`|`string`|ID of the unit on the player's roster.
  `stats`|`string[]`|Stat names (e.g. `["STRENGTH", "ARMOR"]`). Duplicates rejected with 400.
  `deltas`|`number[]`|Per-stat deltas, parallel to `stats`. Must be integers in `[0, 20]`. `0` is tolerated as a no-op (the client adds any interacted stat to its batch, so `+1 then -1` yields `0` for that stat). Negative deltas rejected; refunds belong on `/unit/stats/reset`.

  Response

  `200 OK`

  Status codes: `400` (missing fields, non-integer delta, `delta < 0` or `delta > 20`, unknown stat name, duplicate stat names), `401` (no `accountData`), `404` (unknown `unit_id`), `500` (DB error — in-memory stats are rolled back).

  **Per-delta cap.** Server enforces `0 <= delta <= 20` as a generous sanity check. The real per-stat ceiling is enforced client-side against the unit's `StatRange` (`FactionsLegend.as:252-260`); StatRange data is not yet ported server-side. Old cap of 5 was too tight for the batched-confirm flow and caused issue #71 (stat upgrades silently reverted on the next `/account/info` refresh). Original 2013 Java reference has no per-delta cap, only `StatRange.validate(value + delta)`.

  **No renown deduction.** Cost is computed by the client locally (see comment at `src/services/roster.ts:174-175`). Future stream: add server-side cost table to close this loop.

  ### Roster Stats Reset

  `POST services/roster/unit/stats/reset/{session_key}`

  Resets a unit's stats to the factory defaults from the `purchasable_units` template. Called by the client's `ResetStatsTxn` (per `c:\decompile\bsf\scripts\scripts\game\session\actions\ResetStatsTxn.as`).

  Request

  Key|Value|Description
  ---|---|---|
  `unit_id`|`string`|ID of the unit on the player's roster (e.g. `archer_start_0`).

  Response

  `200 OK`

  Status codes: `400` (missing `unit_id`), `401` (no `accountData`), `404` (unit or template not found), `500` (DB error — in-memory stats are rolled back).

  **No renown refund.** The symmetric `/unit/stats/purchase` route does not deduct renown server-side (cost is computed by the client locally — see the comment at `src/services/roster.ts:174-175`). Refunding here would mint free renown.

  **Side effects:** Looks up the template by `entityClass` (the canonical class key — the per-unit `id` is mutated to `<class>_start_<n>` during hire). Replaces `unit.stats` with a deep copy of `template.def.stats`. Calls `saveRoster()` and on success leaves `session.accountData.roster_json` as the new state; on DB failure restores the snapshot.

  ### Roster Unit Retire

  `POST services/roster/unit/retire/{session_key}`

  Dismisses a unit from the player's roster and refunds the renown originally spent on it. Symmetric with `/unit/hire`.

  Request

  Key|Value|Description
  ---|---|---|
  `unit_id`|`string`|ID of the unit on the player's roster (e.g. `archer_start_0`).

  Response

  `200 OK`

  Status codes: `400` (missing `unit_id`), `401` (no `accountData`), `404` (unknown `unit_id`), `500` (DB error — in-memory roster, party, and renown all unchanged).

  **Refund formula.** `template.cost + (rank >= 2 ? 20 : 0) + (rank >= 3 ? 80 : 0)`. Hire price comes from the `purchasable_units` template matched by `entityClass` (same lookup pattern as `/unit/stats/reset`). Rank-up portion mirrors `/unit/promote` exactly (20 for 1→2, 80 for 2→3). A fresh-hire rank-1 archer (cost 10) refunds 10; a rank-3 archer refunds 110.

  **Missing template.** If `entityClass` is no longer in the `purchasable_units` catalog (e.g. removed or renamed in a content update), the unit is still dismissed and the rank-up portion is refunded, but the hire price is treated as `0` — the server refuses to refund what it can't verify was paid. A console warning is logged. This deliberately diverges from `/unit/stats/reset`, which 404s on missing template; reset *needs* `template.def.stats` to do its work, retire doesn't, and blocking the dismiss would leave the player with a paid-for roster slot they can't free up.

  **Missing RANK stat.** Falls back to `rank = 1` (refund hire only). Defensive — no legitimately hired unit should be missing its RANK stat.

  **Side effects.** If the unit is in the active party, removes it from `party_ids_json`. The new helper `saveRosterAndAddRenown(user_id, roster_defs, delta, party_ids?)` updates `roster_json`, `renown`, and (when changed) `party_ids_json` in a single atomic `UPDATE`. On DB failure the in-memory `accountData` is left untouched (locals never assigned to `acc`).

  **Push side-effects.** On success the route calls `session.pushData(...)` with a `tbs.srv.util.RenownMsg` (`ServerClasses.RENOWN_MESSAGE`) carrying the **new absolute renown total** (`acc.renown`), not the refund delta. This is because the AS3 client at `bsf-refs/client-2013-as3/.../GameFsm.as:346` does `config.accountInfo.legend.renown = rm.total` — an assignment, not an addition. Sending the delta would set the on-screen counter to just the refund amount. The push lets the Proving Grounds UI refresh the renown counter immediately, without the player having to exit and re-enter the building (which is what triggers a fresh `/account/info` poll). Same message shape as the post-battle push at `src/services/battle/Battle.ts:744-755`. No push fires on the 500 DB-failure path — `acc.renown` is unchanged, and pushing a stale total would mislead the client.

  **Divergence from original.** The 2013 Stoic Java server (`tbs/srv/web/svc/roster/unit/retire/UnitRetireSvc.java`) just `DELETE`d the row with no refund. We diverge: the no-refund behaviour made the button effectively unusable.

## Game Endpoints
  
  ### Leaderboards

  `POST services/game/leaderboards/{session_key}`
    
  Request
  Key|Value|Description
  ---|---|---|
  `board_ids`|`Array<strings>`|List of leaderboard ids to request data from. Any of [`ELO`, `WINS`, `WINLOSS`, `TOTAL`, `BEST_WIN_STREAK`, `WIN_STREAK`]
  `tourney_id`|`int`|Tournament id; `0` for quick play
  
  Response
  Key|Value|Description
  ---|---|---|
  `boards`|`Array<JSON>`|An array of leaderboard objects. See [`LeaderboardData`](./dataStructures.md#wip)
  `class`|`tbs.srv.data.LeaderboardsData`|Indicates the data structure to the game client
  `max_entries`|`int`|Maximum number of leaderboard entries returned from the server

  The body is currently served from the static `data/lboard.json` snapshot — there is no live ranking pipeline yet.

---
  ### Location

  `POST services/game/location/7bda00000e7454dd`
  
  Request
  
  This is one of the few endpoints that sends plaintext data.

```
data = {player current location} e.g. loc_strand, loc_greathall, loc_proving_grounds
```

  Response

  `200 OK`

  The value is read and discarded — the server has no business logic on location updates. Kept for protocol parity with the original Stoic server.

---

  ### Session Data

  `GET services/game/{session_key}`

  Response

  The response to this data can be anything really. All thats certain is, if theres data its returned as an array; if there's no data the server responds with status 200. See [Data Structures](./dataStructures.md) and [Typical Game Flow](./gameFlow.md) for more information on what to expect as return data on the `game/{session_key}` endpoint.

  **Long-poll behaviour:** if `session.data` already has buffered messages, the response returns them immediately and clears the buffer. Otherwise the request waits up to **10 seconds** for a `'data'` event from `session.pushData()`. On timeout the response is `200 OK` with an empty body (the client reconnects after ~2s). A `pollingActive` flag prevents two concurrent polls per session — the second returns `429`.


## Queue Endpoints

  ### Join Queue

`POST services/vs/start/{session_key}`

  Request 

Key|Value|Description
---|---|---|
`match_handle`|`int`|The number of queue (or game, I'm not sure) for the current user session
`vs_type`|`string`|Indicates the game mode. One of [`QUICK`, `RANKED`, `TOURNEY`]
`tourney_id`|`int`|Tournament id; `0` for quick play
`party`|`JSON`|Object containing user party data. For deatils see [`party`](./dataStructures.md#party)
`timer`|`int`|Round timer in seconds. Default: `45` 

  Response

Returns an array with a single `ServerStatusData` object:

Key|Value|Description
---|---|---|
`class`|`tbs.srv.data.ServerStatusData`|Indicates the data structure to the game client
`session_count`|`int`|Current number of active sessions (players online)

**Errors**:
- `400` — `vs_type` is not one of `QUICK`, `RANKED`, `TOURNEY`
- `409` — player is already in the queue (duplicate entry)

  **On match:** `matchmaking()` runs synchronously inside this handler. If an opponent with the same `vs_type` and the same power level (`sum(RANK − 1)` over party units) is already queued, both entries are removed from `gameQueue`, a `Battle` is constructed, and `BattleCreateData` is pushed to **both** sessions. Each client receives it on its next `GET services/game/{session_key}`.

  The submitted `party` is also stamped onto `session.accountData.party` for the rest of the session.


---

### Cancel Queue

  `POST services/vs/cancel/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `match_handle`|`int`|Match handle of the queue being cancelled

  Response

  `200 OK`

  No opponent notification needed — the entry hadn't matched yet.

## Battle Endpoints

### Battle Ready Route

  `POST services/battle/ready/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle

  Response

  `200 OK`

  Pushes `BattleReadyData` to the opponent's session (delivered on their next long-poll).

--- 

### Battle Deploy Route

  `POST services/battle/deploy/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `tiles`|`Array<x,y>`|Array of JSON objects, each with an x and y field denoting the unit position on the map (see [`tiles`](./dataStructures.md#tiles)). I assume the order of the tiles maps to the order of units in the [`party`](./dataStructures.md#party) array.

  Response

  `200 OK`

  Pushes `BattleDeployData` to the opponent's session.

--- 

### Battle Sync Route

   `POST services/battle/sync/{session_key}` 

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entities`|`Array`|Array of entites? This field seems to be always empty for sync requests. **To be investigated**
  `entity`|`string`|The unit whose turn is starting, formatted as `{account_id}+{index}+{unit_id}`.
  `hash`|`int`|A unique hash generated by the client. Both clients generate the same new hash for each turn. The server **does not** validate it — it only forwards each side's hash to the opponent so the opponent's client can compare. Verified in `src/services/battle/Battle.ts` (the sync handler is a pass-through relay).
  `randomSampleCount`|`int`|The number of RNG samples consumed since the previous sync, used by the client's deterministic-RNG check.
  `team`|`string`|String of current turns team (just the user id). Not sure exactly what its for, possibly for validating the team whose turn it is, is agreed by both clients? **To be investigated**
  `turn`|`int`|Turn number

  Response

  `200 OK`

  Pushes `BattleSyncData` to the opponent.

---

### Battle Query Route

   `POST services/battle/query/{session_key}` 

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `turn`|`int`|Turn number being queried

  Response

  `200 OK`

  If `battle.turns[turn]` exists, every message in it is pushed back to the **requesting** session's own buffer (not the opponent's); the client receives them on its next long-poll. Used to recover from missed messages within a turn.

---

### Battle Move Route

  `POST services/battle/move/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entity`|`string`|String composed of user id and enitity id, indicating the unit to be moved
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn but not sure. **To be investigated**
  `tiles`|`Array<x,y>`|An array of JSON objects, each with an x and y field indicating the path take by the unit
  `turn`|`int`|Battle turn number

  Response

  `200 OK`

  Pushes `BattleMoveData` to the opponent.

---

### Battle Action Route

  `POST services/battle/action/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `action`|`string`|Action name
  `entity`|`string`|String composed of user id and enitity id, indicating the unit to be moved
  `execution_id`|`int`|Per-action sequence number used by the client to disambiguate same-turn repeats of the same ability.
  `level`|`int`|The unit's stat value for this ability (`RANK`/`SP`/etc, depending on `action`).
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn but not sure. **To be investigated**
  `target_ids`|`Array<string>`|Array of entity ids targetted by the ability
  `terminator`|`Boolean`|Indicates if action ends current turn
  `tiles`|`Array<x,y>`|AoE/line footprint for abilities like Run-Through.
  `turn`|`int`|Battle turn number
  `user_id`|`int`|Always `0` in the client request; the server overwrites it from `session.account_id` before forwarding so the recipient sees the correct shooter.

  Response

  `200 OK`

  Pushes `BattleActionData` to the opponent.

---

### Battle Killed Route

  `POST services/battle/killed/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entity`|`string`|Unit id indicating the killed unit
  `killedparty`|`int`|User id of the team whose unit has been killed. Arrives as a **string** in the request body; the server `Number(...)`s it before strict-equality comparison — see [CHANGELOG.md → 0.2.0 endgame fixes](../CHANGELOG.md).
  `killer`|`string`|Unit id of the killing unit
  `killerparty`|`int`|User id of the team whose unit has made the kill
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn but not sure. **To be investigated**
  `turn`|`int`|Battle turn number
  `user_id`|`int`|Always `0` in the client request; the server overwrites it from `session.account_id` before forwarding.

  Response

  `200 OK`

  **Side effects:** the killed entity is removed from `battle.aliveUnits[killedparty]`. If `aliveUnits[killedparty]` is now empty, `battle.winner` is set to `killerparty` and `endgame()` runs (fire-and-forget): kill counts derived from `aliveUnits` deltas, `winnerRenown = 20 + kills × 3`, `loserRenown = kills × 3`, awarded via `addRenown()` (SQLite), result persisted via `saveBattleResult()`, then `BattleFinishedData` + `RenownMessage` pushed to **both** sessions. Otherwise just `BattleKilledData` is pushed to the opponent.


--- 

### Battle Exit Route

  `POST services/battle/exit/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entity`|`string`|String composed of user id and enitity id. Always set to `NULL` on battle exit
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn. Think it's always set to 0 for battle exit but not sure. **To be investigated** 
  `turn`|`int`|Battle turn number. Set to 0 on battle exit
  `user_id`|`int`|Always `0` in the client request; the server overwrites it from `session.account_id` before forwarding.

  Response

```json
{ "status": "success", "battle_id": "<battle_id>" }
```

  The player's entry is removed from `battle.parties`. If both players have exited, the battle is removed from the battle map.

  **Surrender path:** if `/battle/exit` is called while `battle.winner` is still `null`, the server delegates to the shared `finalizeSurrender()` helper (see [Battle Surrender Route](#battle-surrender-route)) which declares the opponent the winner, pushes `BattleSurrenderData` to the winner, and runs `endgame()`. Both players receive `BattleFinishedData` and renown. This route and `/battle/surrender` are the only two battle routes allowed to succeed after the opponent has disconnected.

---

### Battle Surrender Route

  `POST services/battle/surrender/{session_key}`

  Called by the client's `BattleTxnSurrenderSend` when a player surrenders mid-battle (per `c:\decompile\bsf\scripts\scripts\engine\battle\fsm\txn\BattleTxnSurrenderSend.as`).

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle ID for the player's current battle.
  `turn`|`int`|Current battle turn. **Accepted but ignored server-side** — the server doesn't track per-battle turn numbers; the client uses `turn` only for its own retry de-duplication.

  Response

  `200 OK`

  **Effects:**
  - Calls the shared `finalizeSurrender()` helper. Bails out (no-op) if `battle.endgameStarted === true` already, or if no opponent is present.
  - Sets `battle.endgameStarted = true` and `battle.winner = opponent.account_id`.
  - Pushes a `BattleSurrenderData` message to the opponent **first** (with `user_id` = the surrendering player's `account_id`). This is required so the opponent's client transitions to `BattleStateFinish` per `BattleFsm.as:273-289` — without it, the subsequent `BattleFinishedData` is dropped because the winner is still in a turn-state.
  - Calls `endgame()` which writes renown and the battle-result row to SQLite, then pushes `RenownMessage` + `BattleFinishedData` to both sessions.
  - Does **not** delete the player's entry from `battle.parties` and does **not** clear `session.battle_id`. The client follows up with its own `/battle/exit` call (per `BattleStateSurrender.as` flow); both routes share the same `finalizeSurrender()` helper so the second call is a no-op via the `endgameStarted` guard.

---

## Chat Endpoint

### Send Chat Message

  `POST services/chat/{room}/{session_key}`

  `room` is `global` for the lobby chat or the `battle_id` string for in-battle chat.

  Request body is **plaintext** (not JSON) — the raw chat message string.

  Response

  `200 OK`

  Pushes a `ChatMessage` object to all sessions subscribed to that room; recipients receive it on their next `GET services/game/{session_key}` long-poll.

---

## Lobby Endpoints

The Flash client makes eight distinct calls into `/services/lobby/*` for squad creation, party invites, and the "Challenge a Friend" private-match flow. These are currently implemented as **stateless 200 stubs** — every URL shape returns an empty `200 OK` and no server-side state is kept. This unblocks the squad-creation UI (the client no longer 404s and the screens advance), but two players cannot complete a real lobby flow because there is no shared state and no invite delivery.

A separate follow-up issue tracks the three options for a real implementation:
1. Stateless stubs (current)
2. In-memory lobby state mirroring the `Battle` class (~200–400 LOC, lost on restart)
3. DB-backed lobbies with schema + migration (persistent invite history)

### LobbyTxn

  `POST services/lobby/{action}/{session_key}`

  Where `{action}` is one of `uninvite`, `join`, `decline`, `exit`, `ready`, `unready` (verified from `c:\decompile\bsf\scripts\scripts\game\cfg\Lobby.as`).

  Request body: an integer (lobby ID or user ID, depending on action) sent as a plaintext string.

  Response: `200 OK` empty body.

### LobbyOptionsTxn

  `POST services/lobby/options/{session_key}`

  Request body: `LobbyOptionsData` JSON (per `c:\decompile\bsf\scripts\scripts\tbs\srv\data\LobbyOptionsData.as`).

  Response: `200 OK` empty body.

### LobbyInviteTxn

  `POST services/lobby/invite/{session_key}`

  Request body: `LobbyOptionsData` JSON.

  Response: `200 OK` empty body.

---

## Discord OAuth Endpoints

  ### Start OAuth Flow

  `GET /login/discord/oauth-start`

  Redirects the client to Discord's OAuth authorization page. No session key required.

  ### OAuth Callback

  `GET /login/discord/oauth-callback`

  Discord redirects back here after user authorization. Exchanges the code for tokens and creates a Discord-linked session. No session key required.

  ### Session Exchange

  `POST /login/discord/session`

  Intended to exchange a Discord OAuth token for a game session key. **Not yet fully implemented** — the ServiceRouter middleware returns `501` if a raw Discord JWT is submitted to a game route instead of first calling this endpoint. The endpoint itself currently returns `401` or `500` on error; full session-exchange logic is pending.

---

## Health & Debug Endpoints

  ### Health Check

  `GET /health`

  Liveness check used by Caddy / Docker. Returns `200 OK`. Bypasses session-key middleware.

  ### Debug: Party Limit

  `GET /debug/party-limit`

  Dev-only — gated by `process.env.NODE_ENV !== "production"`. Returns or sets the maximum party size for testing.

---

**Quick reference table**:

| Route | Method | Transport |
|---|---|---|
| `services/auth/login/11` | POST | Direct |
| `services/auth/logout/{key}` | POST | Direct |
| `services/account/info/{key}` | GET | Direct |
| `services/account/update/{key}` | POST | Direct |
| `services/roster/party/arrange/{key}` | POST | Direct |
| `services/roster/unit/retire/{key}` | POST | Direct |
| `services/game/{key}` | GET | Long-poll itself |
| `services/game/leaderboards/{key}` | POST | Direct |
| `services/game/location/{key}` | POST | Direct |
| `services/vs/start/{key}` | POST | Direct + Long-poll target on match |
| `services/vs/cancel/{key}` | POST | Direct |
| `services/chat/{room}/{key}` | POST | Long-poll target → room members |
| `services/battle/ready/{key}` | POST | Long-poll target → opponent |
| `services/battle/deploy/{key}` | POST | Long-poll target → opponent |
| `services/battle/sync/{key}` | POST | Long-poll target → opponent |
| `services/battle/query/{key}` | POST | Long-poll target → self |
| `services/battle/move/{key}` | POST | Long-poll target → opponent |
| `services/battle/action/{key}` | POST | Long-poll target → opponent |
| `services/battle/killed/{key}` | POST | Long-poll target → opponent (+ both on last kill) |
| `services/battle/exit/{key}` | POST | Direct |
| `/login/discord/oauth-start` | GET | Direct |
| `/login/discord/oauth-callback` | GET | Direct |
| `/login/discord/session` | POST | Direct (501 today) |
| `/health` | GET | Direct |
| `/debug/party-limit` | GET | Direct (dev only) |

---

*Last updated: 2026-05-07*
