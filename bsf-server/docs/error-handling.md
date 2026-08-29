# Error Handling & Status Codes

How the server signals failure: what each HTTP status code means, where it comes from, and — crucially — how the game client reacts to it. **Read this before debugging a request that "failed."** The client's reaction to a status code is often counter-intuitive (a `500` keeps it polling; a `400` is treated as success), so the status code alone doesn't tell you what the player actually saw.

For each route's full request/response shape see [`serverEndpoints.md`](./serverEndpoints.md); for the overall request lifecycle see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for the client side of the contract see the client's `wire-protocol.md` ([local](../../bsf-client/docs/wire-protocol.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/wire-protocol.md)).

## The session gate (where most 4xx responses come from)

Before any `/services/*` handler runs, one middleware (`src/app.ts` -> the session gate) decides whether the request is even allowed in. The **order** of checks is the decision tree:

1. **Steam-overlay no-op** — a request matching the exact shape `/session/steam/overlay/<key>/<true|false>` returns `200` immediately and never reaches auth. Any *other* path under that prefix falls through to the checks below.
2. **Session lookup** — the session key is the **last path segment**, looked up in the in-memory sessions map.
3. **`"11"` login sentinel** — the literal key `"11"` (only ever on `/auth/login/11`) bypasses the session requirement so a player with no session yet can log in.
4. **Discord JWT** — if there is no session, a valid `Authorization: Bearer <jwt>` is decoded for its `discord_id`.
5. **The no-session answer** — no session, key isn't `"11"`, and no valid JWT. **`401`** when the segment we read is shaped like a session key (32 hex characters, `SESSION_KEY_RE`), **`403`** when it is not. Which segment we read is the last one, except on the unit-variation route, whose key is followed by three more parts (#188). **Was a flat `403` until 2026-08-25**, and the shape test is what makes `401` safe to give: `401` is the only code the game reads as *you are logged out* — it abandons the request, marks itself offline, shows a "Disconnected From Server" dialog and, once the player clicks OK, fetches fresh credentials — signing straight back in when it holds a Steam ticket (or autologin is on) and showing the login screen otherwise. So we say it only when a session key was actually presented. The unit-variation route puts a lobby id in that segment, so a flat `401` would sign a healthy player out for recolouring a unit. See [`client-contract.md`](client-contract.md) -> R5, and #180 / #188. Measured against the running client on 2026-08-25: restarting the server under a live session showed the network banner during the outage, the "Disconnected From Server" dialog on the first `401`, and — after OK — an automatic sign-in back into a working game within seconds. **Two things that measurement settled.** Recovery replays the client's whole boot path rather than restoring the screen the player left, so it obeys the original launch arguments (a client started with `--versus_start` re-queues itself for a RANKED match; one started without it does not — tested both ways). And most routes never reach this path at all: fifteen transaction classes mark their response consumed before the client's dispatcher looks at it, so their `401`s are silently discarded. What carries recovery is the long poll, which does not.
6. **`409`** — a *valid* Discord JWT but still no session → `sendStatus(409)`. This is the server telling the client "exchange this JWT for a `session_key` at `POST /login/discord/session` first." It is **not** an error in the Discord login route itself. **Was `501` until 2026-07-30**, which the client retried forever (`canRetry` covers everything `>= 500`) — see [`client-contract.md`](client-contract.md) → R10.

## Status codes at a glance

Every code the server emits, what it means, the **body shape**, and what the client's `errorState` does with it. Body shape is either **bare** (`res.sendStatus(N)` — the HTTP status text, no JSON body) or **JSON** (`res.status(N).json({error, …})`).

| Code | Meaning | Typical body | Client `errorState` effect |
|---|---|---|---|
| `200` | OK — inline data, or a fire-and-forget ack (the real reply arrives by long-poll) | empty or JSON | `noticeOk()` → flows to the response callback |
| `400` | Bad input (validation failed) | mostly **bare**, some **JSON** `{error,…}` | **treated "OK"** (it's `<401`) → flows to the callback, *not* the degraded-connection UI |
| `401` | Not logged in — the gate did not recognise a session key, or a route found no `accountData` | **bare** | `noticeError()`, **and** the game abandons the request and runs its disconnect-then-sign-in-again path |
| `402` | Insufficient renown | **JSON** `{error:"insufficient renown"}` | `noticeError()` |
| `403` | Not authorized — an ownership check, joining a lobby you were not invited to, or a path whose last segment was never a session key | **bare** | `noticeError()` |
| `404` | Resource missing (unit, battle, template) | **bare** (one JSON) | `noticeError()` |
| `409` | Already in the matchmaking queue · joining a lobby that no longer exists · a raw Discord JWT sent to a game route before it is exchanged · an account row that is not shaped as expected · **any handler that failed** (see *Every request gets a reply*) | **bare** | `noticeError()` |
| `410` | Opponent already disconnected (a non-exit battle route) | **bare** | `noticeError()` |
| `429` | Concurrent long-poll, or login flood (5/min/IP) | **bare** (poll) / **JSON** (login) | `noticeError()` |
| `500` | Server / DB error | **bare** (one JSON fallback) | **treated "alive"** → flows to the callback; the client keeps polling |

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

**New entries should name the file and the handler, not a line number.** Adding a comment to one handler moves every line below it — which happened when the lobby join codes changed on 2026-08-18 (ten anchors silently invalidated) and again when the error middleware landed on 2026-08-25, moving every line in `app.ts` and `roster.ts`. Those two are named rather than numbered now; the remaining `file:line` anchors are left as they are, so re-check one before you trust it. (Each route's full request/response shape lives in [`serverEndpoints.md`](./serverEndpoints.md); this lists only the *failure* exits.)

- **`400` — bad input.** `app.ts` -> the debug/renown route (JSON); `auth.ts:221` (login — `steam_id` fails its digit check); `account.ts:83,87,93,95,105,119` (party save / tutorial — `:105` is JSON `{error,ids}`); `roster.ts` -> all eight handlers (bad party shape, name length, unknown or duplicate stat, invalid delta, "already at max rank", "barracks full"/"at max", "unit ID already exists" — mix of bare and JSON); `lobby.ts` -> the invite handler (bad body, non-numeric ids, and **self-invite**) plus the uninvite / exit / join / decline / options / ready handlers (non-numeric body); `Battle.ts:364,391,421,443,449,484,490` (`tiles` not an array, or `turn` NaN/negative); `queue.ts` -> the queue-join handler (`vs_type` not a known `GameMode`, and — since #205 — a `forcematch` naming the caller themselves, which nothing could ever satisfy).
- **`401` — not logged in.** `app.ts` -> the session gate, when the segment it read is shaped like a session key but names no session we know (#180; the segment is the last one except on the unit-variation route, where #188 taught the gate to read it from its real position); `account.ts:43,75,145`; `roster.ts` -> every handler's `accountData` check; `lobby.ts` -> every handler's session check; `discord.ts:158` (no `Bearer`), `:168` (JWT verify fails / bad `discord_id`).
- **`402` — insufficient renown.** `roster.ts` -> the promote, rename, hire and unlock handlers — JSON `{error:"insufficient renown"}`.
- **`403` — not authorized.** `app.ts` -> the session gate, when the segment it read was never shaped like a session key (stray traffic, and malformed variation addresses; the unit-variation route itself used to land here until #188); `lobby.ts` -> the invite handler (inviting into another account's namespace), the options handler (caller is not the owner), and the join handler (caller is not on the room's invite list); `Battle.ts:331` (caller's session is not a party in this battle).
- **`404` — missing resource.** `app.ts` -> the debug/renown route (no such session); `download.ts:19,24` (factions size/checksum unset); `roster.ts` -> the unit and template lookups in promote / rename / retire / hire / stats-purchase / stats-reset; `Battle.ts:324` (battle id), `:426` (`turns[turn]` not an array).
- **`409` — do not send this again.** `queue.ts` -> the queue-join handler (already queued); `lobby.ts` -> the join handler (the lobby id no longer resolves); `roster.ts` -> `accountShapeOk` (the stored account row is not shaped as expected); `app.ts` -> the session gate (a raw Discord JWT that has not been exchanged yet) and the catch-all (any handler that failed — see *Every request gets a reply*). **Never answer a permanent condition with `501`** (or any `5xx`, or `404`): the client retries those forever. See [`client-contract.md`](client-contract.md) -> R10.
- **`410` — opponent gone.** `Battle.ts:340` (opponent disconnected and the route isn't `/exit` or `/surrender`).
- **`429` — too many requests.** `game.ts:35` (a second concurrent poll while `pollingActive`); `auth.ts:207-214` login limiter (>5/min/IP — JSON `{error:"Too many login attempts…"}`; skipped under `NODE_ENV=test`).
- **`500` — server / DB error.** `game.ts:23` (leaderboards build failed *and* no static fallback — normally the DB failure is swallowed and the static board is served as `200`); `account.ts:137,158`; `roster.ts` -> every handler's DB `catch` (in-memory state rolled back first); `auth.ts:252` (`upsertAccount` threw); `discord.ts:188` (session-create DB error).

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

Process-level last-resort handlers (`index.ts`) log `unhandledRejection` / `uncaughtException` so a stray async error is recorded rather than silently killing the process. **Be careful what you read into that:** the *process* surviving is not the *request* being answered. Until the catch-all below existed, a `[FATAL] unhandledRejection` line meant a player was waiting on a socket that would never reply.

## Every request gets a reply

A handler that fails is no longer left unanswered. One error-handling middleware, registered after every route in `app.ts`, logs the failure on the `[UNCAUGHT]` channel and replies — `409` by default, or the code the error itself carries when that is a `4xx` other than `404`.

Silence was the worst answer available, not the mildest. Express 4 wraps a handler call in a try/catch, which catches a handler that fails immediately but never sees an `async` one reject. Nothing then replied at all — and the game has no request timeout of its own (the five-second one it declares is built and listened to, but nothing ever starts it), so it waited for ever, showed the player nothing, and if the stalled request was the long poll it could stop receiving messages altogether.

**The middleware alone could not have fixed that**, because Express never told it. The routers are built by `asyncRouter()` (`src/http/asyncRouter.ts`), which wraps each handler so a rejection reaches the middleware like any other error. **Use `asyncRouter()` rather than `Router()` for any new router.**

Two things it deliberately does not do:

- **It does not answer twice.** Once headers are sent it stands aside, because `chat.ts` replies on its first line and keeps working afterwards — writing again would throw and lose the reply the player already had.
- **It does not reach the long poll's timers.** The callbacks in `game.ts` run on a later tick, outside the middleware stack, so they answer for themselves — `onData` and the timeout both catch and reply. Do not remove those thinking the catch-all covers them; it cannot reach them.

Issue #176.

## OAuth callback "errors" are 302 redirects, not status codes

The Discord OAuth callback (`discord.ts:102-152`) never returns a `4xx` / `5xx` for a login problem — it always `res.redirect(302, "bsf://auth?error=…")` back into the client, which surfaces the message in-game. The error token is allowlisted (`discord.ts:122-128`) so attacker-supplied text is never reflected: Discord-issued `access_denied` / `temporarily_unavailable` pass through; anything else collapses to `oauth_error`; plus `missing_access_code`, `invalid_state` (`:115`), `unsupported_account_id` (`:138`), and `an_error_occurred_communicating_with_discord` (`:148`). These are real, user-visible failures you will never see as an HTTP error code.

## A note on the long-poll

`GET /services/game/:session_key` holds the connection for **up to 5 seconds** (`game.ts:98`) waiting for a `pushData()` event, then returns `200` with an empty body. A second concurrent poll on the same session returns `429` (`game.ts:35`). This is the only route where `200`-with-no-body is the *expected* steady state — see [`serverEndpoints.md`](./serverEndpoints.md#session-data) and the client's `wire-protocol.md` §Long-poll mechanics.

---

*Last updated: 2026-08-25. Sources: `src/app.ts` (session gate), the per-route handlers under `src/services/`, and `HttpCommunicator.as` (client contract).*
