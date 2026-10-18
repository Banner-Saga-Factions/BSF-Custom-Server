import { query, queryOne } from "./connection";
import { CLAIM_ACCOUNT_NUMBER_SQL } from "./accountNumberSeed";
import { AccountProvider, usualAccountId } from "../services/auth/accountId";

// Every player's stored in-game number (#140). See src/db/migrations/006_account_numbers.sql.
//
// Both sign-in routes call accountNumberFor before they create a session: the first sign-in
// stores a number, every later one reads it back. Neither route may work the number out for
// itself.

export type AccountNumberResult =
    | { account_id: number }
    // The id text is already held by the other sign-in route (#375): refuse the sign-in.
    | { ownedBy: AccountProvider };

export async function accountNumberFor(provider: AccountProvider, externalId: string): Promise<AccountNumberResult> {
    await query(CLAIM_ACCOUNT_NUMBER_SQL, [externalId, provider, usualAccountId(provider, externalId)]);
    const row = await queryOne<{ provider: AccountProvider; account_id: number }>(
        "SELECT provider, account_id FROM account_numbers WHERE external_id = ?",
        [externalId]
    );
    if (!row) throw new Error(`accountNumberFor: no number stored for ${externalId}`);
    if (row.provider !== provider) return { ownedBy: row.provider };
    return { account_id: Number(row.account_id) };
}
