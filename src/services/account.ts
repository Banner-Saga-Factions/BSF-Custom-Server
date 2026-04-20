import { Router } from "express";
import { readFileSync } from "node:fs";
import { Session } from "./auth/auth";
import { saveParty, saveRoster } from "../db/account";

export const AccountRouter = Router();

// purchasable_units are global/static — not per-user, not stored in DB
const _staticAcc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));
const PURCHASABLE_UNITS = _staticAcc.purchasable_units;

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

    if (party?.ids) {
        await saveParty(session.user_id, party.ids);
        acc.party_ids_json = party.ids;
    }
    if (roster?.defs) {
        await saveRoster(session.user_id, roster.defs);
        acc.roster_json = roster.defs;
    }

    return res.send();
});
