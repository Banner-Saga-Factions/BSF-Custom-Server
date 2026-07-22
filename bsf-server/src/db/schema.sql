-- BSF Custom Server — SQLite Database Schema
-- Documentation only: schema is initialized automatically by src/db/connection.ts on server startup.
-- No manual import needed.
--
-- This file lists the fresh-install base only (the accounts table). The
-- ranking, battle, and schema_version tables -- and every schema change after
-- the base, including the migration-003 drop of the legacy battles table --
-- live in src/db/migrations/NNN_*.sql.

CREATE TABLE IF NOT EXISTS accounts (
    user_id             TEXT    NOT NULL PRIMARY KEY,
    username            TEXT    NOT NULL,
    renown              INTEGER NOT NULL DEFAULT 0,
    daily_login_streak  INTEGER NOT NULL DEFAULT 1,
    login_count         INTEGER NOT NULL DEFAULT 1,
    completed_tutorial  INTEGER NOT NULL DEFAULT 1,
    roster_rows         INTEGER NOT NULL DEFAULT 1,
    roster_json         TEXT    NOT NULL DEFAULT '[]',
    party_ids_json      TEXT    NOT NULL DEFAULT '[]',
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
