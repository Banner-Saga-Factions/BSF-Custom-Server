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
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(battle_id) DO UPDATE SET
           winner_user_id  = excluded.winner_user_id,
           loser_user_id   = excluded.loser_user_id,
           renown_awarded  = excluded.renown_awarded,
           finished_at     = datetime('now')`,
        [battle_id, type, winner_user_id, loser_user_id, renown_awarded, started_at.toISOString()]
    );
}
