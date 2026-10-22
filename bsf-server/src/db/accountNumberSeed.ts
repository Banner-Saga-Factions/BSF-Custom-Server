// Gives every existing account a stored player number (#140), once, at start-up.
//
// Migration 006 creates the account_numbers table empty. This fills it for accounts made
// before it existed, each with the number it has always had, so nothing changes for them.
// It runs after the migrations on every boot and touches only accounts that have no row
// yet, so a second run does nothing.
//
// It lives in TypeScript, not in the migration, on purpose: a Steam player's usual number
// comes from plain-Number maths that rounds in steps of 16 (see accountId.ts), and SQLite's
// exact integer maths would give some players a different number, cutting them off from
// their ranking rows.
//
// Takes the database itself, like runMigrations, because connection.ts calls it while it
// is still setting the database up.

import { DatabaseSync } from "node:sqlite";
import { AccountProvider, steamRouteIdKind, usualAccountId } from "../services/auth/accountId";

// Store a number for one id, unless it already has one. The usual number if it is a
// usable player number (1 to 2^31 - 1, what the game's signed 32-bit field holds) and
// nobody holds it; otherwise the smallest number nobody holds. One statement, so two
// sign-ins arriving together cannot both take the same number; the UNIQUE column is the
// backstop. Parameters: ?1 the id text, ?2 the provider, ?3 the usual number.
export const CLAIM_ACCOUNT_NUMBER_SQL = `
    INSERT INTO account_numbers (external_id, provider, account_id)
    SELECT ?1, ?2, CASE
        WHEN ?3 BETWEEN 1 AND 2147483647
             AND NOT EXISTS (SELECT 1 FROM account_numbers WHERE account_id = ?3) THEN ?3
        ELSE (SELECT MIN(free) FROM (
            SELECT 1 AS free WHERE NOT EXISTS (SELECT 1 FROM account_numbers WHERE account_id = 1)
            UNION ALL
            SELECT a.account_id + 1 FROM account_numbers a
            WHERE a.account_id < 2147483647
              AND NOT EXISTS (SELECT 1 FROM account_numbers b WHERE b.account_id = a.account_id + 1)))
    END
    WHERE NOT EXISTS (SELECT 1 FROM account_numbers WHERE external_id = ?1)`;

// The fill's first pass: store the usual number only if it is usable and nobody holds it.
// Parameters as above.
const KEEP_USUAL_NUMBER_SQL = `
    INSERT INTO account_numbers (external_id, provider, account_id)
    SELECT ?1, ?2, ?3
    WHERE ?3 BETWEEN 1 AND 2147483647
      AND NOT EXISTS (SELECT 1 FROM account_numbers WHERE account_id = ?3)
      AND NOT EXISTS (SELECT 1 FROM account_numbers WHERE external_id = ?1)`;

// Which route made an existing account. The table only records the id text, so this goes by
// size: above every Steam number can only be Discord; everything else is filed as Steam.
// Right only while no Discord player with an id from before August 2015 has signed in
// (those ids fall inside the Steam range); see docs/security.md.
export function providerOfExistingAccount(userId: string): AccountProvider {
    return steamRouteIdKind(BigInt(userId)) === "too-big" ? "discord" : "steam";
}

export function seedAccountNumbers(db: DatabaseSync): void {
    // Newest account first, so when two existing accounts share a number the NEWEST keeps it
    // and the older one moves. The owner's call on the one such pair in production
    // (2026-10-18): the older account was the owner's own, and the newer one might be a real
    // player whose wins and rating are on that number, so the safe choice was to move the
    // owner's account.
    const missing = db
        .prepare(
            `SELECT user_id FROM accounts
             WHERE user_id NOT IN (SELECT external_id FROM account_numbers)
             ORDER BY created_at DESC, rowid DESC`
        )
        .all() as { user_id: string }[];
    if (missing.length === 0) return;

    // An id that is not plain digits cannot be a Steam or Discord id. Skip it and name it in
    // the log, rather than stop the server from starting over one odd row.
    const skipped = missing.filter(({ user_id }) => !/^\d{1,20}$/.test(user_id)).map((r) => r.user_id);
    const accounts = missing
        .filter(({ user_id }) => /^\d{1,20}$/.test(user_id))
        .map(({ user_id }) => {
            const provider = providerOfExistingAccount(user_id);
            return { user_id, provider, usual: usualAccountId(provider, user_id) };
        });

    const keep = db.prepare(KEEP_USUAL_NUMBER_SQL);
    const claim = db.prepare(CLAIM_ACCOUNT_NUMBER_SQL);
    const stored = db.prepare("SELECT account_id FROM account_numbers WHERE external_id = ?");
    const moved: string[] = [];
    db.exec("BEGIN");
    try {
        // Two passes. Every account first keeps its usual number where it can; only then do the
        // rest take the smallest free number. In one pass, an account moving off a shared number
        // could take the usual number of an older account not yet reached, and move that one too.
        for (const { user_id, provider, usual } of accounts) keep.run(user_id, provider, usual);
        for (const { user_id, provider, usual } of accounts) {
            claim.run(user_id, provider, usual);
            const { account_id } = stored.get(user_id) as { account_id: number };
            if (account_id !== usual) moved.push(`${user_id} (${usual} -> ${account_id})`);
        }
        db.exec("COMMIT");
    } catch (err) {
        db.exec("ROLLBACK");
        throw new Error(`[DB] storing player numbers failed: ${(err as Error).message}`);
    }
    console.log(
        `[DB] Account numbers: stored ${accounts.length}, ${moved.length} moved off a shared or unusable number` +
            (moved.length ? `: ${moved.join(", ")}` : "") +
            (skipped.length ? `; skipped ${skipped.length} not made of digits: ${skipped.join(", ")}` : "")
    );
}
