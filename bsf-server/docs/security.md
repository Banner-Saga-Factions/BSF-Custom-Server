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
| **Session-key gate** | Every `/services/*` request needs a valid session key (the last URL path segment); `"11"` is the login-only bypass; the Steam-overlay path is shape-allowlisted to a `200` no-op | `app.ts:84-121` (#55); decision tree in [`error-handling.md`](./error-handling.md) |
| **Session-key entropy** | `crypto.randomBytes(16)` → 32 hex chars = **128 bits** (UUIDv4-equivalent) | `auth.ts:29-31` (#53) |
| **Login rate-limit** | **5 / 60 s / IP**, in-memory; returns `429` with a JSON message; skipped under `NODE_ENV=test` | `auth.ts:207-214` (#56) |
| **OAuth CSRF** | `bsf_oauth_state` cookie — **HttpOnly**, **SameSite=Lax**, 5-min TTL, **one-shot / replay-protected** (deleted on use); Discord error tokens are allowlisted before being reflected | `discord.ts:27-42, 102-128` (#54) |
| **JWT scope** | JWTs are issued/verified for **Discord login only** (`discord.ts:142` / `:162`, `app.ts:98`); game traffic uses session keys, never a JWT. `JWT_SECRET` fail-fast at boot | `app.ts:19-22, 98` |
| **SQL injection** | All user-supplied **values** are bound with `?` placeholders through the `query` / `queryOne` / `queryUpdate` helpers | `connection.ts:79-95`; [`db.md`](../.claude/rules/db.md) |
| **`/debug/*` gating** | The debug router mounts only when `NODE_ENV !== "production"`, with a loud boot warning when it's on | `app.ts:44`, `index.ts:13-18` |
| **Game integrity** | Server-**derived** winner (the side still standing — *not* the client's `killerparty`, #19); a death counts only when **both** clients report it (#18); a unit's KILLS stat only credits when both clients name the **same** killer (#99) | `Battle.ts`; [`CLAUDE.md` §Battle State](../CLAUDE.md#battle-state), [`gotchas.md`](../.claude/rules/gotchas.md) |

Two points worth spelling out:

- **What the `"11"` sentinel actually allows.** The gate skips the session requirement for *any* request whose last path segment is `"11"` (`app.ts:106`). Only the login route (`/auth/login/11`) is built to run without a session; any other route reached this way still has no `req.session` and fails downstream (`401` / no `accountData`). So `"11"` is an unauthenticated door to **login only**, not a general bypass — but don't add a new route that trusts being reachable with it.
- **The one SQL string interpolation is safe.** `account.ts:51` interpolates `${ACCOUNT_COLUMNS}` into a `SELECT`. `ACCOUNT_COLUMNS` is a hardcoded constant column list (`account.ts:34-35`), never user input; the `user_id` value beside it is still `?`-bound. Every other `${}` in `src/db` is a log/error message, not SQL. The rule that keeps this true: never call `new DatabaseSync` outside `connection.ts` ([`db.md`](../.claude/rules/db.md)).

## What is NOT protected today

Sourced from the code, not the issue tracker — so contributors know where the boundary actually is.

- **Two *colluding* modified clients can agree on a false outcome.** Death-confirmation and same-killer agreement stop a *lone* cheater, but if both clients lie in the same way the server has no independent truth — it relays and records the battle, it does not simulate it. Closing this would require server-side re-simulation. (See [`gotchas.md`](../.claude/rules/gotchas.md); the recorder-vs-simulator boundary is detailed in [`battle-simulation.md`](./battle-simulation.md).)
- **The login rate-limit is per-process and in-memory** (`auth.ts:203-205`). It does not survive a restart and does not hold across multiple hosts — a scale-out would need a shared store (e.g. Redis).
- **No in-process TLS.** The server listens with plain `http` on `:8082` (`index.ts:20`); transport encryption is assumed to be terminated upstream by Caddy. Running it directly exposed would be cleartext.
- **Sessions, queue, and lobby state are in-memory** — lost on restart and unshareable across processes (single-instance only, by design — see [`ARCHITECTURE.md`](./ARCHITECTURE.md)).
- **Discord id collision (#140, open, `bug`/`P3` — not labeled security).** Two Discord Snowflakes that share their low 30 bits map to the same 32-bit in-game `account_id` (`discord.ts:175`). They stay distinct DB rows (keyed on the full id string), but would share an in-game identity. Integrity-adjacent; listed here as a known limitation.

## Adding a route — a short checklist

1. **Require a session.** Don't extend the gate's bypass list; if a route genuinely must be unauthenticated, justify it like the Steam-overlay allowlist (an exact shape, not a prefix).
2. **Bind every value with `?`.** Use the `query` helpers; never concatenate or interpolate user input into SQL.
3. **Validate and clamp input.** Treat every field as hostile — check types, lengths, and ranges (the roster routes are the model).
4. **Never trust a client-supplied identity or result.** Derive `account_id` from the session, the winner from board state, the killer from cross-client agreement — never from the request body.
5. **Gate anything dangerous behind `NODE_ENV`.** Debug/admin routes follow the `/debug/*` pattern (`app.ts:44`) and should be off in production.

---

*Last updated: 2026-06-30. Sources: `src/app.ts`, `src/services/auth/{auth,discord}.ts`, `src/db/connection.ts`, `src/services/battle/Battle.ts`, and `.claude/rules/{gotchas,db}.md`.*
