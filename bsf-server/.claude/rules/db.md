---
paths:
  - "src/db/**"
---

# Database Rules

- Always use the `query<T>()` or `queryOne<T>()` helpers from `src/db/connection.ts`. Never reach for `new DatabaseSync(...)` directly outside that module.
- `session.accountData` is the **in-memory source of truth** for the session lifetime. Update it immediately after any write — do not re-query the DB to refresh it.
- DB writes in endgame (`addRenown` × 2, `applyBattleRankingUpdate` × 2, `saveBattle`) all live inside one `Promise.all`. The `.then()` pushes `BattleFinishedData` + `RenownMessage` only after every write resolves, so the client never sees inflated totals without a backing row. If any write rejects, the `.catch()` falls back to a `BattleFinishedData` with `total_renown=0` and a chat message asking the player to report. Do not change this ordering — it's the post-blocker-#2 contract.
- Schema changes belong in `src/db/migrations/NNN_*.sql` (SQLite syntax, **not** MySQL — the original Java server's `INT UNSIGNED`, `ALTER TABLE ADD UNIQUE KEY`, etc. won't work). The runner in `src/db/migrations.ts` applies new files in numeric order on startup and records them in `schema_version`. Migrations are append-only — never edit an applied file.
- Migration `.sql` files must NOT contain their own `BEGIN TRANSACTION` / `COMMIT` — `src/db/migrations.ts` already wraps each file in a transaction. A nested `BEGIN` makes SQLite throw "cannot start a transaction within a transaction" and the runner aborts startup. Write the DDL/DML statements directly; the runner handles the transaction boundary and rollback-on-error.
- `saveRoster()`, `saveRosterAndSpendRenown()`, and `saveRosterAndParty()` update **only** `roster_json` (and renown/party_ids as applicable). They must **never** touch `roster_rows`. Only `expandBarracks()` and `upsertAccount()` may write `roster_rows` — it is the number of **grid rows** the client renders, not the unit count. Total unit capacity is `roster_rows * UNITS_PER_ROW` (9 slots per row), capped at `MAX_ROSTER_ROWS` (8). Writing the unit count to `roster_rows` silently reverts paid `/roster/unlock` expansions.
- The `accounts` table stores the full provider id (64-bit Steam ID or Discord snowflake) **as a string** in the `user_id` TEXT primary key — kept as text to preserve precision above 2^53. All in-game references use the 32-bit `account_id` (`user_id - 76561197960265728` for Steam users). See [`docs/database-schema.md`](../../docs/database-schema.md) → `accounts`.
