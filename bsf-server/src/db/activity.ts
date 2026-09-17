import { query, queryOne } from "./connection";

// Hourly player totals (#267): how many people sign in, search for a match, find one, and are
// online at once, so we can tell whether anything we try brings players back. The table, and the
// reasons behind its shape, are in src/db/migrations/005_activity_totals.sql. When each number is
// counted is decided in src/services/activityStats.ts, not here.
//
// Kept out of db/account.ts on purpose, although two functions here read and write the accounts
// table: 13 test files replace that whole module with a hand-written list of its functions, so a
// function added there would be missing from all 13 of them.
//
// Every function takes the full provider id string (session.external_id_str), the same key the
// accounts table uses -- never the 32-bit account_id.
//
// Two traps for anyone adding to this file:
//  - Bind numbers, never true or false. query() hands parameters straight to node:sqlite, which
//    throws on a JavaScript boolean, so turn a yes/no into 1 or 0 first.
//  - Never add RETURNING to a write. query() hands rows back only for SELECT, WITH and PRAGMA
//    (src/db/connection.ts) and silently drops them for everything else.

export type ActivityCounts = {
    sign_ins: number;
    daily_players: number;
    new_players: number;
    returning_players: number;
    find_match_joins: number;
    challenge_joins: number;
    find_match_matched: number;
    challenge_matched: number;
    search_timeouts: number;
    peak_online: number;
};

export type ActivityHourRow = ActivityCounts & { hour: string };

// The counts that add up, in table order. peak_online is not one of them: it keeps the highest
// sample instead. The write below is built from this one list, so a column and the number bound
// to it cannot drift apart the way a long run of positional values can.
const SUMMED_COLUMNS = [
    "sign_ins",
    "daily_players",
    "new_players",
    "returning_players",
    "find_match_joins",
    "challenge_joins",
    "find_match_matched",
    "challenge_matched",
    "search_timeouts",
] as const;

const COLUMNS = `hour, ${SUMMED_COLUMNS.join(", ")}, peak_online`;

const ADD_TO_HOUR_SQL = `
    INSERT INTO activity_hourly (${COLUMNS})
    VALUES (?, ${SUMMED_COLUMNS.map(() => "?").join(", ")}, ?)
    ON CONFLICT(hour) DO UPDATE SET
        ${SUMMED_COLUMNS.map((column) => `${column} = ${column} + excluded.${column}`).join(",\n        ")},
        peak_online = MAX(peak_online, excluded.peak_online)`;

// The row key for the hour `now` falls in, in UTC: exactly '2026-09-16 13:00:00', the shape
// SQLite's own datetime() gives. Build every key with this. Keys are compared as text, so one
// written any other way -- with a 'T' in the middle, say -- sorts into the wrong place against
// those dates.
export function hourKey(now: number): string {
    return new Date(now).toISOString().slice(0, 13).replace("T", " ") + ":00:00";
}

// When this account last signed in, in milliseconds. Null when it has no sign-in on record, or
// when there is no such account.
export async function getLastSignInAt(user_id: string): Promise<number | null> {
    const row = await queryOne<{ last_sign_in_at: number | null }>(
        "SELECT last_sign_in_at FROM accounts WHERE user_id = ?",
        [user_id]
    );
    return row?.last_sign_in_at ?? null;
}

export async function setLastSignInAt(user_id: string, signedInAt: number): Promise<void> {
    await query("UPDATE accounts SET last_sign_in_at = ? WHERE user_id = ?", [signedInAt, user_id]);
}

// Add these counts to an hour, creating its row if it has none yet. Anything left out counts as
// zero. Each count is added to what the row already holds and peak_online keeps the larger value,
// so the first write after a restart never resets the hour.
export async function addToHour(hour: string, counts: Partial<ActivityCounts>): Promise<void> {
    await query(ADD_TO_HOUR_SQL, [
        hour,
        ...SUMMED_COLUMNS.map((column) => counts[column] ?? 0),
        counts.peak_online ?? 0,
    ]);
}

export async function getHour(hour: string): Promise<ActivityHourRow | null> {
    return queryOne<ActivityHourRow>(`SELECT ${COLUMNS} FROM activity_hourly WHERE hour = ?`, [hour]);
}
