-- 004_unlocks.sql
--
-- One change for #98:
--   1. Create the `unlocks` table -- a per-account record of what a player owns
--      that is not a unit: alternate unit colours, and (once it is built) the
--      BOOST renown bonus. Ported from the original server's db/game/58/apply.sql,
--      with two deliberate differences noted below.
--
-- Why a table when every colour is free. The twelve colour unlocks are granted to
-- everyone from one list in src/const.ts, so they are a rule rather than data and
-- no rows are written for them. This table holds what an individual account
-- actually earns or buys, and its first real user is the deferred BOOST award,
-- which needs exactly "does this account hold bst_renown?" and nothing more.
-- It is therefore empty on a fresh install, on purpose.
--
-- Two divergences from the original, both to match this server rather than that one:
--   * The key is `user_id` TEXT -- the full provider id string, the same key the
--     `accounts` table uses -- not the original's BIGINT account_id. The 32-bit
--     account id appears only on the wire, built at response time.
--   * `unlock_id` is not length-capped. The original used VARCHAR(32); SQLite
--     would ignore the limit anyway, so declaring it would be decorative.
--
-- No index beyond the primary key. (user_id, unlock_id) already serves both reads:
-- "every unlock this player holds" is its left prefix, and "does this player hold
-- one particular unlock" is the whole key. Migration 003 exists because that
-- left-prefix rule was missed once already.
--
-- No BEGIN/COMMIT here -- src/db/migrations.ts wraps each file in a transaction.

CREATE TABLE IF NOT EXISTS unlocks (
    user_id         TEXT    NOT NULL,
    unlock_id       TEXT    NOT NULL,
    unlock_time     INTEGER NOT NULL DEFAULT 0,
    unlock_duration INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, unlock_id)
);
