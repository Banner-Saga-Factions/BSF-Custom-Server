import { query } from "./connection";

export async function saveBattleResult(
    battle_id: string,
    type: string,
    winner_user_id: number,
    loser_user_id: number,
    renown_awarded: number,
    started_at: Date
): Promise<void> {
    await query(
        `INSERT INTO battles (battle_id, type, winner_user_id, loser_user_id, renown_awarded, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           winner_user_id  = VALUES(winner_user_id),
           loser_user_id   = VALUES(loser_user_id),
           renown_awarded  = VALUES(renown_awarded),
           finished_at     = NOW()`,
        [battle_id, type, winner_user_id, loser_user_id, renown_awarded, started_at]
    );
}
