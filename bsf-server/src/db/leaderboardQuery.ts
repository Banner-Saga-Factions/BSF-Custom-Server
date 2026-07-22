// Single source of truth for the leaderboard's per-ladder ranking read.
//
// buildLeaderboards() (leaderboard.ts) runs this exact string, and
// migrations.test.ts EXPLAINs it to prove the read still uses idx_ranking_tourney
// (#145). If the query is ever reshaped so the index no longer applies, the
// migration test catches it here instead of passing on a stale copy.
//
// Kept dependency-free (no ./connection import) so the migration test can import it
// without dragging in the globally-mocked connection module or a data-file read.
export const LEADERBOARD_RANKING_QUERY =
    "SELECT account_id, battle_elo, battle_wins, battle_losses, win_streak, best_win_streak " +
    "FROM ranking WHERE tourney_id = ?";
