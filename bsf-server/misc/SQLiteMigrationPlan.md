# MySQL → SQLite Migration Plan

## Context

The server currently requires a running MySQL 8 instance, which creates friction for local development and adds a separate service in Docker. SQLite eliminates the external DB dependency — it's a single file, zero-config, and created automatically on first boot. This makes the server self-contained: `yarn dev` just works without Docker or a MySQL install.

The DB layer is already well-isolated behind three helper functions (`query`, `queryOne`, `queryUpdate`) in a single file. All tests mock that file entirely, so no test changes are needed.

## Shape of the Change

```
src/db/connection.ts        ← full rewrite (mysql2 pool → better-sqlite3, inline schema init)
src/db/account.ts           ← one SQL change (ON DUPLICATE KEY → ON CONFLICT)
src/db/battles.ts           ← two SQL changes (NOW() → datetime('now'), VALUES() → excluded.)
src/db/schema.sql           ← MySQL DDL → SQLite DDL
.env.example                ← DB_HOST/PORT/USER/PASSWORD/NAME → DB_PATH
docker-compose.yml          ← remove db service, add db volume
Dockerfile                  ← add native build tools for better-sqlite3
```

All callers of `query`/`queryOne`/`queryUpdate` are **unchanged** — the async interface stays identical.

## Step-by-Step Implementation

### 1. Swap packages (`package.json`)

Remove `mysql2` from dependencies. Add:
- `better-sqlite3` (runtime dependency)
- `@types/better-sqlite3` (dev dependency)

`better-sqlite3` is a synchronous native module. The async wrappers in `connection.ts` preserve the existing `await`-able interface.

### 2. Rewrite `src/db/connection.ts`

Replace the entire file:

```typescript
import Database from "better-sqlite3";
import { config } from "dotenv";
import { mkdirSync } from "fs";
import path from "path";

config();

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), "data", "bsf.db");
mkdirSync(path.dirname(dbPath), { recursive: true });  // ensure parent dir exists

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");  // WAL: better concurrent read/write behaviour

// Schema init is idempotent (all CREATE TABLE/INDEX use IF NOT EXISTS).
// Runs on every startup — no separate schema migration step needed.
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    user_id             TEXT    NOT NULL,
    username            TEXT    NOT NULL,
    renown              INTEGER NOT NULL DEFAULT 0,
    daily_login_streak  INTEGER NOT NULL DEFAULT 1,
    login_count         INTEGER NOT NULL DEFAULT 1,
    completed_tutorial  INTEGER NOT NULL DEFAULT 1,
    roster_rows         INTEGER NOT NULL DEFAULT 1,
    roster_json         TEXT    NOT NULL,
    party_ids_json      TEXT    NOT NULL,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id)
  );
  CREATE TABLE IF NOT EXISTS battles (
    battle_id       TEXT    NOT NULL,
    type            TEXT    NOT NULL,
    winner_user_id  TEXT,
    loser_user_id   TEXT,
    renown_awarded  INTEGER NOT NULL DEFAULT 0,
    started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT,
    PRIMARY KEY (battle_id)
  );
  CREATE INDEX IF NOT EXISTS idx_winner ON battles (winner_user_id);
  CREATE INDEX IF NOT EXISTS idx_loser  ON battles (loser_user_id);
`);

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
    return db.prepare(sql).all(...(params ?? [])) as T[];
}

export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
    const row = db.prepare(sql).get(...(params ?? []));
    return (row as T) ?? null;
}

export async function queryUpdate(sql: string, params?: any[]): Promise<number> {
    const result = db.prepare(sql).run(...(params ?? []));
    return result.changes;
}
```

Key decisions:
- `user_id` stored as **TEXT** to preserve full 64-bit Steam ID precision. All callers already pass `String(user_id)` as the query parameter — no caller changes needed.
- Schema embedded directly in `connection.ts` so the DB bootstraps itself. `schema.sql` remains as reference DDL.
- Remove the `DB_PORT` numeric validation that exists in current `connection.ts` — it's no longer relevant.

### 3. Update `src/db/schema.sql`

Rewrite as SQLite DDL (mirrors what's in `connection.ts` above). The file is now documentation / for reference — the actual init runs from `connection.ts`.

Key type mappings from MySQL:
| MySQL | SQLite |
|-------|--------|
| `BIGINT UNSIGNED` | `TEXT` (user_id) or `INTEGER` (renown, counts) |
| `VARCHAR(n)` | `TEXT` |
| `JSON` | `TEXT` |
| `TINYINT(1)` | `INTEGER` |
| `TIMESTAMP … ON UPDATE CURRENT_TIMESTAMP` | `TEXT DEFAULT (datetime('now'))` + no trigger |
| `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` | (remove) |
| Inline `INDEX` in `CREATE TABLE` | Separate `CREATE INDEX IF NOT EXISTS` |

### 4. Update `src/db/account.ts` — one line change

In `upsertAccount()` (line 55):

```sql
-- Before (MySQL):
ON DUPLICATE KEY UPDATE login_count = login_count + 1

-- After (SQLite):
ON CONFLICT(user_id) DO UPDATE SET login_count = login_count + 1
```

No other changes needed. `parseRow` already handles TEXT/string JSON columns — SQLite TEXT columns return strings just like MySQL does for JSON columns, so `typeof raw.roster_json === "string"` continues to work.

### 5. Update `src/db/battles.ts` — three changes

In `saveBattleResult()`:

```sql
-- Before (MySQL):
INSERT INTO battles (battle_id, type, winner_user_id, loser_user_id, renown_awarded, started_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?, NOW())
ON DUPLICATE KEY UPDATE
  winner_user_id  = VALUES(winner_user_id),
  loser_user_id   = VALUES(loser_user_id),
  renown_awarded  = VALUES(renown_awarded),
  finished_at     = NOW()

-- After (SQLite):
INSERT INTO battles (battle_id, type, winner_user_id, loser_user_id, renown_awarded, started_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT(battle_id) DO UPDATE SET
  winner_user_id  = excluded.winner_user_id,
  loser_user_id   = excluded.loser_user_id,
  renown_awarded  = excluded.renown_awarded,
  finished_at     = datetime('now')
```

Also convert the `started_at: Date` parameter before passing to query:
```typescript
// Change the params array entry from:
started_at
// To:
started_at.toISOString()
```
Reason: better-sqlite3 does not auto-convert Date objects; they must be strings.

### 6. Update `.env.example`

```
# SQLite database file path (created automatically if it doesn't exist)
DB_PATH=./data/bsf.db

# REQUIRED
JWT_SECRET=replace-with-a-strong-random-secret

# Optional — Discord OAuth
DISCORD_CLIENT_ID=your_discord_app_client_id
DISCORD_CLIENT_SECRET=your_discord_app_client_secret
DISCORD_REDIRECT_URI=http://localhost:8082/login/discord/oauth-callback
```

### 7. Update `docker-compose.yml`

Remove the `db` MySQL service entirely. Add a named volume for the SQLite file, mounted at a path separate from `/app/data` (to avoid shadowing static data files):

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

The `DB_PATH` env override points the DB into the mounted volume so it persists across container restarts. `mkdirSync(..., { recursive: true })` in `connection.ts` ensures `/app/db` is created if the volume is empty.

### 8. Update `Dockerfile` — add native build tools

`better-sqlite3` has C++ bindings. The Alpine `build_env` stage needs build tools:

```dockerfile
FROM node:22-alpine as build_env
WORKDIR /src
RUN apk add --no-cache python3 make g++   # ← add this line
COPY . .
RUN yarn install --frozen-lockfile && yarn cache clean
RUN yarn run build
```

The `runtime_env` stage also needs runtime C++ libs. Add `libstdc++`:

```dockerfile
FROM node:22-alpine as runtime_env
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache libstdc++          # ← add this line
COPY --from=build_env /src/build ./
COPY --from=build_env /src/data ./data
COPY --from=build_env /src/package.json ./
COPY --from=build_env /src/yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean
EXPOSE 8082
CMD ["node", "./index.js"]
```

The production `yarn install` will recompile `better-sqlite3` for the Alpine target using the installed libstdc++.

## Files NOT Changed

- `src/db/account.test.ts` — tests `parseRow` only, no DB connection
- `test/setup.ts` — mocks `src/db/connection` entirely; all 50 tests pass unchanged
- All route handlers and services — `query`/`queryOne`/`queryUpdate` interface is identical
- `src/app.ts` — the `DB_PORT` check was in `connection.ts`, not `app.ts`; `app.ts` only checks `JWT_SECRET`

## Verification

1. `yarn build` — TypeScript compiles (new types from `@types/better-sqlite3`)
2. `yarn test` — all 50 tests pass (DB is mocked, no real SQLite connection)
3. Start the server: `yarn dev` — confirm no errors, `data/bsf.db` appears on disk
4. Run `test-2p-match.bat` smoke test — login → queue → match; verify `bsf.db` has rows in both `accounts` and `battles`
5. Use `sqlite3 data/bsf.db .tables` to inspect the live DB interactively