import { query } from "./connection";

// NOTE: the legacy `saveBattleResult()` writer for the thin `battles` table was
// removed (#43). It had no callers since M1 — endgame persists through saveBattle()
// (below) into the richer `battle` table. The old `battles` table is still created
// at startup in connection.ts; dropping it is a separate, later migration (M1
// follow-up), so its CREATE and the `DELETE FROM battles` in connection.test.ts stay
// for now.

export type BattleRow = {
    battle_id: string;
    battle_type: string;
    battle_scene: string | null;
    battle_create_time: number;   // ms since epoch
    battle_end_time: number;      // ms since epoch
    battle_victor_team: string | null;
    battle_surrender: boolean;
    battle_turns: number | null;
    battle_renown: number;
    winner_account_id: number;
    loser_account_id: number;
    winner_renown: number;
    loser_renown: number;
    winner_kills: number;
    loser_kills: number;
    // null when ranking loads failed at endgame — we still record the
    // match (renown, kills, surrender, parties) but skip Elo for this row.
    winner_elo_before: number | null;
    winner_elo_after: number | null;
    loser_elo_before: number | null;
    loser_elo_after: number | null;
    parties_json: string;
};

// Writes one row to the new `battle` table. Idempotent: re-running with
// the same battle_id overwrites the row (covers a retried endgame after a
// transient DB error).
export async function saveBattle(row: BattleRow): Promise<void> {
    await query(
        `INSERT INTO battle (
            battle_id, battle_type, battle_scene,
            battle_create_time, battle_end_time, battle_victor_team,
            battle_surrender, battle_turns, battle_renown,
            winner_account_id, loser_account_id,
            winner_renown, loser_renown,
            winner_kills, loser_kills,
            winner_elo_before, winner_elo_after,
            loser_elo_before, loser_elo_after,
            parties_json
         ) VALUES (
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?
         )
         ON CONFLICT(battle_id) DO UPDATE SET
            battle_type        = excluded.battle_type,
            battle_scene       = excluded.battle_scene,
            battle_end_time    = excluded.battle_end_time,
            battle_victor_team = excluded.battle_victor_team,
            battle_surrender   = excluded.battle_surrender,
            battle_turns       = excluded.battle_turns,
            battle_renown      = excluded.battle_renown,
            winner_account_id  = excluded.winner_account_id,
            loser_account_id   = excluded.loser_account_id,
            winner_renown      = excluded.winner_renown,
            loser_renown       = excluded.loser_renown,
            winner_kills       = excluded.winner_kills,
            loser_kills        = excluded.loser_kills,
            winner_elo_before  = excluded.winner_elo_before,
            winner_elo_after   = excluded.winner_elo_after,
            loser_elo_before   = excluded.loser_elo_before,
            loser_elo_after    = excluded.loser_elo_after,
            parties_json       = excluded.parties_json`,
        [
            row.battle_id, row.battle_type, row.battle_scene,
            row.battle_create_time, row.battle_end_time, row.battle_victor_team,
            row.battle_surrender ? 1 : 0, row.battle_turns, row.battle_renown,
            row.winner_account_id, row.loser_account_id,
            row.winner_renown, row.loser_renown,
            row.winner_kills, row.loser_kills,
            row.winner_elo_before, row.winner_elo_after,
            row.loser_elo_before, row.loser_elo_after,
            row.parties_json,
        ]
    );
}
