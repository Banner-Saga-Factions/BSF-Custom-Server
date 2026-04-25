# Regression Analysis Report
## Branches: `RichardElTaino-MVP_documentation-Phase1` vs `Atmakuja_DB_Changes`

_Source: `docs/regression-analysis.txt` — full git diff between the two branches_

---

## Context

**Timeline:** Both branches forked from the same commit (`2931669`, the current tip of `main`). Neither has been merged back. `RichardElTaino-MVP_documentation-Phase1` is 27 commits ahead of main with Richard's ongoing work. `Atmakuja_DB_Changes` is a parallel branch by a different contributor (Atmakuja) last edited in 2023 — it diverged from the same base and has been dormant since.

**What this means for the analysis:** These are two parallel feature branches that have never been reconciled. The diff in `regression-analysis.txt` shows what's different between them — changes Atmakuja's branch has that Richard's doesn't, and vice versa. The question is: **can Atmakuja's work be integrated without breaking what Richard has built on the current branch?**

The `Atmakuja_DB_Changes` branch represents an attempt to refactor the database layer away from `mysql2/promise` (with a custom pool helper in `src/db/connection.ts`) toward a new module structure under `src/api/utils/` using the older `mysql` callback driver, with new modules for `entityDefs`, `parties`, `purchasableUnits`, `stats`, and `users`. This work was never completed. Because both branches share the same base, the 27 commits on Richard's branch represent work Atmakuja's branch simply doesn't have — battle endgame fixes, Discord OAuth, Steam ID precision fix, debug tooling, and more. A merge would require resolving all of that as conflicts.

---

## Risk Summary

| # | Area | Severity | File(s) |
|---|------|----------|---------|
| 1 | GameRouter removed — long-poll dead | **CRITICAL** | `src/index.ts` |
| 2 | Entire DB layer deleted, no replacements wired | **CRITICAL** | `src/db/connection.ts`, `account.ts`, `battles.ts`, `schema.sql` |
| 3 | Hardcoded credentials committed | **CRITICAL** | `src/api/utils/mysql.connector.ts` |
| 4 | `mysql2` → `mysql` package swap breaks all DB calls | **CRITICAL** | `package.json` |
| 5 | JWT verify no longer try/catch — crashes on bad token | **HIGH** | `src/index.ts` |
| 6 | Steam overlay path check broken — 403s every overlay req | **HIGH** | `src/index.ts` |
| 7 | `res.status(403)` without `.send()` — sockets hang | **HIGH** | `src/index.ts` |
| 8 | `getInitialData()` bug — `first.json` data silently dropped | **HIGH** | `src/services/auth/auth.ts` |
| 9 | JWT_SECRET fail-fast check removed | **HIGH** | `src/index.ts` |
| 10 | `acc.json` — all purchasable unit defs gutted | **HIGH** | `data/acc.json` |
| 11 | `schema.sql` deleted — no DB init path | **HIGH** | `src/db/schema.sql` |
| 12 | New `src/api/utils/` modules not wired into any route | **MEDIUM** | `src/api/utils/*` |
| 13 | `.env.local` uses wrong format (`export KEY = ''`) | **MEDIUM** | `.env.local`, `src/config/vars.config.ts` |
| 14 | `docker-compose.yml` deleted + `RUN printenv` in Dockerfile | **MEDIUM** | `docker-compose.yml`, `Dockerfile` |
| 15 | `docs/ARCHITECTURE.md` + `docs/Development.md` deleted | **MEDIUM** | `docs/` |
| 16 | `tsc-alias` required but path alias resolution unverified | **LOW** | `package.json`, `tsconfig.json` |
| 17 | `Battle.init()` never awaited — parties empty, all opponent calls crash | **CRITICAL** | `src/services/battle/Battle.ts` |
| 18 | `aliveUnits` never populated — `/killed` and endgame entirely dead | **CRITICAL** | `src/services/battle/Battle.ts` |
| 19 | `getUser()` returns `-1` on DB error — cascade crash on login | **CRITICAL** | `src/api/utils/users/users.controller.ts` |
| 20 | Discord ID precision loss on login — same class of bug as Steam ID fix | **HIGH** | `src/services/auth/auth.ts` |
| 21 | `userId` JWT path skips `req.session` — route handlers crash | **HIGH** | `src/index.ts` |
| 22 | Unhandled rejected promises through entire DB stack | **HIGH** | `src/api/utils/*/` |
| 23 | Login sends `null` JSON when user not found — client hangs | **HIGH** | `src/services/auth/auth.ts` |
| 24 | N+1 query problem in `/account/info` — ~28 sequential queries | **MEDIUM** | `src/services/account.ts` |
| 25 | `puEntDef.find()` unguarded — `/account/info` crashes on FK mismatch | **MEDIUM** | `src/services/account.ts` |
| 26 | No renown affordability check — players can go negative | **MEDIUM** | `src/services/roster.ts` |
| 27 | Client-controlled stat deltas — no server-side bounds validation | **MEDIUM** | `src/services/roster.ts` |
| 28 | Account info never sent if `session.user_id <= 0` — client hangs | **MEDIUM** | `src/services/account.ts` |
| 29 | `.gitignore` stripped — `build/`, logs, and env files unprotected | **MEDIUM** | `.gitignore` |

---

## Detailed Findings

---

### 1. GameRouter Removed (CRITICAL)

**What changed:** `import { GameRouter }` and `ServiceRouter.use("/game", GameRouter)` removed from `src/index.ts`.

**Impact:** `GET /services/game/:session_key` — the long-polling endpoint — no longer exists. This is the entire real-time data delivery mechanism. The game client opens this connection on login and waits up to 10 seconds for server pushes. Without it, no matchmaking events, no battle data, and no initial data reach the client. **The game is non-functional.**

**Mitigation:** Re-add `GameRouter` from the current branch. Confirm `src/services/game.ts` is present and intact.

---

### 2. Entire DB Layer Deleted with No Working Replacement (CRITICAL)

**What changed:** These files are fully deleted on the branch:
- `src/db/connection.ts` — mysql2 pool + `query<T>()` / `queryOne<T>()` helpers
- `src/db/account.ts` — `upsertAccount`, `addRenown`, `saveParty`, `saveRoster`, `getAccountByUserId`
- `src/db/battles.ts` — `saveBattleResult`
- `src/db/schema.sql` — DDL for `accounts` and `battles` tables

**Impact:** All services that depend on `src/db/account.ts` (auth, endgame) and `src/db/battles.ts` (endgame) will have broken imports at compile time. The new `src/api/utils/` modules are not yet wired into any of those call sites in a working way. There is also no migration script to evolve an existing database — this is a hard cut.

**Mitigation:** Do not merge without either (a) restoring the old `src/db/` layer or (b) completing and testing the new `src/api/utils/` modules as full drop-in replacements for every call site. `yarn build` on the branch will fail to compile.

---

### 3. Hardcoded Credentials Committed (CRITICAL / SECURITY)

**What changed:** `src/api/utils/mysql.connector.ts` (new file) contains:
```ts
connection = mysql.createConnection({
  port     : 3300,
  host     : '127.0.0.1',
  user     : 'factions',
  password : '4Z7&R!wyCyRs',
  database : 'factions-dev'
});
```
The dynamic config block (reading from `vars.config.ts`) is commented out.

**Impact:** Any deployment using this branch connects to a single hardcoded dev instance. The credentials are now in git history. The port (3300, not standard 3306) will silently fail on any standard MySQL install.

**Mitigation:** Rotate the `factions` database password — it has been in the public branch since 2023. Remove the hardcoded block and uncomment the `dataSource`-based config.

---

### 4. `mysql2` → `mysql` Package Swap Breaks All DB Calls (CRITICAL)

**What changed:** `package.json` removes `mysql2: ^3.22.1` and adds `mysql: ^2.18.1`.

**Impact:** `mysql` (v2) is the old callback-based driver. `mysql2/promise` is not the same package. The new `mysql.connector.ts` uses a single `Connection` (not a pool), which is not production-safe and doesn't support concurrent queries.

**Mitigation:** The current branch uses `mysql2/promise` with a connection pool — that is the correct production pattern and should be kept.

---

### 5. JWT Verify No Longer in Try/Catch — Crashes on Bad Token (HIGH)

**What changed:**
```ts
// current branch (safe):
try {
    const decoded = verify(token, JWT_SECRET);
    userId = (decoded as any)?.discord_id;
} catch { /* fall through to 403 */ }

// Atmakuja branch (unsafe):
const decodedToken = verify(token, process.env.JWT_SECRET as string);
userId = (decodedToken as any)?.discord_id;
```

**Impact:** `verify()` throws `JsonWebTokenError` on expired, malformed, or tampered tokens. Without a try/catch, an invalid Bearer token crashes the request handler.

**Mitigation:** Wrap in try/catch as on the current branch.

---

### 6. Steam Overlay Path Check Broken — 403 on Every Overlay Request (HIGH)

**What changed:**
```ts
// current branch (correct — Express strips /services prefix inside ServiceRouter):
if (req.path.startsWith("/session/steam/overlay/")) {

// Atmakuja branch (broken):
if (req.path.startsWith("/services/session/steam/overlay/")) {
```

**Impact:** Steam overlay requests fall through to auth validation and return 403. Per `CLAUDE.md`: "Express strips the `/services` prefix inside `ServiceRouter`."

---

### 7. `res.status(403)` Without `.send()` — Sockets Hang (HIGH)

**What changed:**
```ts
// current branch (correct):
res.sendStatus(403); return;

// Atmakuja branch (broken):
res.status(403); return;
```

**Impact:** `res.status()` sets the status code but does not flush the response. The connection stays open indefinitely on any auth failure.

---

### 8. `getInitialData()` Bug — `first.json` Data Silently Dropped (HIGH)

**What changed:**
```ts
// current branch (correct):
return initialData.concat(_firstJsonData);

// Atmakuja branch (bug — .concat() result discarded):
initialData.concat(JSON.parse(readFileSync("./data/first.json", "utf-8")));
return initialData;
```

**Impact:** `Array.prototype.concat` is non-mutating. Every client's initial poll response omits currency, friends, and all `first.json` data. Also re-reads the file on every poll instead of using the cached value.

---

### 9. JWT_SECRET Fail-Fast Check Removed (HIGH)

**What changed:** The Atmakuja branch removes the startup check that throws if `JWT_SECRET` is missing.

**Impact:** Server starts silently without `JWT_SECRET`, then crashes on the first Discord Bearer token request.

---

### 10. `acc.json` — All Purchasable Unit Definitions Gutted (HIGH)

**What changed:** `data/acc.json` went from 728 lines to 15. All entries in `purchasable_units.units[]` removed — file now has an empty array. Also: `renown` changed 19→100, `roster_rows` changed 1→2.

**Impact:** New accounts get no purchasable units. The Mead House (unit shop) shows an empty list.

---

### 11. `schema.sql` Deleted — No DB Initialization Path (HIGH)

**What changed:** `src/db/schema.sql` deleted. `docker-compose.yml` (which auto-mounted it) also deleted.

**Impact:** No way to initialize the database for new contributors or CI environments.

---

### 12. New `src/api/utils/` Modules Not Wired Into Any Route (MEDIUM)

**What changed:** Five new module families added: `entityDefs`, `parties`, `purchasableUnits`, `stats`, `users`. `auth.ts` imports `UserFunctions` from `users.controller` but doesn't use it for battle/queue/endgame.

**Impact:** These modules exist but affect nothing. The battle system, queue, and endgame still expect the old `AccountRow` type and `addRenown`/`saveParty`/`saveRoster`/`saveBattleResult` functions, which no longer exist.

---

### 13. `.env.local` Uses Wrong Format — dotenv Won't Parse It (MEDIUM)

**What changed:** New `.env.local` uses shell export syntax:
```sh
 export MY_SQL_DB_HOST = '';
```

**Impact:** `dotenv` expects `KEY=value` format — no `export`, no spaces around `=`. `vars.config.ts` reads `process.env.MY_SQL_DB_HOST` etc., which will always be `undefined`. Also introduces a `MY_SQL_DB_*` naming convention conflicting with the existing `DB_*` vars.

---

### 14. Docker Deployment Broken + Credentials Leaked in Build Logs (MEDIUM)

**What changed:** `docker-compose.yml` deleted. `Dockerfile` adds `RUN printenv` and removes `EXPOSE 8082`.

**Impact:** `RUN printenv` prints all environment variables (including `JWT_SECRET` and DB credentials) to Docker build output. Any CI pipeline using this Dockerfile leaks secrets in build logs.

---

### 15. `ARCHITECTURE.md` and `Development.md` Deleted (MEDIUM)

**What changed:** Both docs deleted (409 and 605 lines). Replaced with an older `README.md`.

**Impact:** New contributors lose the primary onboarding resource. The current branch has since expanded and corrected these docs significantly.

---

### 16. `tsc-alias` Dependency — Path Alias Resolution Risk (LOW)

**What changed:** Build script changed to `tsc && tsc-alias`. New imports use `@api/*` TypeScript path aliases.

**Impact:** If `tsc-alias` fails or path aliases aren't configured in `tsconfig.json`, the compiled JS will contain unresolvable `@api/*` imports at runtime.

---

### 17. `Battle.init()` Never Awaited — BattleCreateData Sent with Empty Parties, All Opponent Calls Crash (CRITICAL)

**What changed:** The `Battle` constructor calls `this.init(parties)` without `await`, then immediately overwrites `this.parties` with the raw `Session[]`:

```ts
constructor(parties: Session[], ...) {
    this.parties = [];
    this.init(parties);     // async, not awaited — partyData never fills before message is sent
    this.parties = parties; // overwrites with Session[] (wrong type — should be BattlePartyData[])
}
```

**Two compounding bugs:**

1. `init()` is `async` and uses `parties.forEach(async ...)` internally. `forEach` ignores returned Promises, so all `await EntityDefFunctions.*` calls inside the loop dispatch and are immediately abandoned. `partyData` is always `[]` when `BattleCreateData` is assembled. Both clients receive a battle create message with no party data.

2. After `init()` fires (unresolved), `this.parties = parties` assigns `Session[]`. Every downstream call that expects `BattlePartyData`-keyed parties gets the wrong type. `battleHandler.getOpponent()` calls `Object.keys(battle.parties)` expecting session key strings, but gets `["0", "1"]` (array indices). Every battle action that calls `data.opponent.pushData(...)` resolves `data.opponent` as `undefined` and crashes with `TypeError: Cannot read property 'pushData' of undefined`.

**Impact:** Every battle fails immediately on `/ready`, `/deploy`, `/sync`, `/move`, and `/action`. The server throws an unhandled exception on the first action of every match.

**Mitigation:** Make the constructor or `addBattle` async, properly `await this.init()`, and use a session-key-keyed object (not an array) for `this.parties` as the original code did.

---

### 18. `aliveUnits` Never Populated — `/killed` and Endgame Entirely Dead (CRITICAL)

**What changed:** The old constructor populated `aliveUnits` synchronously:
```ts
this.aliveUnits[`${party.user}`] = party.defs.map((entity) => entity.id);
```
The new `init()` never sets `aliveUnits`. It is initialized as `{}` and never written.

**Impact:** When `/battle/killed` fires:
```ts
let party = battle.aliveUnits[req.body.killedparty]; // always undefined
let killed_idx = party.indexOf[req.body.entity];     // TypeError: Cannot read property 'indexOf' of undefined
```
The server throws before the kill is processed, before endgame can be evaluated, and before either player receives `BattleFinishedData` or `RenownMessage`. Battles have no exit condition — they run indefinitely with no winner.

**Mitigation:** Populate `aliveUnits` inside `init()` after `createBattlePartyData()` resolves, as the original code did.

---

### 19. `getUser()` Returns `-1` on DB Error — Cascade Crash on Login (CRITICAL)

**What changed:** The users controller swallows DB errors with a numeric sentinel:
```ts
export const getUser = async (user_id: number) => {
    try {
        return await UsersServices.getUserById(user_id);
    } catch (error) {
        return -1; // numeric sentinel, not null
    }
};
```

**Impact:** In `Session.GetSessionInit()`:
```ts
const user = await UserFunctions.getUser(user_id);
if (user != null) {          // -1 != null → TRUE, execution continues
    var userJson = JSON.parse(JSON.stringify(user)); // produces the number -1
    await UserFunctions.updateUserLoginCount(userJson[0].id); // (-1)[0] is undefined → crash
```

If the DB is unreachable at login time (wrong credentials, connection timeout, cold start before connection is established), the login handler throws an unhandled `TypeError` mid-execution. No response is sent to the client — the connection hangs until timeout. On Node 15+, unhandled rejections terminate the process.

**Mitigation:** Return `null` (not `-1`) on error, or re-throw and handle in the caller with a proper 500 response.

---

### 20. Discord ID Precision Loss on Login — Same Class of Bug as Steam ID Fix (HIGH)

**What changed:** The login route extracts `discord_id` from the JWT and passes it directly to `addSession()`:
```ts
let userData = await sessionHandler.addSession((data as any).discord_id);
// addSession(user_id: number) — discord_id is a string snowflake
```

**Impact:** Discord IDs are 64-bit integers (up to 19 digits). JavaScript's `Number` type is IEEE 754 double-precision with a 53-bit mantissa — integers above `2^53 = 9,007,199,254,740,992` lose precision. Current Discord IDs (issued since ~2022) are in the range `10^18`, well above this threshold. A Discord ID like `1085834561234567890` becomes `1085834561234568000` after coercion — a completely different value. The DB query `WHERE id = ?` will find no matching user.

Commit `8c01347` on the current branch explicitly fixed the identical precision loss for Steam IDs using `BigInt`. This branch reintroduces the same class of bug for Discord IDs and fixes nothing.

**Mitigation:** Store and query Discord IDs as `BIGINT` / `VARCHAR(20)` in the DB, and pass them as strings through the JS layer without numeric coercion, matching the pattern in commit `8c01347`.

---

### 21. `userId` JWT Path Doesn't Populate `req.session` — Route Handlers Crash (HIGH)

**What changed:** When a Discord Bearer JWT is valid but no matching in-memory session exists, the auth middleware sets `req.userId` but leaves `req.session` as `undefined`:

```ts
(req as any).session = session; // session is undefined here — no session was found
(req as any).userId = userId;   // set correctly
app._router.handle(req, res, next);
```

**Impact:** Every route handler that accesses `(req as any).session` will crash:
```ts
// account.ts
let session = (req as any).session;
if (session.user_id > 0) { ... } // TypeError: Cannot read property 'user_id' of undefined
```

The Discord JWT path passes the auth gate but fails with an unhandled crash inside every downstream handler. This path exists specifically to support the Discord OAuth login flow, meaning Discord-authenticated users can never successfully reach any route.

**Mitigation:** When a valid JWT is decoded, look up or construct a session from the `discord_id` claim and assign it to `req.session` before calling `next()`.

---

### 22. Unhandled Rejected Promises Through the Entire DB Stack (HIGH)

**What changed:** Several service functions call `execute()` without `await` or `return`, detaching the Promise:
```ts
// parties.service.ts
export const insertUserParty = async (...) => {
  execute<...>(...); // Promise created but not awaited and not returned
};

// stats.service.ts
export const deleteEntityStats = async (...) => {
  execute<...>(...); // same
};
```

Additionally, route handlers like `/party/arrange` are not `async` and call async functions fire-and-forget:
```ts
RosterRouter.post("/party/arrange/:session_key", (req, res) => {
    PartyFunctions.deletetUserParty(session.user_id); // detached
    for (...) { PartyFunctions.insertUserParty(...); } // detached
    res.send(); // always "succeeds" even if all DB writes fail
});
```

**Impact:** DB errors are completely invisible to the client — operations silently fail, the response claims success, and data is never written. On Node 15+, unhandled rejections from detached Promises terminate the process entirely if the underlying `execute()` rejects. Given the hardcoded credentials and single-connection issues (findings #3, #4), `execute()` rejecting is the expected runtime behavior on any standard environment.

**Mitigation:** `await` every `execute()` call, `return` Promises from service functions, and wrap route handlers in try/catch with proper error responses.

---

### 23. Login Sends `null` JSON When User Not Found — Client Hangs (HIGH)

**What changed:**
```ts
let userData = await sessionHandler.addSession((data as any).discord_id);
res.json(userData); // sends null if addSession returns null
```

`addSession()` returns `null` when `GetSessionInit()` can't find the user in the DB.

**Impact:** The game client parses the login response and extracts `session_key` to authenticate all subsequent requests. Receiving `null` as the response body results in a null pointer exception client-side. The client has no session key and cannot proceed, but the server sends HTTP 200 — there is no error code to distinguish a failed login from a successful one. The client likely hangs at the loading screen with no feedback.

**Mitigation:** Return HTTP 401 with a descriptive error when `addSession` returns null, matching how other auth failures are handled.

---

### 24. N+1 Query Problem in `/account/info` — Up to 28 Sequential DB Round-Trips (MEDIUM)

**What changed:** `account.ts` assembles account data with nested sequential `await` loops:
```ts
for (let indexA = 0; indexA < userRostersJson.length; indexA++) {
    let userRosterStats = await StatsFunctions.getEntityDefsStats(userRostersJson[indexA].id); // 1 query per unit
    // ...
}
for (let indexA = 0; indexA < purchasableUnitsJson.length; indexA++) {
    let purchasableUnitsStats = await StatsFunctions.getEntityDefsStats(...); // 1 query per purchasable unit
    // ...
}
```

**Impact:** For a user with 12 roster units and 12 purchasable unit types: 1 (user) + 1 (party) + 1 (entity defs) + 12 (roster stats) + 1 (purchasable entity defs) + 1 (purchasable unit list) + 12 (purchasable stats) = **29 sequential DB queries** per `/account/info` request. Because each query is individually awaited in a loop, latency is additive. At 5ms per query, that's ~145ms of pure DB wait time per account info fetch — before any network overhead.

**Mitigation:** Use `Promise.all()` to parallelize stat queries per batch, or restructure the SQL to JOIN stats in the initial query.

---

### 25. `puEntDef.find()` Unguarded — `/account/info` Crashes on FK Mismatch (MEDIUM)

**What changed:**
```ts
var puEntDef = purchasableUnitsEntDefsJson.find(
    (x: any) => x.id == purchasableUnitsJson[indexA].entitydef_fk
);
// No null check — used immediately:
id: puEntDef.unit_id, // TypeError if find() returned undefined
```

**Impact:** If any `PurchasableUnitData` row in the DB has an `entitydef_fk` that doesn't match any row in `EntityDef` (broken FK, deleted entity, or data inconsistency), `find()` returns `undefined`. The next line throws `TypeError: Cannot read property 'unit_id' of undefined`. This crashes the entire `/account/info` handler with an unhandled exception, sending no response to the client.

**Mitigation:** Check `if (!puEntDef) continue;` or `if (!puEntDef) throw new Error(...)` with a proper 500 handler.

---

### 26. No Renown Affordability Check — Players Can Go Negative (MEDIUM)

**What changed:** All renown-spending routes call `updateUsersRenown(cost, userFk)` without first verifying the player has enough renown. The SQL correctly subtracts:
```sql
UPDATE db.Users SET u.renown = u.renown - ? WHERE id = ?
```

**Impact:** A player with 5 renown can hire a unit costing 100 renown, ending up at `-95`. No floor is enforced. Renown can be driven to arbitrarily negative values. This affects hire (`/unit/hire`), promote (`/unit/promote`), rename (`/unit/rename`), and barracks expansion (`/unlock`).

**Mitigation:** Query current renown before each spend and return HTTP 402 / error response if `current_renown < cost`. Alternatively, add a `CHECK (renown >= 0)` constraint in the schema.

---

### 27. Client-Controlled Stat Deltas — No Server-Side Bounds Validation (MEDIUM)

**What changed:** The `/unit/stats/purchase` route accepts stat delta values directly from the client:
```ts
var deltas = req.body.deltas; // array from untrusted client input
await StatsFunctions.updateEntityStat(deltas[index], rosterIdJson[0].id, statDetailsJson[0].id);
```
The SQL applies the delta unconditionally:
```sql
UPDATE db.Stat SET s.value = s.value + ? WHERE entitydef_fk = ? AND stats_fk = ?
```

**Impact:** A client can send any integer as a delta — positive or negative, arbitrarily large. A single request with `delta: 9999` for STRENGTH would produce a one-shot unit. A negative delta can drive stats below zero or to nonsensical values. There is no verification that the delta corresponds to a legitimate upgrade cost or that the player paid for the upgrade.

**Mitigation:** Server should compute the allowed delta from the purchase cost rather than accepting it from the client. Validate that the resulting stat value stays within game-defined min/max bounds.

---

### 28. Account Info Response Never Sent if `session.user_id <= 0` — Client Hangs (MEDIUM)

**What changed:**
```ts
AccountRouter.get("/info/:session_key", async (req, res) => {
    let session = (req as any).session;
    if (session.user_id > 0) {
        // ... build and send response
    }
    // no else — if user_id is 0 or negative, nothing is sent
});
```

`Session` is initialized with `user_id = 0`. If login fails silently (see findings #19, #23), a session can persist with `user_id = 0`. Any subsequent `/account/info` request for that session returns no response — the connection stays open until the client times out.

**Mitigation:** Add an `else { res.sendStatus(401); }` branch, or validate session completeness in the auth middleware before routing.

---

### 29. `.gitignore` Massively Stripped — Build Output and Sensitive Files Unprotected (MEDIUM)

**What changed:** The `.gitignore` went from 113 lines to 6. Notable protections removed:
- `build/` and `dist/` — compiled TypeScript output can be accidentally committed
- `yarn.lock` — removed (now listed as removed in gitignore, not just untracked)
- `.env.local` — removed from gitignore (this is why `.env.local` was committable in the first place)
- Log files (`*.log`, `npm-debug.log*`)
- IDE directories (`.vscode/`, `.idea/`)
- Test coverage directories

**Impact:** The `build/` directory (compiled JS) can be silently committed and pushed, bloating the repo and creating stale-build confusion. `.env.local` being committable directly enabled finding #3 (hardcoded credentials committed). Future contributors working with IDEs will have their settings directories committed.

**Mitigation:** Restore a comprehensive `.gitignore`. At minimum restore `build/`, `.env*`, `yarn.lock`, and IDE directories.

---

## Recommended Action

**Do not merge `Atmakuja_DB_Changes` into `RichardElTaino-MVP_documentation-Phase1` or `main` as-is.** It is an unfinished parallel branch. A naive merge would overwrite 27 commits of working code with broken, incomplete replacements. The Atmakuja work does contain genuinely new feature code (Proving Grounds / `RosterRouter`) that doesn't exist anywhere on Richard's branch — that part has value, but it needs to be extracted and adapted, not merged wholesale.

---

### What This Branch Is Actually Trying to Do

This is not just a driver swap. The `src/api/utils/` modules represent a **full DB schema redesign** — moving from the current "JSON blobs in columns" approach to a normalized relational schema:

| New Table | Purpose |
|-----------|---------|
| `db.EntityDef` | Per-user unit roster rows (one row per unit) |
| `db.Parties` | Party membership (FK into EntityDef) |
| `db.Stats` | Per-unit stat rows (one row per stat per unit) |
| `db.PurchasableUnits` | Shop catalog with costs |
| `db.Users` | Replaces `accounts` with normalized user data |

The `RosterRouter` (`src/services/roster.ts`, 231 lines) is new feature code for the Proving Grounds: party arrangement, unit promotion, unit hiring, renaming, dismissal, stat upgrades, and barracks expansion. This is genuinely useful MVP work.

The problem is it was built against the new schema without:
- A schema migration script or DDL for the new tables
- Any wiring into the existing battle/queue/endgame flows
- Keeping the existing server functional while this layer was being built

---

### Security Note

The hardcoded `factions` database password (`4Z7&R!wyCyRs`) has been in the git history of `Atmakuja_DB_Changes` since 2023. If that branch is public on GitHub and the `factions-dev` instance (port 3300) was ever accessible beyond localhost, assume the password is compromised and rotate it.

---

### Is Any of This Worth Cherry-Picking?

**Potentially worth adapting (not cherry-picking verbatim):**

- `src/services/roster.ts` — The `RosterRouter` (231 lines) implements Proving Grounds functionality: party arrangement, unit promotion, unit hiring, renaming, dismissal, stat upgrades, barracks expansion. The **logic and route structure** are useful reference for implementing those features on the current branch. However, it cannot be cherry-picked as-is because it depends entirely on the `src/api/utils/` DB modules.

- The normalized DB schema concept (`EntityDef`, `Parties`, `Stats` tables) is architecturally sound if Proving Grounds is a future milestone, but would require a migration from the current JSON-blob columns.

- The `README.md` launch args documentation table has some useful content to fold into `Development.md`.

**Not worth extracting:**

- `src/api/utils/` modules — use the `mysql` v2 callback driver, a single non-pooled `Connection`, hardcoded credentials, and a dangerous query-rewrite regex. Would need to be completely rewritten against `mysql2/promise`.

- All config/env changes — `MY_SQL_DB_*` naming, `.env.local` shell syntax, `vars.config.ts` — conflict with the current `DB_*` convention.

- Any `src/index.ts`, `src/services/auth/auth.ts`, or `data/acc.json` changes — all regress work fixed on the current branch.

---

### Additional Code Quality Issues in `src/api/utils/` (if reviving this work)

- **`mysql.connector.ts` — dangerous query rewrite:** `query.replace(/db/gi, db)` will corrupt any query containing "db" in a column name or alias (e.g., `WHERE debug_flag = ?` becomes broken).
- **`mysql.connector.ts` — single `Connection` instead of pool:** Serializes all queries, fails permanently if connection drops after MySQL's `wait_timeout` (default 8 hours).
- **`entityDefs.queries.ts` — SQL bug:** `GetUserPartyEntityDefsByUserId` references alias `r` which is never defined — will throw a MySQL error at runtime on every battle creation attempt.
- **`RosterRouter` — no error handling:** All async route handlers lack try/catch; DB errors leave responses open.
- **`users.controller.ts` — `-1` sentinel:** `getUser()` returns the number `-1` on DB error instead of `null` — callers that check `!= null` will treat a DB failure as a successful empty result.
- **Renown sign (clarification):** The SQL correctly subtracts renown (`renown - ?`) and callers pass positive costs — the sign convention is correct. The missing piece is an affordability check before spending (see finding #26).
