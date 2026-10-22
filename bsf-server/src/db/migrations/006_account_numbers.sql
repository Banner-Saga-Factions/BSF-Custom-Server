-- 006_account_numbers.sql
--
-- Stored player numbers (#140, #159, #375). Every player's small in-game number
-- (account_id) is handed out once, at first sight, and kept here, instead of being
-- worked out again from their Steam or Discord id at every sign-in. Working it out
-- let two different ids land on one number (#140) and made the leaderboard guess
-- wrong for Discord players (#159).
--
-- external_id is the same text as accounts.user_id. provider says which sign-in route
-- owns that text, so the other route cannot open the account (#375). account_id is
-- UNIQUE: no two players can ever hold one number.
--
-- Existing accounts are filled in by src/db/accountNumberSeed.ts at start-up, not
-- here: the Steam rule's rounding can only be reproduced in JavaScript.

CREATE TABLE IF NOT EXISTS account_numbers (
    external_id TEXT    NOT NULL PRIMARY KEY,
    provider    TEXT    NOT NULL CHECK (provider IN ('steam', 'discord')),
    account_id  INTEGER NOT NULL UNIQUE CHECK (account_id > 0),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
