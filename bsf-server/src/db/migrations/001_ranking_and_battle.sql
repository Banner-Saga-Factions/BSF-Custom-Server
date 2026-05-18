-- 001_ranking_and_battle.sql
--
-- Ports the original 2013 Java server's `ranking` (schema 4) and `battle`
-- (schema 5) tables. MySQL syntax translated to SQLite. account_id is the
-- 32-bit value (Steam ID minus base), per the project gotcha.
--
-- Source:
--   bsf-refs/server-2013-java/db/game/4/apply.sql   (ranking)
--   bsf-refs/server-2013-java/db/game/5/apply.sql   (battle)
-- Plus the columns BattleRanking.java save() actually writes, and BSF
-- additions for leaderboards and replay parity.

CREATE TABLE IF NOT EXISTS ranking (
    account_id      INTEGER NOT NULL,
    tourney_id      INTEGER NOT NULL DEFAULT 0,
    battle_wins     INTEGER NOT NULL DEFAULT 0,
    battle_losses   INTEGER NOT NULL DEFAULT 0,
    battle_elo      INTEGER NOT NULL DEFAULT 1000,
    win_streak      INTEGER NOT NULL DEFAULT 0,
    best_win_streak INTEGER NOT NULL DEFAULT 0,
    friend_battles  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, tourney_id)
);

CREATE TABLE IF NOT EXISTS battle (
    battle_id            TEXT    NOT NULL PRIMARY KEY,
    battle_type          TEXT    NOT NULL,
    battle_scene         TEXT,
    battle_create_time   INTEGER NOT NULL,
    battle_end_time      INTEGER,
    battle_victor_team   TEXT,
    battle_surrender     INTEGER NOT NULL DEFAULT 0,
    battle_turns         INTEGER,
    battle_aborted       INTEGER NOT NULL DEFAULT 0,
    battle_renown        INTEGER NOT NULL DEFAULT 0,
    winner_account_id    INTEGER,
    loser_account_id     INTEGER,
    winner_renown        INTEGER NOT NULL DEFAULT 0,
    loser_renown         INTEGER NOT NULL DEFAULT 0,
    winner_kills         INTEGER NOT NULL DEFAULT 0,
    loser_kills          INTEGER NOT NULL DEFAULT 0,
    winner_elo_before    INTEGER,
    winner_elo_after     INTEGER,
    loser_elo_before     INTEGER,
    loser_elo_after      INTEGER,
    parties_json         TEXT
);

CREATE INDEX IF NOT EXISTS idx_battle_winner ON battle(winner_account_id);
CREATE INDEX IF NOT EXISTS idx_battle_loser  ON battle(loser_account_id);
CREATE INDEX IF NOT EXISTS idx_battle_end    ON battle(battle_end_time);
