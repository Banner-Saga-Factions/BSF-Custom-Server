-- 005_activity_totals.sql
--
-- Two changes for #267, so we can tell whether anything we try brings players back:
--   1. Create the `activity_hourly` table -- one row of totals for each hour, in UTC.
--   2. Add `last_sign_in_at` to `accounts`, and date the accounts that already exist.
--
-- Totals only. No row in `activity_hourly` names a player. Each count is added to what
-- its row already holds, and `peak_online` keeps the highest sample of its hour, so a
-- restart or a deploy never resets an hour. src/db/activity.ts does all of the writing.
--
-- `hour` is written in exactly the form SQLite's own datetime() gives, such as
-- '2026-09-16 13:00:00', so it can be compared with datetime('now', '-7 days') directly.
--
-- `last_sign_in_at` is in milliseconds, like battle.battle_create_time, and is set at each
-- sign-in. A sign-in with no earlier date on record counts as a brand-new player, so every
-- account that already exists is dated 24 hours before this migration ran. Left empty,
-- each existing player's next visit would count as new, which would look exactly like a
-- recruitment success that never happened. The price: for 13 days after this runs, no
-- account that already existed can count as returning after 14 days away. That errs
-- towards never claiming a comeback that did not happen.
--
-- No BEGIN/COMMIT here -- src/db/migrations.ts wraps each file in a transaction.

CREATE TABLE IF NOT EXISTS activity_hourly (
    hour                TEXT    NOT NULL PRIMARY KEY,
    sign_ins            INTEGER NOT NULL DEFAULT 0,
    daily_players       INTEGER NOT NULL DEFAULT 0,
    new_players         INTEGER NOT NULL DEFAULT 0,
    returning_players   INTEGER NOT NULL DEFAULT 0,
    find_match_joins    INTEGER NOT NULL DEFAULT 0,
    challenge_joins     INTEGER NOT NULL DEFAULT 0,
    find_match_matched  INTEGER NOT NULL DEFAULT 0,
    challenge_matched   INTEGER NOT NULL DEFAULT 0,
    search_timeouts     INTEGER NOT NULL DEFAULT 0,
    peak_online         INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE accounts ADD COLUMN last_sign_in_at INTEGER;

-- Only empty dates are filled, so running this file again by hand cannot overwrite real ones.
UPDATE accounts
   SET last_sign_in_at = (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
 WHERE last_sign_in_at IS NULL;
