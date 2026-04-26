import { Router } from "express";
import { readFileSync } from "node:fs";
import { Session } from "./auth/auth";
import { saveParty, saveRoster } from "../db/account";

export const AccountRouter = Router();

// purchasable_units are global/static — not per-user, not stored in DB
const _staticAcc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));
export const PURCHASABLE_UNITS = _staticAcc.purchasable_units;

AccountRouter.get("/info/:session_key?", (req, res) => {
    const session: Session = (req as any).session;
    // Fix #6: guard against null accountData (race between login and first request)
    const acc = session.accountData;
    if (!acc) {
        res.sendStatus(401);
        return;
    }

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

AccountRouter.post("/update", async (req, res) => {
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
            await saveParty(session.user_id, party.ids);
            acc.party_ids_json = party.ids;
        }
        if (roster !== undefined) {
            await saveRoster(session.user_id, roster.defs);
            acc.roster_json = roster.defs;
            acc.roster_rows = roster.defs.length;
        }
        return res.send();
    } catch (err) {
        console.error("[ACCOUNT] DB error during update:", err);
        res.sendStatus(500);
    }
});
