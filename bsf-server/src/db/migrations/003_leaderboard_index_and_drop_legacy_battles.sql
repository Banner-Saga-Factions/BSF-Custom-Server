-- 003_leaderboard_index_and_drop_legacy_battles.sql
--
-- Two changes for #145:
--   1. Index ranking(tourney_id) so the leaderboard read
--      (SELECT ... FROM ranking WHERE tourney_id = ?, src/db/leaderboard.ts)
--      looks up one ladder's rows directly instead of scanning the whole table.
--      ranking's only existing index is its composite PK (account_id, tourney_id);
--      tourney_id is not a usable left-prefix of it.
--   2. Drop the legacy `battles` table and its idx_winner/idx_loser indexes. Its
--      writer (saveBattleResult) was removed in #43; the richer `battle` table
--      (migration 001) replaced it, and nothing has read or written it since.
--
-- Note: this is the first migration that *removes* data. A successful DROP is
-- committed and irreversible (the runner's transaction only rolls back on
-- failure); a cautious operator can snapshot data/bsf.db before the first restart
-- on this version. The `battles` rows are dead pre-M1 data no code reads.
--
-- No BEGIN/COMMIT here -- src/db/migrations.ts wraps each file in a transaction.

CREATE INDEX IF NOT EXISTS idx_ranking_tourney ON ranking(tourney_id);
DROP INDEX IF EXISTS idx_winner;
DROP INDEX IF EXISTS idx_loser;
DROP TABLE IF EXISTS battles;
