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
- **`mysql.connector.ts` — single `Connection` instead of pool:** Serializes all queries, fails permanently if connection drops.
- **`entityDefs.queries.ts` — SQL bug:** `GetUserPartyEntityDefsByUserId` references alias `r` which is never defined — will throw a MySQL error at runtime.
- **`RosterRouter` — no error handling:** All async route handlers lack try/catch; DB errors leave responses open.
- **`RosterRouter` — renown sign ambiguity:** `updateUsersRenown(cost, userFk)` is called for hiring/promoting with positive values — unclear whether the function adds or subtracts.

---

### Verdict

Treat `Atmakuja_DB_Changes` as **reference material for a future Proving Grounds milestone**, not a source branch to integrate now. The `RosterRouter` logic is the only piece that adds genuinely new feature coverage — use it as a design spec and reimplement against the current `mysql2/promise` stack. Do not attempt a rebase, merge, or wholesale cherry-pick.
