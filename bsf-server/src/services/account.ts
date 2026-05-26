import { Router } from "express";
import { readFileSync } from "node:fs";
import { Session } from "./auth/auth";
import { markTutorialComplete, saveParty, saveRoster } from "../db/account";

export const AccountRouter = Router();

// purchasable_units are global/static — not per-user, not stored in DB
const _staticAcc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));
export const PURCHASABLE_UNITS = _staticAcc.purchasable_units;

// Build the ordered party EntityDef list from a roster and party_ids array.
// PARTY ORDER MATTERS: party_ids_json is the player's chosen arrangement and
// drives turn order in battle (BattleTurnParty consumes defs[] in order and
// rotates members by index). Filtering the roster instead would silently
// reorder by roster grid position — the bug behind issue #71. Mirrors the
// Java reference UserData.getPartyDefs() at UserData.java:229-244 (modulo
// the throw → skip divergence noted below).
//
// Unknown ids skipped silently (defensive — Java threw IllegalArgumentException
// here, but /unit/retire already cleans party_ids so this should never fire;
// if it does, a smaller party is preferable to a 500 mid-match-start).
// Duplicates also skipped — the old roster.filter() pattern visited each
// roster row once and so happened to dedupe; preserve that invariant.
export function buildOrderedPartyDefs(roster: any[], party_ids: string[]): any[] {
    const byId = new Map(roster.map((u: any) => [u.id, u]));
    const defs: any[] = [];
    const seen = new Set<string>();
    for (const id of party_ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const def = byId.get(id);
        if (def) defs.push(def);
    }
    return defs;
}

AccountRouter.get("/info/:session_key?", (req, res) => {
    const session: Session = (req as any).session;
    // Fix #6: guard against null accountData (race between login and first request)
    const acc = session.accountData;
    if (!acc) {
        res.sendStatus(401);
        return;
    }

    // Diagnostic: print exactly which RANK values the server is about to
    // send. Cross-check against what the client renders in the party UI.
    const ranks = acc.roster_json.map((u: any) => {
        const rank = u.stats?.find((s: any) => s.stat === "RANK")?.value ?? 1;
        return `${u.id}:R${rank}`;
    }).join(", ");
    console.log(`[ACCOUNT_INFO] account=${session.account_id} user=${session.user_id} roster_size=${acc.roster_json.length} ranks=[${ranks}]`);

    res.json({
        purchases: [],
        daily_login_streak: acc.daily_login_streak,
        renown: acc.renown,
        iap_sandbox: false,
        completed_tutorial: acc.completed_tutorial,
        daily_login_bonus: 1,
        unlocks: [],
        roster_rows: acc.roster_rows,
        purchasable_units: PURCHASABLE_UNITS,
        roster: { defs: acc.roster_json },
        party: { ids: acc.party_ids_json },
        login_count: acc.login_count,
    });
});

AccountRouter.post("/update/:session_key", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) {
        res.sendStatus(401);
        return;
    }

    const { party, roster } = req.body;

    // Validate input types
    if (party !== undefined && !Array.isArray(party?.ids)) {
        res.sendStatus(400);
        return;
    }
    if (roster !== undefined && !Array.isArray(roster?.defs)) {
        res.sendStatus(400);
        return;
    }

    // Stream 5: party element types + size limit
    if (party !== undefined) {
        if (party.ids.length > 6) { res.sendStatus(400); return; }
        if (!party.ids.every((id: any) => typeof id === "string" && id.length > 0)) {
            res.sendStatus(400);
            return;
        }
    }

    // Stream 5: party IDs must reference units that exist in the current roster
    if (party !== undefined) {
        const validIds = new Set(acc.roster_json.map((u: any) => u.id));
        const invalid = party.ids.filter((id: string) => !validIds.has(id));
        if (invalid.length > 0) {
            res.status(400).json({ error: "party contains unknown unit IDs", ids: invalid });
            return;
        }
    }

    // Stream 5: each roster def must have non-empty id, entityClass, and stats[]
    if (roster !== undefined) {
        const malformed = roster.defs.filter(
            (u: any) =>
                typeof u.id !== "string" || u.id.trim() === "" ||
                typeof u.entityClass !== "string" || u.entityClass.trim() === "" ||
                !Array.isArray(u.stats)
        );
        if (malformed.length > 0) {
            res.sendStatus(400);
            return;
        }
    }

    // Wrap DB writes in try/catch so failures return 500 instead of unhandled rejection
    try {
        if (party !== undefined) {
            await saveParty(session.steam_id_str, party.ids);
            acc.party_ids_json = party.ids;
        }
        if (roster !== undefined) {
            await saveRoster(session.steam_id_str, roster.defs);
            acc.roster_json = roster.defs;
        }
        return res.send();
    } catch (err) {
        console.error("[ACCOUNT] DB error during update:", err);
        res.sendStatus(500);
    }
});

AccountRouter.post("/tutorial/:session_key", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) {
        res.sendStatus(401);
        return;
    }
    if (acc.completed_tutorial) {
        res.send();
        return;
    }
    try {
        await markTutorialComplete(session.steam_id_str);
        acc.completed_tutorial = true;
        res.send();
    } catch (err) {
        console.error("[ACCOUNT] DB error marking tutorial complete:", err);
        res.sendStatus(500);
    }
});
