Lean GCP Deployment & SQLite Integration Review

  The plan covers the GCP deployment & SQLite integration analysis you requested — OOM risk assessment for
  Battle.ts/auth.ts, the SQLite migration strategy, Dockerfile optimization, health check endpoint, and mobile
  deployment implications. Review it there and approve or redirect before any code gets written.

Here is the plan:

  <ultraplan>
  # Plan: GCP e2-micro Deployment (SQLite Migration + Health Check + Dockerfile)

  ## Context

  Deploying to a GCP e2-micro (1 vCPU, **1 GB RAM**) with the current stack is risky because MySQL alone consumes
  ~300–400 MB. The SQLite migration eliminates the external DB service entirely, freeing that headroom. On top of that,
   two smaller changes make the server production-ready: a `/health` endpoint GCP's load balancer can probe, and a
  Dockerfile layer-ordering fix that halves rebuild times.

  A secondary OOM concern is in-memory session/battle leaks (abandoned sessions, crashed-player battles that never get
  cleaned up). These are addressed with a lightweight TTL cleanup — not by moving them to SQLite, because those maps
  hold live EventEmitters and active HTTP connections that **must** stay in-memory.

  ---

  ## OOM Risk Clarification

  The `SQLiteMigrationPlan.md` replaces the **MySQL DB** (accounts + battles tables). The in-memory `sessions` and
  `battles` maps in `auth.ts` / `Battle.ts` are _live game state_ — they cannot be persisted to SQLite during a match.

  ```
  Current baseline memory (~900MB peak → OOM risk on 1GB):
    MySQL docker container:   ~350 MB   ← eliminated by SQLite migration
    Node.js process:          ~150 MB
    Leaked sessions/battles:  unbounded ← addressed by TTL cleanup

  After migration + TTL cleanup:
    Node.js + SQLite file:    ~150 MB   → safe headroom on 1GB
  ```

  The biggest win is dropping MySQL.

  ---

  ## Change Summary

  ```
  package.json          remove mysql2, add better-sqlite3 + @types/better-sqlite3
  src/db/connection.ts  full rewrite: mysql2 pool → better-sqlite3 + inline schema init
  src/db/schema.sql     rewrite as SQLite DDL (reference copy; actual init is in connection.ts)
  src/db/account.ts     one SQL change: ON DUPLICATE KEY → ON CONFLICT(user_id)
  src/db/battles.ts     three SQL changes: NOW() → datetime('now'), VALUES() → excluded., Date → ISO string
  .env.example          DB_HOST/PORT/USER/PASSWORD/NAME → DB_PATH
  docker-compose.yml    remove db service + healthcheck, add db-data volume
  Dockerfile            reorder COPY for layer cache; add python3/make/g++ (build) and libstdc++ (runtime)
  src/app.ts            add GET /health before ServiceRouter
  src/services/auth/auth.ts  add lastActivity to Session; add 5-min interval to evict stale sessions/battles
  ```

  ---

  ## Step-by-Step Implementation

  ### 1. `package.json` — swap DB driver

  Remove `mysql2` from `dependencies`. Add:
  - `"better-sqlite3": "^9.x"` (runtime)
  - `"@types/better-sqlite3": "^7.x"` (devDependencies)

  ### 2. `src/db/connection.ts` — full rewrite

  Replace the entire file with the implementation from `SQLiteMigrationPlan.md` §2 verbatim. Key points:
  - `DB_PATH` env var with `data/bsf.db` default
  - `mkdirSync` ensures parent dir exists
  - `db.pragma("journal_mode = WAL")`
  - Inline schema init (`CREATE TABLE IF NOT EXISTS accounts`, `battles`, indexes)
  - Remove the `DB_PORT` numeric validation (no longer relevant)
  - Async wrappers (`query`, `queryOne`, `queryUpdate`) preserve the existing interface

  ### 3. `src/db/schema.sql` — rewrite as SQLite DDL

  Replace with the SQLite DDL from `SQLiteMigrationPlan.md` §3 (mirrors `connection.ts` schema). File becomes
  documentation-only.

  ### 4. `src/db/account.ts` — one SQL change

  In `upsertAccount()` at the `INSERT` statement:
  ```sql
  -- Before:
  ON DUPLICATE KEY UPDATE login_count = login_count + 1
  -- After:
  ON CONFLICT(user_id) DO UPDATE SET login_count = login_count + 1
  ```
  No other changes. `parseRow` already handles TEXT columns returning strings.

  ### 5. `src/db/battles.ts` — three changes

  In `saveBattleResult()`:
  1. `NOW()` → `datetime('now')` (×2: in VALUES and in the UPDATE SET)
  2. `VALUES(winner_user_id)` etc. → `excluded.winner_user_id` etc.
  3. `started_at` param: change to `started_at.toISOString()` (better-sqlite3 rejects Date objects)

  Full SQL per `SQLiteMigrationPlan.md` §5.

  ### 6. `.env.example` — replace DB variables

  Remove `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
  Add `DB_PATH=./data/bsf.db` with a comment.
  Keep `JWT_SECRET`, Discord vars.

  Also update `CLAUDE.md` environment setup section to match (remove the `mysql` init command, add the SQLite note).

  ### 7. `docker-compose.yml` — remove MySQL

  Replace entire file:
  ```yaml
  services:
    app:
      build: .
      ports:
        - "8082:8082"
      env_file: .env
      environment:
        DB_PATH: /app/db/bsf.db
      volumes:
        - db-data:/app/db

  volumes:
    db-data:
  ```
  The `DB_PATH` env override mounts the file in a named volume so it survives container restarts.

  ### 8. `Dockerfile` — layer cache + native build tools

  **Before:** `COPY . .` before `yarn install` — every source change busts the install cache.

  **After:**
  ```dockerfile
  FROM node:22-alpine AS build_env
  WORKDIR /src
  RUN apk add --no-cache python3 make g++
  COPY package.json yarn.lock ./
  RUN yarn install --frozen-lockfile && yarn cache clean
  COPY . .
  RUN yarn run build

  FROM node:22-alpine AS runtime_env
  ENV NODE_ENV=production
  WORKDIR /app
  RUN apk add --no-cache libstdc++
  COPY --from=build_env /src/build ./
  COPY --from=build_env /src/data ./data
  COPY --from=build_env /src/package.json ./
  COPY --from=build_env /src/yarn.lock ./
  RUN yarn install --frozen-lockfile --production && yarn cache clean
  EXPOSE 8082
  CMD ["node", "./index.js"]
  ```
  - `python3 make g++` required for better-sqlite3 C++ binding compilation
  - `libstdc++` required at runtime for the compiled binding
  - Lockfile copied first — `yarn install` layer is cached unless deps change

  ### 9. `src/app.ts` — add `/health` endpoint

  Add before the `ServiceRouter` middleware:
  ```typescript
  app.get("/health", (_req, res) => {
      res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
  });
  ```
  No DB ping needed — GCP's health check just needs a 200. The endpoint is outside `/services` so it bypasses auth
  middleware entirely.

  ### 10. `src/services/auth/auth.ts` — session TTL cleanup

  Two small additions:

  **A.** Add `lastActivity: number` to `Session`:
  ```typescript
  lastActivity: number = Date.now();
  ```
  Update it in `pushData()`:
  ```typescript
  pushData(...data: any) {
      this.lastActivity = Date.now();
      this.data.push(...data);
      this.emit("data");
  }
  ```

  **B.** Add a cleanup interval in `sessionHandler` (after the object literal):
  ```typescript
  const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

  setInterval(() => {
      const now = Date.now();
      for (const [key, session] of Object.entries(sessions)) {
          if (now - session.lastActivity > SESSION_TTL_MS) {
              dequeuePlayer(key);
              delete sessions[key];
              console.log(`[SESSION] Evicted stale session for user_id=${session.user_id}`);
          }
      }
  }, 5 * 60 * 1000); // run every 5 minutes
  ```
  This prevents abandoned sessions from accumulating indefinitely. Battles are already cleaned up in `/battle/exit`
  when both players leave; the session eviction indirectly unblocks any battle stuck waiting for a gone player (the
  `410 Gone` path in BattleRouter middleware).

  ---

  ## Dependency Order

  ```
  package.json
      ↓
  connection.ts (rewrite — new interface, inline schema)
      ↓
  account.ts   battles.ts   schema.sql   (SQL dialect fixes, depend on connection.ts)
      ↓
  .env.example   docker-compose.yml   Dockerfile   (infra, depend on SQLite design)
      ↓
  app.ts (health check — independent, but logical last step)
  auth.ts (TTL cleanup — independent, add alongside app.ts)
  ```

  ---

  ## Mobile/iOS Deployment Impact

  The SQLite migration simplifies mobile deployment in two concrete ways:

  1. **Single-container deployment**: The current stack requires orchestrating Node + MySQL as separate services. After
   migration, `docker run` of a single image is sufficient — easier to deploy to Cloud Run or any container host
  iOS/Android clients need to reach.

  2. **No data sync complexity introduced**: The in-memory sessions/battles maps hold live protocol state — this does
  NOT change. SQLite still only persists completed results (`accounts`, `battles` rows). The server remains
  single-instance stateful, same as before. The health check enables GCP's load balancer to detect crashes and restart,
   which is the closest thing to "resilience" available without multi-instance state sharing (which would require Redis
   — a future concern).

  ---

  ## Verification

  1. `yarn build` — TypeScript compiles (new types from `@types/better-sqlite3`)
  2. `yarn test` — all 50 tests pass unchanged (DB is fully mocked in tests)
  3. `yarn dev` — server starts, `data/bsf.db` created on disk, no errors
  4. `curl http://localhost:8082/health` → `{"status":"ok","uptime":N}`
  5. `test-2p-match.bat` — login → queue → match; `sqlite3 data/bsf.db ".tables"` shows rows in `accounts` and
  `battles`
  6. `docker build .` — image builds cleanly; confirm layer cache is used on second build with only source changes
  </ultraplan>

  The user approved this plan in the remote session. Give them a brief summary, then start implementing.