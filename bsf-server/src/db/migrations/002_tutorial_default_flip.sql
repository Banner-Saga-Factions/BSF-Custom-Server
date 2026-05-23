-- Flip completed_tutorial default from 1 to 0 (post-M3a).
-- Existing accounts keep their current value; only new accounts get the new default,
-- so we can distinguish fresh accounts from returning players.
--
-- SQLite can't reliably ALTER COLUMN SET DEFAULT across versions, so we rebuild
-- the table. The new table mirrors the inline CREATE in connection.ts exactly,
-- except for the completed_tutorial DEFAULT.
--
-- Explicit column list in the INSERT (not SELECT *) so the migration is robust
-- against future column reorderings in connection.ts.

CREATE TABLE accounts_new (
    user_id             TEXT    NOT NULL PRIMARY KEY,
    username            TEXT    NOT NULL,
    renown              INTEGER NOT NULL DEFAULT 0,
    daily_login_streak  INTEGER NOT NULL DEFAULT 1,
    login_count         INTEGER NOT NULL DEFAULT 1,
    completed_tutorial  INTEGER NOT NULL DEFAULT 0,
    roster_rows         INTEGER NOT NULL DEFAULT 1,
    roster_json         TEXT    NOT NULL DEFAULT '[]',
    party_ids_json      TEXT    NOT NULL DEFAULT '[]',
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO accounts_new (
    user_id, username, renown, daily_login_streak, login_count,
    completed_tutorial, roster_rows, roster_json, party_ids_json,
    created_at, updated_at
)
SELECT
    user_id, username, renown, daily_login_streak, login_count,
    completed_tutorial, roster_rows, roster_json, party_ids_json,
    created_at, updated_at
FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;
