// DB helpers for the `ranking` table. Pure Elo math lives in
// src/services/battle/ranking.ts; this module is persistence only.

import { query, queryOne } from "./connection";
import { ELO_BEGIN } from "../services/battle/ranking";

export type RankingRow = {
    account_id: number;
    tourney_id: number;
    battle_wins: number;
    battle_losses: number;
    battle_elo: number;
    win_streak: number;
    best_win_streak: number;
    friend_battles: number;
};

// INSERT OR IGNORE a default row, then SELECT it. Falls back to a default
// object if the SELECT returns null — covers the test/setup.ts global mock
// where queryOne always returns null.
export async function getOrCreateRanking(
    account_id: number,
    tourney_id: number,
): Promise<RankingRow> {
    await query(
        `INSERT OR IGNORE INTO ranking (account_id, tourney_id, battle_elo)
         VALUES (?, ?, ?)`,
        [account_id, tourney_id, ELO_BEGIN],
    );
    const row = await queryOne<RankingRow>(
        `SELECT account_id, tourney_id, battle_wins, battle_losses, battle_elo,
                win_streak, best_win_streak, friend_battles
         FROM ranking WHERE account_id = ? AND tourney_id = ?`,
        [account_id, tourney_id],
    );
    return (
        row ?? {
            account_id,
            tourney_id,
            battle_wins: 0,
            battle_losses: 0,
            battle_elo: ELO_BEGIN,
            win_streak: 0,
            best_win_streak: 0,
            friend_battles: 0,
        }
    );
}

export type RankingUpdate = {
    account_id: number;
    tourney_id: number;
    new_elo: number;
    won: boolean;
};

// One UPDATE per side. Mirrors the original Java BattleRanking
// incrementWins (win_streak = max(1, win_streak + 1)) and incrementLosses
// (win_streak = min(-1, win_streak - 1)) so the streak flips sign on each
// result change.
export async function applyBattleRankingUpdate(u: RankingUpdate): Promise<void> {
    if (u.won) {
        await query(
            `UPDATE ranking
             SET battle_wins = battle_wins + 1,
                 battle_elo  = ?,
                 win_streak  = MAX(1, win_streak + 1)
             WHERE account_id = ? AND tourney_id = ?`,
            [u.new_elo, u.account_id, u.tourney_id],
        );
    } else {
        await query(
            `UPDATE ranking
             SET battle_losses = battle_losses + 1,
                 battle_elo    = ?,
                 win_streak    = MIN(-1, win_streak - 1)
             WHERE account_id = ? AND tourney_id = ?`,
            [u.new_elo, u.account_id, u.tourney_id],
        );
    }
}
