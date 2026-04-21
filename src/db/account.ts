import { query, queryOne } from "./connection";
import { readFileSync } from "fs";

export type AccountRow = {
    user_id: number;
    username: string;
    renown: number;
    daily_login_streak: number;
    login_count: number;
    completed_tutorial: boolean;
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

function parseRow(raw: any): AccountRow {
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
export async function upsertAccount(user_id: number | string, username: string): Promise<AccountRow> {
    await query(
        `INSERT INTO accounts (user_id, username, roster_json, party_ids_json, roster_rows)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE login_count = login_count + 1`,
        [String(user_id), username, JSON.stringify(DEFAULT_ROSTER), JSON.stringify(DEFAULT_PARTY_IDS), DEFAULT_ROSTER.length]
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

export async function saveParty(user_id: number | string, party_ids: string[]): Promise<void> {
    await query("UPDATE accounts SET party_ids_json = ? WHERE user_id = ?", [JSON.stringify(party_ids), String(user_id)]);
}

export async function saveRoster(user_id: number | string, roster_defs: any[]): Promise<void> {
    await query(
        "UPDATE accounts SET roster_json = ?, roster_rows = ? WHERE user_id = ?",
        [JSON.stringify(roster_defs), roster_defs.length, String(user_id)]
    );
}

// Alias for Discord OAuth path
export const getAccountById = getAccountByUserId;
