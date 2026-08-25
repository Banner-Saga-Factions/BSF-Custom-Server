# Security Model & Boundaries

The server's threat model, the boundaries it actually enforces **today**, and — honestly — what it does **not** protect. Read this before adding a public route or deciding whether to trust a value the client sent.

This doc *cites* rather than restates: the session-gate decision tree lives in [`error-handling.md`](./error-handling.md), the in-memory design rationale in [`ARCHITECTURE.md`](./ARCHITECTURE.md), and the operational traps in [`../.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

## Threat model

The adversary is a **modified game client.** The client is an Adobe AIR/Flash app whose ActionScript fully decompiles, so assume an attacker can read every request shape and **forge any field** — `user_id`, `killerparty`, `killer`, party contents, `lobby_id`, stat deltas, anything. The server is the trust boundary: it must treat client input as hostile and derive security-relevant facts itself.

Two things bound how much hardening is warranted: TLS is **terminated upstream** (Caddy — see [`Deployment.md`](./Deployment.md)), and the deployment is **single-instance** for a small player base (in-memory session/queue/battle state). Multi-host scale-out would change several of the limits below.

## What the server enforces today

Every claim here is anchored to source so it can be re-verified.

| Boundary | Enforcement | Source |
|---|---|---|
| **Session-key gate** | Every `/services/*` request needs a valid session key (the last URL path segment); `"11"` is the login-only bypass; the Steam-overlay path is shape-allowlisted to a `200` no-op | `app.ts -> the session gate` (#55); decision tree in [`error-handling.md`](./error-handling.md) |
| **Session-key entropy** | `crypto.randomBytes(16)` → 32 hex chars = **128 bits** (UUIDv4-equivalent) | `auth.ts:29-31` (#53) |
| **Login rate-limit** | **5 / 60 s / IP**, in-memory; returns `429` with a JSON message; skipped under `NODE_ENV=test` | `auth.ts:207-214` (#56) |
| **OAuth CSRF** | `bsf_oauth_state` cookie — **HttpOnly**, **SameSite=Lax**, 5-min TTL, **one-shot / replay-protected** (deleted on use); Discord error tokens are allowlisted before being reflected | `discord.ts:27-42, 102-128` (#54) |
| **JWT scope** | JWTs are issued/verified for **Discord login only** (`discord.ts:142` / `:162`, `app.ts -> the session gate`); game traffic uses session keys, never a JWT. `JWT_SECRET` fail-fast at boot | `app.ts -> the JWT_SECRET fail-fast and the session gate` |
| **SQL injection** | All user-supplied **values** are bound with `?` placeholders through the `query` / `queryOne` / `queryUpdate` helpers | `connection.ts:79-95`; [`db.md`](../.claude/rules/db.md) |
| **`/debug/*` gating** | The debug router mounts only when `NODE_ENV !== "production"`, with a loud boot warning when it's on | `app.ts -> the debug-router block`, `index.ts:13-18` |
| **Game integrity** | Server-**derived** winner (the side still standing — *not* the client's `killerparty`, #19); a death counts only when **both** clients report it (#18); a unit's KILLS stat only credits when both clients name the **same** killer (#99) | `Battle.ts`; [`CLAUDE.md` §Battle State](../CLAUDE.md#battle-state), [`gotchas.md`](../.claude/rules/gotchas.md) |

Two points worth spelling out:

- **What the `"11"` sentinel actually allows.** The gate skips the session requirement for *any* request whose last path segment is `"11"` (`app.ts -> the session gate`). Only the login route (`/auth/login/11`) is built to run without a session; any other route reached this way still has no `req.session` and fails downstream, in the route's own `accountData` check. That check answers `401` — and since #180 so does the gate — but they are different refusals: the gate already let this request through, and the route is the one turning it away. So `"11"` is an unauthenticated door to **login only**, not a general bypass — but don't add a new route that trusts being reachable with it.
- **The one SQL string interpolation is safe.** `src/db/account.ts:51` interpolates `${ACCOUNT_COLUMNS}` into a `SELECT`. `ACCOUNT_COLUMNS` is a hardcoded constant column list (`src/db/account.ts:34-35`), never user input; the `user_id` value beside it is still `?`-bound. Every other `${}` in `src/db` is a log/error message, not SQL. The rule that keeps this true: never call `new DatabaseSync` outside `connection.ts` ([`db.md`](../.claude/rules/db.md)).

## What is NOT protected today

Sourced from the code — this repo's, and where noted the game client's — not the issue tracker, so contributors know where the boundary actually is.

- **Two *colluding* modified clients can agree on a false outcome.** Death-confirmation and same-killer agreement stop a *lone* cheater, but if both clients lie in the same way the server has no independent truth — it relays and records the battle, it does not simulate it. Closing this would require server-side re-simulation. (See [`gotchas.md`](../.claude/rules/gotchas.md); the recorder-vs-simulator boundary is detailed in [`battle-simulation.md`](./battle-simulation.md).)
- **The login rate-limit is per-process and in-memory** (`auth.ts:203-205`). It does not survive a restart and does not hold across multiple hosts — a scale-out would need a shared store (e.g. Redis).
- **No in-process TLS.** The server listens with plain `http` on `:8082` (`index.ts:20`); transport encryption is assumed to be terminated upstream by Caddy. Running it directly exposed would be cleartext.
- **Sessions, queue, and lobby state are in-memory** — lost on restart and unshareable across processes (single-instance only, by design — see [`ARCHITECTURE.md`](./ARCHITECTURE.md)).
- **A player's own mod host can read their session key — client-side, cross-repo.** Our fork's game client ships a *mod bridge*: a hook that copies HTTP traffic **word for word** to an external program at `mods/host.exe`, so a mod can be rewritten without rebuilding the client. That copy includes the login request and the `session_key` in the reply. To this server a stolen key is indistinguishable from the real player for the rest of that session, and there is nothing here able to detect or cancel it. **Bounded:** the bridge does nothing unless the player installs a host — none ships with the game, and with no host every bridge call is ignored (`mod-bridge.md` §4 "The host's life"). So this is a risk a player takes on by installing a third-party mod host, not one every player carries. Known, verified, and **not yet fixed on the client side**; the finding and its planned fix are in `bsf-client/docs/mod-bridge.md` §8 "Known security gap" ([local](../../bsf-client/docs/mod-bridge.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/mod-bridge.md)). Nothing to change in this repo — recorded here so the boundary is visible from the server side. **When that client fix lands, revise or remove this entry.**
- **Discord id collision (#140, open, `bug`/`P3` — not labeled security).** Two Discord Snowflakes that share their low 30 bits map to the same 32-bit in-game `account_id` (`discord.ts:175`). They stay distinct DB rows (keyed on the full id string), but would share an in-game identity. Integrity-adjacent; listed here as a known limitation.

## Adding a route — a short checklist

1. **Require a session.** Don't extend the gate's bypass list; if a route genuinely must be unauthenticated, justify it like the Steam-overlay allowlist (an exact shape, not a prefix).
2. **Bind every value with `?`.** Use the `query` helpers; never concatenate or interpolate user input into SQL.
3. **Validate and clamp input.** Treat every field as hostile — check types, lengths, and ranges (the roster routes are the model).
4. **Never trust a client-supplied identity or result.** Derive `account_id` from the session, the winner from board state, the killer from cross-client agreement — never from the request body.
5. **Gate anything dangerous behind `NODE_ENV`.** Debug/admin routes follow the `/debug/*` pattern (`app.ts -> the debug-router block`) and should be off in production.

---

*Last updated: 2026-07-25. Sources: `src/app.ts`, `src/services/auth/{auth,discord}.ts`, `src/db/connection.ts`, `src/services/battle/Battle.ts`, `.claude/rules/{gotchas,db}.md`, and — for the cross-repo mod-bridge entry — `bsf-client/docs/mod-bridge.md`.*
