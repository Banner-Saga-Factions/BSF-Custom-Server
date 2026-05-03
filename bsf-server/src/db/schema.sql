-- BSF Custom Server — SQLite Database Schema
-- Documentation only: schema is initialized automatically by src/db/connection.ts on server startup.
-- No manual import needed.

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

CREATE TABLE IF NOT EXISTS battles (
    battle_id       TEXT    NOT NULL PRIMARY KEY,
    type            TEXT    NOT NULL,
    winner_user_id  INTEGER,
    loser_user_id   INTEGER,
    renown_awarded  INTEGER NOT NULL DEFAULT 0,
    started_at      TEXT    NOT NULL,
    finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_winner ON battles(winner_user_id);
CREATE INDEX IF NOT EXISTS idx_loser  ON battles(loser_user_id);
