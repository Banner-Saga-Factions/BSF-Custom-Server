# `src/db/` — Saving data to disk

This folder is how the server remembers things between restarts. It uses
**SQLite** — a lightweight database that lives entirely in one file
(`data/bsf.db`), so there's nothing to install or configure. When the server
starts it creates the tables it needs and applies any later changes to the table
layout (the database's **schema**) in order, so there's no manual setup step. Anything that has to survive a restart —
accounts, rosters, battle results, rankings — is stored here. The exact tables
and columns are listed in [`database-schema.md`](../../docs/database-schema.md).

| File | Role |
|---|---|
| `connection.ts` | Opens the database file, turns on a faster write mode (WAL), creates the base tables, runs the schema-change files, and provides the small set of helpers (`query`, `queryOne`, `queryUpdate`) that every other file uses to read and write. |
| `migrations.ts` | Runs the numbered `.sql` files in `migrations/` in order, skipping any it has already applied (it remembers them in a `schema_version` table). Each file runs as one all-or-nothing step. |
| `migrations/001_ranking_and_battle.sql` | Adds the `ranking` and `battle` tables. |
| `migrations/002_tutorial_default_flip.sql` | Makes new accounts start with the tutorial not-yet-done. |
| `migrations/003_leaderboard_index_and_drop_legacy_battles.sql` | Speeds up the leaderboard (indexes rankings by ladder) and drops the old unused `battles` table. |
| `migrations/004_unlocks.sql` | Adds the `unlocks` table: what a player owns that is not a unit. |
| `migrations/005_activity_totals.sql` | Adds `activity_hourly` (player numbers, one row per hour) and each account's last sign-in time. |
| `account.ts` | Reads and writes account rows: create-or-update on login, add renown, save party, save roster, expand the barracks, mark the tutorial complete. |
| `unlocks.ts` | Reads and grants a player's unlocks. |
| `activity.ts` | Adds to the hourly player numbers and reads them back, and reads and writes each account's last sign-in time. Kept apart from `account.ts` on purpose — see the comment at its top. |
| `ranking.ts` | Reads/creates a player's ranking row and updates it after a battle (Elo rating, win/loss, streak). |
| `battles.ts` | `saveBattle()` — records one finished battle to the `battle` table. |
| `leaderboard.ts` | Builds the `/game/leaderboards` list from live rankings, laid over the historical `data/lboard.json` names. |
| `schema.sql` | A written-out copy of the `accounts` table — **reference only**; the real setup happens inside `connection.ts`. |
| `*.test.ts` | `account.test`, `activity.integration.test`, `connection.test`, `leaderboard.test`, `migrations.test`, `unlocks.test`, `unlocks.integration.test`. The `integration` ones run against a real in-memory database instead of the stand-in the rest of the suite uses. |

**More detail:** [`database-schema.md`](../../docs/database-schema.md) (every table + a diagram) · [`database-migrations.md`](../../docs/database-migrations.md) (how to add a schema change) · [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md#database-layer). Coding rules for this folder: [`.claude/rules/db.md`](../../.claude/rules/db.md).

**Gotchas** (fuller explanations in the docs above):

- Always read and write through the `query` helpers — don't open the database directly anywhere except `connection.ts`.
- During a logged-in session, `session.accountData` in memory is the source of truth. Update it directly; don't re-read the database to refresh it.
- Changes to the tables and columns (schema changes) are **add-only**: write a new numbered file, never edit one that already ran, and don't put your own `BEGIN`/`COMMIT` inside it (the runner already does that).
- Only the "expand barracks" and "create-or-update account" steps may change `roster_rows` (the number of barracks rows on screen) — the roster-saving helpers must never touch it.
