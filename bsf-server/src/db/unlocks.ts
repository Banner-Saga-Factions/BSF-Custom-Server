import { query, queryOne } from "./connection";

// Per-account record of what a player owns that is not a unit (#98). See
// src/db/migrations/004_unlocks.sql for why this table exists and why it is empty
// on a fresh install.
//
// The twelve alternate unit colours are NOT stored here -- they are granted to
// everyone from UNIVERSAL_UNLOCK_IDS in src/const.ts, because "everybody gets them"
// is a rule and copying it into twelve rows per account would just be that rule
// written down N times. This table is for what one account specifically holds.
//
// Every function takes the full provider id string (session.external_id_str), the same key
// the accounts table uses -- never the 32-bit account_id. The parameter is typed `string`
// rather than `number | string` on purpose: passing an account_id would match no row and
// return "owns nothing" with no error anywhere, so the compiler holds the rule instead of a
// comment. (db/account.ts accepts both because the leaderboard reads ids back out of a TEXT
// column; nothing here does.)

export type UnlockRow = {
    unlock_id: string;
    unlock_time: number;
    unlock_duration: number;
};

// A duration of zero or less means the unlock never expires -- the game reads it the
// same way (AccountInfoDef.hasUnlock short-circuits before it ever looks at the time).
const PERMANENT = 0;

export async function getUnlockIds(user_id: string): Promise<string[]> {
    const rows = await query<{ unlock_id: string }>(
        "SELECT unlock_id FROM unlocks WHERE user_id = ?",
        [user_id]
    );
    return rows.map((r) => r.unlock_id);
}

// Safe to call twice: a repeat replaces the row rather than failing on the primary key,
// so a retried grant cannot leave a half-written record or throw.
export async function grantUnlock(
    user_id: string,
    unlock_id: string,
    unlock_duration: number = PERMANENT
): Promise<void> {
    await query(
        `INSERT INTO unlocks (user_id, unlock_id, unlock_time, unlock_duration)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, unlock_id) DO UPDATE SET
             unlock_time = excluded.unlock_time,
             unlock_duration = excluded.unlock_duration`,
        [user_id, unlock_id, Date.now(), unlock_duration]
    );
}

// The shape the deferred BOOST renown award needs: "does this account hold bst_renown?".
// Mirrors the original server's UserData.hasUnlock -- a non-positive duration is
// permanent, otherwise the grant has to still be inside its window.
export async function hasUnlock(user_id: string, unlock_id: string): Promise<boolean> {
    const row = await queryOne<{ unlock_time: number; unlock_duration: number }>(
        "SELECT unlock_time, unlock_duration FROM unlocks WHERE user_id = ? AND unlock_id = ?",
        [user_id, unlock_id]
    );
    if (!row) return false;
    if (row.unlock_duration <= 0) return true;
    return row.unlock_time + row.unlock_duration > Date.now();
}
