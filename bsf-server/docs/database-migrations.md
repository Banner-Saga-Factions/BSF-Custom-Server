# Database Migration Guide

How to change the SQLite schema safely. Read this **before** writing your first migration — a malformed one aborts server startup for everyone, and migrations are append-only so a mistake can't be quietly edited away once shipped.

For the resulting tables and columns, see [`database-schema.md`](./database-schema.md). The agent-facing short rules live in `.claude/rules/db.md`; this is the human-facing version with the full reasoning.

## How the system works

Two things build the schema on startup, in order (`src/db/connection.ts`):

1. **Inline base** — `connection.ts` runs `CREATE TABLE IF NOT EXISTS` for the original `accounts` and legacy `battles` tables. This only does work on a **brand-new** database; on an existing one the tables already exist and the statement no-ops.
2. **File-based migrations** — `runMigrations()` (`src/db/migrations.ts`) then walks `src/db/migrations/*.sql` and applies each file whose version hasn't been recorded yet.

Because the inline `IF NOT EXISTS` no-ops on existing installs, **migrations are the only thing that changes the schema on a database that already exists.** Every schema change ships as a migration.

The runner:
- Ensures a `schema_version` table exists.
- Lists files matching `^\d+_.+\.sql$`, sorted (so numeric prefixes apply in order).
- Skips any whose number is already in `schema_version`.
- For each remaining file: wraps it in `BEGIN` … `COMMIT`, runs the SQL, records the version. On any error it `ROLLBACK`s and **throws — aborting startup**. A half-applied migration never persists.

## When to add a migration

Add a `NNN_*.sql` file whenever you:
- create a new table or index,
- add/rename/drop a column,
- change a column's type, default, or constraints,
- seed or backfill rows that must exist on every install.

If you also changed a table that's defined **inline** in `connection.ts` (`accounts`, `battles`), update the inline DDL **and** ship a migration — otherwise fresh installs get the new shape while existing installs don't. Keep the two in sync.

## The rules

1. **Naming: `NNN_short_description.sql`.** Zero-padded numeric prefix, then a snake_case description (e.g. `003_add_friends_table.sql`). Files apply in sorted order, so the prefix is the ordering. Use the next free number.
2. **Append-only — never edit an applied migration.** Once a file has shipped (its version may already be recorded in someone's `schema_version`), editing it won't re-run it and the change is lost. Fix forward with a new migration.
3. **No `BEGIN` / `COMMIT` inside the file.** The runner already wraps each migration in a transaction. A nested `BEGIN` makes SQLite throw *"cannot start a transaction within a transaction"*, and the runner aborts startup. Write the DDL/DML statements directly; the runner owns the transaction boundary and the rollback-on-error.
4. **Still write idempotent SQL.** `schema_version` already prevents re-running, but use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `INSERT OR IGNORE`, etc. anyway. It's cheap insurance and keeps a migration safe to re-run by hand during development.
5. **SQLite syntax, not MySQL.** The original Java server's `INT UNSIGNED`, `ALTER TABLE … ADD UNIQUE KEY`, `ENGINE=InnoDB`, etc. do **not** work. Use SQLite types (`INTEGER`, `TEXT`, `REAL`) and SQLite DDL.
6. **Changing a column default/type needs a table rebuild.** SQLite can't reliably `ALTER COLUMN … SET DEFAULT`. Follow the pattern in `002_tutorial_default_flip.sql`: `CREATE TABLE x_new (…)` mirroring the inline shape with your change, `INSERT INTO x_new (explicit, column, list) SELECT … FROM x`, `DROP TABLE x`, `ALTER TABLE x_new RENAME TO x`. Use an **explicit column list** (not `SELECT *`) so the migration survives future column reorderings.

## The build step

`tsc` only compiles `.ts → .js`; it ignores `.sql` files. So `scripts/copy-migrations.js` (run automatically by `yarn build`) copies `src/db/migrations/*.sql` into `build/db/migrations/`. The runner's `findMigrationsDir()` resolves to `src/db/migrations` under `ts-node-dev` (dev) and `build/db/migrations` in production — both work as long as the copy ran.

The copy script has an `existsSync` guard: if the source dir is missing it prints a warning and exits `0` rather than failing the build. **Practical consequence:** if you add a `.sql` file but run the old compiled server without rebuilding, the new migration won't be in `build/` and won't apply. Always `yarn build` (or use `start-server.bat`, which builds first) after adding one.

## Testing a migration

The server reads `DB_PATH`; point it at an in-memory database to test against a clean schema each run:

- **Automated:** the test suite runs with `DB_PATH=:memory:`, so `runMigrations` executes against a fresh in-memory DB on every boot — a broken migration fails the suite immediately. Run `yarn test`.
- **Manual:** `yarn build` (copies the SQL), then start the server. Watch the log for `[DB] applied migration NNN_*.sql`. Confirm with:
  ```bash
  sqlite3 data/bsf.db "SELECT * FROM schema_version;"
  sqlite3 data/bsf.db ".schema your_new_table"
  ```
  A failed migration prints `[DB] migration NNN_*.sql failed: …` and the server refuses to start — that's the intended safety behavior.

## Worked example — add a new table

To add a `friends` table (the kind of change #91 will make):

1. Create `src/db/migrations/003_add_friends_table.sql`:
   ```sql
   -- 003_add_friends_table.sql
   -- Friend relationships. account_id is the 32-bit in-game id (see database-schema.md).
   CREATE TABLE IF NOT EXISTS friends (
       account_id        INTEGER NOT NULL,
       friend_account_id INTEGER NOT NULL,
       created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (account_id, friend_account_id)
   );
   ```
   No `BEGIN`/`COMMIT`; `IF NOT EXISTS` for idempotency; SQLite types only.
2. Add the table's section to [`database-schema.md`](./database-schema.md) and its ER entry.
3. `yarn build` then `yarn test` — confirm the suite passes against `:memory:` and the log shows the migration applied.
4. Add the reader/writer helpers in `src/db/` (using the `query`/`queryOne`/`queryUpdate` helpers from `connection.ts` — never `new DatabaseSync` directly).

---

*Last updated: 2026-06-19. Runner: `src/db/migrations.ts`. Build copy: `scripts/copy-migrations.js`. Short rules: `.claude/rules/db.md`.*
