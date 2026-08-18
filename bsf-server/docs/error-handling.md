# Error Handling & Status Codes

How the server signals failure: what each HTTP status code means, where it comes from, and — crucially — how the game client reacts to it. **Read this before debugging a request that "failed."** The client's reaction to a status code is often counter-intuitive (a `500` keeps it polling; a `400` is treated as success), so the status code alone doesn't tell you what the player actually saw.

For each route's full request/response shape see [`serverEndpoints.md`](./serverEndpoints.md); for the overall request lifecycle see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for the client side of the contract see the client's `wire-protocol.md` ([local](../../bsf-client/docs/wire-protocol.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/wire-protocol.md)).

## The session gate (where most 4xx responses come from)

Before any `/services/*` handler runs, one middleware (`src/app.ts:84-121`) decides whether the request is even allowed in. The **order** of checks is the decision tree:

1. **Steam-overlay no-op** (`app.ts:82,85`) — a request matching the exact shape `/session/steam/overlay/<key>/<true|false>` returns `200` immediately and never reaches auth. Any *other* path under that prefix falls through to the checks below.
2. **Session lookup** (`app.ts:90-91`) — the session key is the **last path segment**, looked up in the in-memory sessions map.
3. **`"11"` login sentinel** (`app.ts:106`) — the literal key `"11"` (only ever on `/auth/login/11`) bypasses the session requirement so a player with no session yet can log in.
4. **Discord JWT** (`app.ts:95-104`) — if there is no session, a valid `Authorization: Bearer <jwt>` is decoded for its `discord_id`.
5. **`403` fallthrough** (`app.ts:106-109`) — no session, key isn't `"11"`, and no valid JWT → `sendStatus(403)`.
6. **`409`** (`app.ts:113-122`) — a *valid* Discord JWT but still no session → `sendStatus(409)`. This is the server telling the client "exchange this JWT for a `session_key` at `POST /login/discord/session` first." It is **not** an error in the Discord login route itself. **Was `501` until 2026-07-30**, which the client retried forever (`canRetry` covers everything `>= 500`) — see [`client-contract.md`](client-contract.md) → R10.

## Status codes at a glance

Every code the server emits, what it means, the **body shape**, and what the client's `errorState` does with it. Body shape is either **bare** (`res.sendStatus(N)` — the HTTP status text, no JSON body) or **JSON** (`res.status(N).json({error, …})`).

| Code | Meaning | Typical body | Client `errorState` effect |
|---|---|---|---|
| `200` | OK — inline data, or a fire-and-forget ack (the real reply arrives by long-poll) | empty or JSON | `noticeOk()` → flows to the response callback |
| `400` | Bad input (validation failed) | mostly **bare**, some **JSON** `{error,…}` | **treated "OK"** (it's `<401`) → flows to the callback, *not* the degraded-connection UI |
| `401` | No session / no `accountData` | **bare** | `noticeError()` → degraded-connection UI |
| `402` | Insufficient renown | **JSON** `{error:"insufficient renown"}` | `noticeError()` |
| `403` | Not authorized (failed the gate, an ownership check, or joining a lobby you were not invited to) | **bare** | `noticeError()` |
| `404` | Resource missing (unit, battle, template) | **bare** (one JSON) | `noticeError()` |
| `409` | Already in the matchmaking queue, or joining a lobby that no longer exists | **bare** | `noticeError()` |
| `410` | Opponent already disconnected (a non-exit battle route) | **bare** | `noticeError()` |
| `429` | Concurrent long-poll, or login flood (5/min/IP) | **bare** (poll) / **JSON** (login) | `noticeError()` |
| `500` | Server / DB error | **bare** (one JSON fallback) | **treated "alive"** → flows to the callback; the client keeps polling |
| `409` | Raw Discord JWT sent to a game route before exchange | **bare** | `noticeError()` |

## The client contract (why 500 ≠ "stop" and 400 ≠ "error")

Every response passes through one check in the client's `HttpCommunicator` (`HttpCommunicator.as:53-60` in the shipped decompile, `:43-50` in the 2013 source):

```actionscript
if (status == 0 || (status >= 401 && status != 500))
    errorState.noticeError();   // trip the "reconnecting…" / degraded UI
else
    errorState.noticeOk();      // healthy; hand the body to the response callback
```

Two consequences that surprise people:

1. **`500` is treated as "alive."** The server deliberately uses `500` for *transient* DB failures during a session (e.g. a roster save that rolled back). Because `500` is excluded from the error branch, the client stays connected and keeps long-polling instead of dropping to the reconnect UI — a database blip shouldn't look like a network outage.
2. **`400` (and everything `<401`) is treated as "OK."** A validation rejection flows to the route's own response callback, not the connection-health UI, so a `400` won't show a "connection lost" banner — the calling code decides what to do with it.

`status == 0` is a transport-level failure (no HTTP response at all — e.g. the mobile-network drop described in the client's `wire-protocol.md`); it always trips `noticeError()` and an immediate retry.

## Where each code is raised

Anchors are `file:line` so you can re-verify against the source. **The `lobby.ts` entries name the file and the handler instead, and new entries should too.** Adding a comment to one handler moves every line below it — which is exactly what happened when the lobby join codes changed on 2026-08-18, silently invalidating ten anchors in this file. Other `file:line` anchors are left as they are; re-check one before you trust it. (Each route's full request/response shape lives in [`serverEndpoints.md`](./serverEndpoints.md); this lists only the *failure* exits.)

- **`400` — bad input.** `app.ts:62` (debug/renown, JSON); `auth.ts:221` (login — `steam_id` fails `^\d{1,20}$`); `account.ts:83,87,93,95,105,119` (party save / tutorial — `:105` is JSON `{error,ids}`); `roster.ts` (many: bad party shape, name length, unknown/duplicate stat, invalid delta, "already at max rank", "barracks full"/"at max", "unit ID already exists" — mix of bare and JSON); `lobby.ts` → the invite handler (bad body, non-numeric ids, and **self-invite**) plus the uninvite / exit / join / decline / options / ready handlers (non-numeric body); `Battle.ts:364,391,421,443,449,484,490` (`tiles` not an array, or `turn` NaN/negative); `queue.ts:545` (`vs_type` not a known `GameMode`).
- **`401` — no session / `accountData`.** `account.ts:43,75,145`; `roster.ts:25,49,90,116,167,218,300,329`; `discord.ts:158` (no `Bearer`), `:168` (JWT verify fails / bad `discord_id`).
- **`402` — insufficient renown.** `roster.ts:63,94,175,332,338` — JSON `{error:"insufficient renown"}`.
- **`403` — not authorized.** `app.ts:107` (the session gate); `lobby.ts` → every handler's session check, plus the two ownership checks (the invite handler, for inviting into another account's namespace, and the options handler, for a caller who is not the owner); `Battle.ts:331` (caller's session is not a party in this battle); `lobby.ts` → the join handler (caller is not on the room's invite list).
- **`404` — missing resource.** `app.ts:69` (debug/renown session); `download.ts:19,24` (factions size/checksum unset); `roster.ts:56,97,122,174,228,306,311`; `Battle.ts:324` (battle id), `:426` (`turns[turn]` not an array).
- **`409` — already queued, or the room is gone.** `queue.ts:538`; `lobby.ts` → the join handler (the lobby id no longer resolves).
- **`410` — opponent gone.** `Battle.ts:340` (opponent disconnected and the route isn't `/exit` or `/surrender`).
- **`429` — too many requests.** `game.ts:35` (a second concurrent poll while `pollingActive`); `auth.ts:207-214` login limiter (>5/min/IP — JSON `{error:"Too many login attempts…"}`; skipped under `NODE_ENV=test`).
- **`500` — server / DB error.** `game.ts:23` (leaderboards build failed *and* no static fallback — normally the DB failure is swallowed and the static board is served as `200`); `account.ts:137,158`; `roster.ts:42,83,109,160,209,291,322,344` (in-memory state rolled back first); `auth.ts:252` (`upsertAccount` threw); `discord.ts:188` (session-create DB error).
- **`409` — exchange needed.** `app.ts:120` only — the session-gate fallthrough described above. **Never answer a permanent condition with `501`** (or any `5xx`, or `404`): the client retries those forever. See [`client-contract.md`](client-contract.md) → R10.

## Lobby's four deliberate divergences from the Java original

The lobby routes return `409` / `403` / `400` in four spots where the 2013 Java server did something unsafe (a silent junk update, a phantom lobby in another account's namespace, an owner self-DoS, an options rewrite by a stranger). These are intentional and asserted by tests — don't "fix" them by porting the Java behavior. The codes and the full reasoning live once in [`../CLAUDE.md`](../CLAUDE.md#lobby) → **§Lobby → "Four deliberate divergences"**:

| Route | Code | Condition |
|---|---|---|
| `/lobby/join` | `409` / `403` | `409` lobby missing; `403` caller not on the invite list. Never `404` — the client re-sends that one forever |
| `/lobby/invite` | `403` | body `lobby_id` ≠ caller's own `account_id` (phantom-lobby guard) |
| `/lobby/invite` | `400` | caller invites themselves (owner self-DoS guard) |
| `/lobby/options` | `403` | caller is not the lobby owner |

## Convention: DB failure → roll back, then `500`

The mutation routes (roster, account, endgame) update `session.accountData` **in memory first**, then persist to SQLite. The in-memory copy is the source of truth for the session, so when a DB write throws, the handler **restores the pre-write in-memory state** before returning `500` — the player's session never ends up showing data that wasn't saved. (`roster.ts` is the clearest example: every `500` there is preceded by a rollback.)

The one deliberate exception is the leaderboards route (`game.ts:13-25`): a DB failure there is **swallowed**, the preserved static board (`data/lboard.json`) is served as `200`, and only a *total* failure (no static fallback either) reaches `500`. The page should degrade to historical standings, not error.

Process-level last-resort handlers (`index.ts:4-9`) log `unhandledRejection` / `uncaughtException` so a stray async error is recorded rather than silently killing the process.

## OAuth callback "errors" are 302 redirects, not status codes

The Discord OAuth callback (`discord.ts:102-152`) never returns a `4xx` / `5xx` for a login problem — it always `res.redirect(302, "bsf://auth?error=…")` back into the client, which surfaces the message in-game. The error token is allowlisted (`discord.ts:122-128`) so attacker-supplied text is never reflected: Discord-issued `access_denied` / `temporarily_unavailable` pass through; anything else collapses to `oauth_error`; plus `missing_access_code`, `invalid_state` (`:115`), `unsupported_account_id` (`:138`), and `an_error_occurred_communicating_with_discord` (`:148`). These are real, user-visible failures you will never see as an HTTP error code.

## A note on the long-poll

`GET /services/game/:session_key` holds the connection for **up to 5 seconds** (`game.ts:98`) waiting for a `pushData()` event, then returns `200` with an empty body. A second concurrent poll on the same session returns `429` (`game.ts:35`). This is the only route where `200`-with-no-body is the *expected* steady state — see [`serverEndpoints.md`](./serverEndpoints.md#session-data) and the client's `wire-protocol.md` §Long-poll mechanics.

---

*Last updated: 2026-06-30. Sources: `src/app.ts` (session gate), the per-route handlers under `src/services/`, and `HttpCommunicator.as` (client contract).*
