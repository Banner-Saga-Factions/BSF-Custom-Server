import { query, queryOne, queryUpdate } from "./connection";
import { readFileSync } from "fs";
import { startingRenown } from "../const";

// Original BSF client renders the roster as a grid of `roster_rows` rows,
// each holding 9 unit slots. Total capacity = roster_rows * UNITS_PER_ROW.
// MAX_ROSTER_ROWS is the highest the client will display; the "Expand
// Barracks" button hides at this cap.
export const UNITS_PER_ROW = 9;
export const MAX_ROSTER_ROWS = 8;

export type AccountRow = {
    user_id: number;
    username: string;
    renown: number;
    daily_login_streak: number;
    login_count: number;
    completed_tutorial: boolean;  // DB default is 0 (post-M3a). Pre-M3a rows were all created with the old default of 1; migration 002 left those values intact.
    roster_rows: number;
    roster_json: any[];
    party_ids_json: string[];
};

// Fix #16: wrap module-level file reads so a missing file doesn't kill the server on import
let DEFAULT_ROSTER: any[] = [];
let DEFAULT_PARTY_IDS: string[] = [];
try {
    const defaultAcc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));
    DEFAULT_ROSTER = defaultAcc.roster.defs;
    DEFAULT_PARTY_IDS = defaultAcc.party.ids;
} catch (err) {
    console.error("[DB] Failed to load default roster from data/acc.json:", err);
}

const ACCOUNT_COLUMNS =
    "user_id, username, renown, daily_login_streak, login_count, completed_tutorial, roster_rows, roster_json, party_ids_json";

export function parseRow(raw: any): AccountRow {
    return {
        ...raw,
        user_id: Number(raw.user_id),
        completed_tutorial: Boolean(raw.completed_tutorial),
        roster_json: typeof raw.roster_json === "string" ? JSON.parse(raw.roster_json) : raw.roster_json,
        party_ids_json: typeof raw.party_ids_json === "string" ? JSON.parse(raw.party_ids_json) : raw.party_ids_json,
    };
}

// Fix #10: explicit column list instead of SELECT *
// Accepts string to avoid precision loss for 64-bit Steam/Discord IDs > MAX_SAFE_INTEGER.
export async function getAccountByUserId(user_id: number | string): Promise<AccountRow | null> {
    const row = await queryOne<any>(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE user_id = ?`,
        [String(user_id)]
    );
    return row ? parseRow(row) : null;
}

// Creates the account if it doesn't exist, increments login_count on subsequent logins.
//
// #227: the renown below is the NEW-ACCOUNT grant, and it belongs in the INSERT's
// column list -- never in the ON CONFLICT branch. That branch is the one a returning
// player takes, and it deliberately mentions only login_count and username, so
// whatever they have earned or spent survives. Moving renown down into it would
// silently reset every returning player's balance on every sign-in.
export async function upsertAccount(user_id: number | string, username: string): Promise<AccountRow> {
    await query(
        `INSERT INTO accounts (user_id, username, renown, roster_json, party_ids_json, roster_rows)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET login_count = login_count + 1, username = excluded.username`,
        [String(user_id), username, startingRenown(), JSON.stringify(DEFAULT_ROSTER), JSON.stringify(DEFAULT_PARTY_IDS), MAX_ROSTER_ROWS]
    );

    // Fix #3: explicit null check instead of ! — surface a real error if something went wrong
    const account = await getAccountByUserId(user_id);
    if (!account) {
        throw new Error(`upsertAccount: row missing for user_id=${user_id} after INSERT`);
    }
    return account;
}

export async function addRenown(user_id: number | string, delta: number): Promise<void> {
    await query("UPDATE accounts SET renown = renown + ? WHERE user_id = ?", [delta, String(user_id)]);
}

export async function markTutorialComplete(user_id: number | string): Promise<void> {
    await query("UPDATE accounts SET completed_tutorial = 1 WHERE user_id = ?", [String(user_id)]);
}

export async function saveParty(user_id: number | string, party_ids: string[]): Promise<void> {
    await query("UPDATE accounts SET party_ids_json = ? WHERE user_id = ?", [JSON.stringify(party_ids), String(user_id)]);
}

export async function saveRoster(user_id: number | string, roster_defs: any[]): Promise<void> {
    await query(
        "UPDATE accounts SET roster_json = ? WHERE user_id = ?",
        [JSON.stringify(roster_defs), String(user_id)]
    );
}

// Atomic single-statement alternatives to the saveRoster+addRenown two-write pattern.
// Using two separate UPDATEs risks renown being skipped if the second write fails.
export async function saveRosterAndSpendRenown(user_id: number | string, roster_defs: any[], cost: number): Promise<void> {
    await query(
        "UPDATE accounts SET roster_json = ?, renown = renown - ? WHERE user_id = ?",
        [JSON.stringify(roster_defs), cost, String(user_id)]
    );
}

export async function saveRosterAndParty(user_id: number | string, roster_defs: any[], party_ids: string[]): Promise<void> {
    await query(
        "UPDATE accounts SET roster_json = ?, party_ids_json = ? WHERE user_id = ?",
        [JSON.stringify(roster_defs), JSON.stringify(party_ids), String(user_id)]
    );
}

// Signed-delta counterpart to saveRosterAndSpendRenown: positive delta adds renown back.
// Optional party_ids is provided when the same write also removes the unit from the active party.
export async function saveRosterAndAddRenown(
    user_id: number | string,
    roster_defs: any[],
    delta: number,
    party_ids?: string[]
): Promise<void> {
    if (party_ids !== undefined) {
        await query(
            "UPDATE accounts SET roster_json = ?, party_ids_json = ?, renown = renown + ? WHERE user_id = ?",
            [JSON.stringify(roster_defs), JSON.stringify(party_ids), delta, String(user_id)]
        );
    } else {
        await query(
            "UPDATE accounts SET roster_json = ?, renown = renown + ? WHERE user_id = ?",
            [JSON.stringify(roster_defs), delta, String(user_id)]
        );
    }
}

// Returns true if the update applied (renown was sufficient), false if the WHERE filtered it out.
// The AND renown >= 60 guard makes the deduction atomic with the capacity increment and prevents
// negative renown from a race between two concurrent unlock requests on the same session.
export async function expandBarracks(user_id: number | string): Promise<boolean> {
    const affected = await queryUpdate(
        "UPDATE accounts SET roster_rows = roster_rows + 1, renown = renown - 60 WHERE user_id = ? AND renown >= 60",
        [String(user_id)]
    );
    return affected > 0;
}

// Alias for Discord OAuth path
export const getAccountById = getAccountByUserId;
