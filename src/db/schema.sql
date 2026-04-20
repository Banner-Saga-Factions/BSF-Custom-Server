-- BSF Custom Server — Database Schema
-- Run against a fresh MySQL database: mysql -u root -p bsf < schema.sql
-- Create the database first: CREATE DATABASE bsf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
    user_id     BIGINT UNSIGNED NOT NULL,
    username    VARCHAR(64)     NOT NULL,
    renown      INT             NOT NULL DEFAULT 0,
    daily_login_streak INT      NOT NULL DEFAULT 1,
    -- Fix #11: DEFAULT 1 so first login records login_count=1, not 0
    login_count INT             NOT NULL DEFAULT 1,
    completed_tutorial TINYINT(1) NOT NULL DEFAULT 1,
    roster_rows INT             NOT NULL DEFAULT 1,
    -- roster.defs array serialized as JSON
    roster_json JSON            NOT NULL,
    -- party.ids array serialized as JSON
    party_ids_json JSON         NOT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fix #18: VARCHAR(20) matches generateBattleId() output (crypto.randomBytes(10).toString("hex") = 20 chars)
-- Fix #12: No FK to accounts intentionally — battle records are retained for history even if accounts change
CREATE TABLE IF NOT EXISTS battles (
    battle_id       VARCHAR(20)     NOT NULL,
    type            VARCHAR(10)     NOT NULL,   -- QUICK | RANKED | TOURNEY
    winner_user_id  BIGINT UNSIGNED,
    loser_user_id   BIGINT UNSIGNED,
    renown_awarded  INT             NOT NULL DEFAULT 0,
    started_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at     TIMESTAMP       NULL,
    PRIMARY KEY (battle_id),
    INDEX idx_winner (winner_user_id),
    INDEX idx_loser  (loser_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Accounts are seeded automatically on first login via upsertAccount() in src/db/account.ts.
-- No manual INSERT needed here; the server handles it.
