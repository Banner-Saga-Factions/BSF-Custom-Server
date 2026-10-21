# Error Handling & Status Codes

How the server signals failure: what each HTTP status code means, where it comes from, and — crucially — how the game client reacts to it. **Read this before debugging a request that "failed."** The client's reaction to a status code is often counter-intuitive (a `500` keeps it polling; a `400` is treated as success), so the status code alone doesn't tell you what the player actually saw.

For each route's full request/response shape see [`serverEndpoints.md`](./serverEndpoints.md); for the overall request lifecycle see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for the client side of the contract see the client's `wire-protocol.md` ([local](../../bsf-client/docs/wire-protocol.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/wire-protocol.md)).

## The session gate (where most 4xx responses come from)

Before any `/services/*` handler runs, one middleware (`src/app.ts` -> the session gate) decides whether the request is even allowed in. The **order** of checks is the decision tree:

1. **Steam-overlay no-op** — a request matching the exact shape `/session/steam/overlay/<key>/<true|false>` returns `200` immediately and never reaches auth. Any *other* path under that prefix falls through to the checks below.
2. **Session lookup** — the session key is the **last path segment**, looked up in the in-memory sessions map.
3. **Sign-in address** — `/auth/login/<version>`, matched on its exact shape (`LOGIN_RE`), needs no session, so a player with no session yet can sign in. `11` there is the game's protocol version, not a key (#193).
4. **The no-session answer** — no session, and not the sign-in address. **`401`** when the segment we read is shaped like a session key (32 hex characters, `SESSION_KEY_RE`), **`403`** when it is not. Which segment we read is the last one, except on the unit-variation route, whose key is followed by three more parts (#188). **Was a flat `403` until 2026-08-25**, and the shape test is what makes `401` safe to give: `401` is the only code the game reads as *you are logged out* — it abandons the request, marks itself offline, shows a "Disconnected From Server" dialog and, once the player clicks OK, fetches fresh credentials — signing straight back in when it holds a Steam ticket (or autologin is on) and showing the login screen otherwise. So we say it only when a session key was actually presented. The unit-variation route puts a lobby id in that segment, so a flat `401` would sign a healthy player out for recolouring a unit. See [`client-contract.md`](client-contract.md) -> R5, and #180 / #188. Measured against the running client on 2026-08-25: restarting the server under a live session showed the network banner during the outage, the "Disconnected From Server" dialog on the first `401`, and — after OK — an automatic sign-in back into a working game within seconds. **Two things that measurement settled.** Recovery replays the client's whole boot path rather than restoring the screen the player left, so it obeys the original launch arguments (a client started with `--versus_start` re-queues itself for a RANKED match; one started without it does not — tested both ways). And most routes never reach this path at all: fifteen transaction classes mark their response consumed before the client's dispatcher looks at it, so their `401`s are silently discarded. What carries recovery is the long poll, which does not.

Until #251 there was a step between 3 and 4: a Discord sign-in token sent as `Authorization: Bearer`, answered `409` until it was swapped for a session key. Discord sign-in now ends in an ordinary session key, so that step and its `409` are gone.

## Status codes at a glance

Every code the server emits, what it means, the **body shape**, and what the client's `errorState` does with it. Body shape is either **bare** (`res.sendStatus(N)` — the HTTP status text, no JSON body) or **JSON** (`res.status(N).json({error, …})`).

| Code | Meaning | Typical body | Client `errorState` effect |
|---|---|---|---|
| `200` | OK — inline data, or a fire-and-forget ack (the real reply arrives by long-poll). Also any battle request except the turn query for a battle we no longer hold (#164) | empty or JSON | `noticeOk()` → flows to the response callback |
| `400` | Bad input (validation failed), a `/services` address no route answers, or a turn query for a battle we no longer hold (#164) | mostly **bare**, some **JSON** `{error,…}` | **treated "OK"** (it's `<401`) → flows to the callback, *not* the degraded-connection UI |
| `401` | Not logged in — the gate did not recognise a session key, or a route found no `accountData` | **bare** | `noticeError()`, **and** the game abandons the request and runs its disconnect-then-sign-in-again path |
| `402` | Insufficient renown | **JSON** `{error:"insufficient renown"}` | `noticeError()` |
| `403` | Not authorized — an ownership check, joining a lobby you were not invited to, or a path whose last segment was never a session key | **bare** | `noticeError()` |
| `404` | Resource missing (unit, template; the session a debug route names) | **bare** (one JSON) | `noticeError()` |
| `409` | Already in the matchmaking queue · joining a lobby that no longer exists · an account row that is not shaped as expected · **any handler that failed** (see *Every request gets a reply*) | **bare** | `noticeError()` |
| `410` | Opponent already disconnected (any battle route except leaving and surrendering) | **bare** | `noticeError()` |
| `429` | Concurrent long-poll, a sign-in flood (5/min/IP), or one of the Discord sign-in caps (#251, #301) | **bare** (poll) / **JSON** (the caps) / a page (the Discord page's 10,000-state ceiling) | `noticeError()` |
| `500` | Server / DB error | **bare** (one JSON fallback) | **treated "alive"** → flows to the callback; the client keeps polling |
| `503` | **Not emitted anywhere today.** A maintenance `503` is the one `5xx` the game will not re-send, but it ends the whole session, so it is a shutdown notice rather than a way to refuse one request | **any** body containing `Offline for Maintenance` or `game_rebooting` — the client does a plain substring search, and the original server sent plain text | abandons that request, then shows a one-button dialog that **quits the game** |

## The client contract (why 500 ≠ "stop" and 400 ≠ "error")

Every response passes through one check in the client's `HttpCommunicator` (`HttpCommunicator.as:53-60` in the shipped decompile, `:43-50` in the 2013 source):

```actionscript
if (status == 0 || (status >= 401 && status != 500))
    errorState.noticeError();   // trip the "reconnecting…" / degraded UI
else
    errorState.noticeOk();      // healthy; hand the body to the response callback
```

Three consequences that surprise people:

1. **`500` is treated as "alive."** The server deliberately uses `500` for *transient* DB failures during a session (e.g. a roster save that rolled back). Because `500` is excluded from the error branch, the client stays connected and keeps long-polling instead of dropping to the reconnect UI — a database blip shouldn't look like a network outage.
2. **`400` (and everything `<401`) is treated as "OK."** A validation rejection flows to the route's own response callback, not the connection-health UI, so a `400` won't show a "connection lost" banner — the calling code decides what to do with it.

3. **A maintenance `503` is the one `5xx` the client will not re-send.** Every other `5xx` is re-sent every one to two seconds with no attempt cap, for each kind of request that asks to be re-sent, so answering one to a condition that will never change is an endless loop — see [`client-contract.md`](client-contract.md) → R10. The client's retry test asks "is this a maintenance answer?" *before* it looks at the code, so the carve-out is built into the decision to retry rather than bolted on afterwards. **It is not, however, a way to refuse one request.** The dialog it raises has a single button, and that button quits the game; it also marks the whole session offline. And our own refusals go out through `res.sendStatus`, which for `503` sends the body `Service Unavailable` — containing neither marker — so it would be re-sent like every other `5xx`. We emit no `503` anywhere today; this row is here so that whoever reaches for one learns what it does first.

`status == 0` is a transport-level failure (no HTTP response at all — e.g. the mobile-network drop described in the client's `wire-protocol.md`); it always trips `noticeError()`, and a request that asks to be re-sent goes again one to two seconds later.

## Where each code is raised

**New entries should name the file and the handler, not a line number.** Adding a comment to one handler moves every line below it — which happened when the lobby join codes changed on 2026-08-18 (ten anchors silently invalidated) and again when the error middleware landed on 2026-08-25, moving every line in `app.ts` and `roster.ts`. It happened a third time on 2026-09-10, in the space of a single sitting: adding four lines of comment to `Battle.ts` moved the guard being documented from line 458 to 462, invalidating the number in the very change that was correcting it. `app.ts`, `roster.ts` and now every `Battle.ts` entry are named rather than numbered; the remaining `file:line` anchors are left as they are, so re-check one before you trust it — of the seven `Battle.ts` numbers replaced that day, **all seven** pointed at something other than what they claimed. (Each route's full request/response shape lives in [`serverEndpoints.md`](./serverEndpoints.md); this lists only the *failure* exits.)

- **`400` — bad input.** `app.ts` -> the fallback after every router (a `/services` address no route answers — today `/tourney/join` and the three `/iap` routes, #164); `Battle.ts` -> the battle middleware (battle id missing or not text; a turn query for a battle we no longer hold, because the game asks that again after every successful answer); `app.ts` -> the debug/renown route (JSON); `auth.ts` -> the sign-in route's Discord branch (the Discord step failed for good, or the id is held by a Steam player — #251, #375; plain text); `auth.ts` -> the Steam sign-in route (`steam_id` is not text or a number, a number of 2^53 or more, not 1–20 digits, `0`, or above the largest Steam number 76561202255233023 since #326, before that 2^64−1 — #231); `account.ts:83,87,93,95,105,119` (party save / tutorial — `:105` is JSON `{error,ids}`); `roster.ts` -> every handler (bad party shape, name length, unknown or duplicate stat, invalid delta, "already at max rank", "barracks full"/"at max"; since #164 also an unknown unit on promote and stat purchase, an unknown unit type on hire, a hire id that is not 1–64 letters, digits or `_`, and "unit ID already exists" for any clash that is not a repeat of this session's own hire — mix of bare and JSON); `lobby.ts` -> the invite handler (bad body, non-numeric ids, and **self-invite**) plus the uninvite / exit / join / decline / options / ready handlers (non-numeric body); `Battle.ts` -> the `/deploy`, `/sync`, `/query`, `/move` and `/action` handlers (`tiles` not an array, or `turn` NaN/negative); `queue.ts` -> the queue-join handler (`vs_type` not a known `GameMode`, and — since #205 — a `forcematch` naming the caller themselves, which nothing could ever satisfy).
- **`401` — not logged in.** `auth.ts` -> the Steam sign-in route, on a server with a Steam key, when Steam does not confirm the proof for that number (#326; here the game shows its sign-in dialog and stops, see [`client-contract.md`](./client-contract.md) → *A refused sign-in*); `auth.ts` -> the sign-in route's Discord branch, when the hand-off key is unknown, expired, already used, or its Discord step has not finished (#251 — plain text the game can show); `app.ts` -> the session gate, when the segment it read is shaped like a session key but names no session we know (#180; the segment is the last one except on the unit-variation route, where #188 taught the gate to read it from its real position); `account.ts:43,75,145`; `roster.ts` -> every handler's `accountData` check; `lobby.ts` -> every handler's session check.
- **`402` — insufficient renown.** `roster.ts` -> the promote, rename, hire and unlock handlers — JSON `{error:"insufficient renown"}`.
- **`403` — not authorized.** `app.ts` -> the session gate, when the segment it read was never shaped like a session key (stray traffic, and malformed variation addresses; the unit-variation route itself used to land here until #188); `lobby.ts` -> the invite handler (inviting into another account's namespace), the options handler (caller is not a member of that lobby), and the join handler (caller is not on the room's invite list); `Battle.ts` -> the battle middleware (caller's session is not a party in this battle).
- **`404` — missing resource.** `app.ts` -> the debug/renown route (no such session); `download.ts:19,24` (factions size/checksum unset; neither route can be reached, #308); `roster.ts` -> the unit lookup in rename and the unit and template lookups in stats-reset, which the game never re-sends. Since #164 promote, stat purchase and hire answer `400` instead, and retiring a unit that is already gone answers `200`. `Battle.ts` raises none any more, because the client re-sent both of its `404`s for ever: since #213 `/battle/query` answers an empty `200` for a turn the opponent has not taken yet, and since #164 the battle middleware answers an empty `200` for a battle we no longer hold (`400` for the turn query).
- **`409` — do not send this again.** `queue.ts` -> the queue-join handler (already queued); `lobby.ts` -> the join handler (the lobby id no longer resolves); `roster.ts` -> `accountShapeOk` (the stored account row is not shaped as expected); `app.ts` -> the catch-all (any handler that failed — see *Every request gets a reply*). **Never answer a permanent condition with `501`** (or any `5xx`, or `404`): the client retries those forever. See [`client-contract.md`](client-contract.md) -> R10.
- **`410` — opponent gone.** `Battle.ts` -> the battle middleware (opponent disconnected and the route isn't `/exit` or `/surrender`).
- **`429` — too many requests.** `game.ts` -> the poll handler's concurrent-poll guard (a second concurrent poll while `pollingActive`); `auth.ts` -> the login limiter (>5/min/IP — JSON `{error:"Too many login attempts…"}`; skipped under `NODE_ENV=test`); `discord.ts` -> `handoffLimiter` and `pollLimiter` on the game's two Discord routes (>10 and >300/min/IP, #251), and the hand-off route again once 10,000 hand-offs are waiting; `discord.ts` -> `discordStartLimiter` on the Discord page and its Continue (>10/min/IP — JSON `{error:"Too many Discord sign-in attempts…"}`; skipped under `NODE_ENV=test`) and `MAX_PENDING_STATES` (10,000 sign-ins already waiting — a "Too busy" page; #301).
- **`500` — server / DB error.** `game.ts:23` (leaderboards build failed *and* no static fallback — normally the DB failure is swallowed and the static board is served as `200`); `account.ts:137,158`; `roster.ts` -> every handler's DB `catch` (in-memory state rolled back first); `auth.ts` -> the sign-in route, Steam or Discord (`upsertAccount` threw).

## Lobby's four deliberate divergences from the Java original

The lobby routes return `409` / `403` / `400` in four spots where the 2013 Java server did something unsafe (a silent junk update, a phantom lobby in another account's namespace, an owner self-DoS, an options rewrite by a stranger). These are intentional and asserted by tests — don't "fix" them by porting the Java behavior. The full reasoning lives once in [`serverEndpoints.md`](./serverEndpoints.md#how-the-lobby-behaves) → **"Four deliberate divergences from Java for safety"**:

| Route | Code | Condition |
|---|---|---|
| `/lobby/join` | `409` / `403` | `409` lobby missing; `403` caller not on the invite list. Never `404` — the client re-sends that one forever |
| `/lobby/invite` | `403` | body `lobby_id` ≠ caller's own `account_id` (phantom-lobby guard) |
| `/lobby/invite` | `400` | caller invites themselves (owner self-DoS guard) |
| `/lobby/options` | `403` | caller is not a **member of that lobby** — narrowed from owner-only in #213, because both players' screens carry the map and turn-length buttons |

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

## Discord sign-in failures: a web page for the player, a status for the game

Signing in through Discord (#251) has two audiences, and each gets its failures its own way.

- **The browser** (`discord.ts` -> the page, Continue, and the return from Discord) gets a plain web page saying what happened in words: `410` expired, `400` a Continue another site forged, `400` the player said no at Discord, `502` Discord could not be reached, `400` an unusable id or one a Steam player holds (#375). Only the HTTP status differs from page to page; nothing reads it but the browser. Text Discord's redirect carried is never shown — only our own sentence for `access_denied` and `temporarily_unavailable`, and a general one for anything else.
- **The game** never sees those pages. It asks `POST /login/discord/handoff/poll`, which answers **`200` every time** — `pending`, `ready`, `failed` with a message, or `expired` with a message — because a `404` or `5xx` would make the game re-send by itself without end (R10). When the player says no at Discord or Discord is down, the hand-off simply stays `pending`, so the player can press Retry; only a refusal that will not change (#375, an unusable id) turns it `failed`.

Until #251 the return from Discord answered every failure with a `302` to a `bsf://auth?error=…` link, which Windows had nothing to open.

## A note on the long-poll

`GET /services/game/:session_key` holds the connection for **up to 5 seconds** (`game.ts`) waiting for a `pushData()` event, then returns `200` with an empty list (`[]`). A second concurrent poll on the same session returns `429`. This is the only route where a `200` with nothing in it is the *expected* steady state — see [`serverEndpoints.md`](./serverEndpoints.md#session-data) and the client's `wire-protocol.md` §Long-poll mechanics.

---

*Last updated: 2026-09-21. Sources: `src/app.ts` (session gate), the per-route handlers under `src/services/`, and `HttpCommunicator.as` (client contract).*
