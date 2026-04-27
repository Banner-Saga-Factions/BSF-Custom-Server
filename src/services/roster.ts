import { Router } from "express";
import { Session } from "./auth/auth";
import { PURCHASABLE_UNITS } from "./account";
import { saveRoster, saveParty, saveRosterAndSpendRenown, saveRosterAndParty, expandBarracks } from "../db/account";

export const RosterRouter = Router();

const MAX_NAME_LEN = 32;

RosterRouter.post("/party/arrange/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    const { party } = req.body;
    if (!Array.isArray(party)) { res.sendStatus(400); return; }
    if (party.length > 6) { res.sendStatus(400); return; }
    if (!party.every((id: any) => typeof id === "string" && id.length > 0)) { res.sendStatus(400); return; }

    const validIds = new Set(acc.roster_json.map((u: any) => u.id));
    const invalid = party.filter((id: string) => !validIds.has(id));
    if (invalid.length > 0) { res.status(400).json({ error: "unknown unit IDs", ids: invalid }); return; }

    try {
        await saveParty(session.user_id, party);
        acc.party_ids_json = party;
        res.send();
    } catch (err) {
        console.error("[ROSTER] DB error during party/arrange:", err);
        res.sendStatus(500);
    }
});

RosterRouter.post("/unit/promote/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    const { unit_id, name, class_id } = req.body;
    if (!unit_id || typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LEN) { res.sendStatus(400); return; }
    if (typeof class_id !== "string" || class_id.length === 0 || class_id.length > MAX_NAME_LEN) { res.sendStatus(400); return; }

    const unit = acc.roster_json.find((u: any) => u.id === unit_id);
    if (!unit) { res.sendStatus(404); return; }

    const rankStat = unit.stats.find((s: any) => s.stat === "RANK");
    if (!rankStat) { res.sendStatus(400); return; }
    if (rankStat.value >= 3) { res.status(400).json({ error: "unit already at max rank" }); return; }

    const cost = rankStat.value === 1 ? 20 : 80;
    if (acc.renown < cost) { res.status(402).json({ error: "insufficient renown" }); return; }

    // Mutate in-memory first so saveRosterAndSpendRenown gets the updated roster.
    // Save old values to restore if the DB write fails.
    const oldRankValue = rankStat.value;
    const oldName = unit.name;
    const oldClass = unit.entityClass;
    rankStat.value += 1;
    unit.name = name;
    unit.entityClass = class_id;

    try {
        await saveRosterAndSpendRenown(session.user_id, acc.roster_json, cost);
        acc.renown -= cost;
        res.send();
    } catch (err) {
        rankStat.value = oldRankValue;
        unit.name = oldName;
        unit.entityClass = oldClass;
        console.error("[ROSTER] DB error during unit/promote:", err);
        res.sendStatus(500);
    }
});

RosterRouter.post("/unit/rename/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    const { unit_id, name } = req.body;
    if (!unit_id || typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LEN) { res.sendStatus(400); return; }
    if (acc.renown < 10) { res.status(402).json({ error: "insufficient renown" }); return; }

    const unit = acc.roster_json.find((u: any) => u.id === unit_id);
    if (!unit) { res.sendStatus(404); return; }

    const oldName = unit.name;
    unit.name = name;

    try {
        await saveRosterAndSpendRenown(session.user_id, acc.roster_json, 10);
        acc.renown -= 10;
        res.send();
    } catch (err) {
        unit.name = oldName;
        console.error("[ROSTER] DB error during unit/rename:", err);
        res.sendStatus(500);
    }
});

RosterRouter.post("/unit/retire/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    const { unit_id } = req.body;
    if (!unit_id) { res.sendStatus(400); return; }

    const idx = acc.roster_json.findIndex((u: any) => u.id === unit_id);
    if (idx === -1) { res.sendStatus(404); return; }

    // Build new arrays without mutating acc until after the DB write succeeds.
    const newRoster = acc.roster_json.filter((_: any, i: number) => i !== idx);
    const partyChanged = acc.party_ids_json.includes(unit_id);
    const newParty = partyChanged
        ? acc.party_ids_json.filter((id: string) => id !== unit_id)
        : acc.party_ids_json;

    try {
        if (partyChanged) {
            await saveRosterAndParty(session.user_id, newRoster, newParty);
        } else {
            await saveRoster(session.user_id, newRoster);
        }
        acc.roster_json = newRoster;
        if (partyChanged) acc.party_ids_json = newParty;
        res.send();
    } catch (err) {
        console.error("[ROSTER] DB error during unit/retire:", err);
        res.sendStatus(500);
    }
});

RosterRouter.post("/unit/hire/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    const { purchasable_unit_id, new_unit_id, new_unit_name } = req.body;
    if (!purchasable_unit_id || !new_unit_id) { res.sendStatus(400); return; }
    if (typeof new_unit_name !== "string" || new_unit_name.length === 0 || new_unit_name.length > MAX_NAME_LEN) { res.sendStatus(400); return; }

    const template = PURCHASABLE_UNITS.units.find((u: any) => u.def.id === purchasable_unit_id);
    if (!template) { res.sendStatus(404); return; }
    if (acc.renown < template.cost) { res.status(402).json({ error: "insufficient renown" }); return; }
    if (acc.roster_json.length >= acc.roster_rows) { res.status(400).json({ error: "barracks full" }); return; }

    let finalId = new_unit_id;
    if (!finalId.includes("_start_")) {
        const prefix = finalId.split("_")[0] + "_start_";
        const existing = acc.roster_json.filter((u: any) => u.id.startsWith(prefix));
        finalId = prefix + existing.length;
    }

    // Reject if the resolved ID already exists in the roster (guards client-supplied _start_ IDs too).
    const existingIds = new Set(acc.roster_json.map((u: any) => u.id));
    if (existingIds.has(finalId)) { res.status(400).json({ error: "unit ID already exists in roster" }); return; }

    // Build the new roster without touching acc — assign only after DB succeeds.
    const newUnit = { ...template.def, id: finalId, name: new_unit_name };
    const newRoster = [...acc.roster_json, newUnit];

    try {
        await saveRosterAndSpendRenown(session.user_id, newRoster, template.cost);
        acc.roster_json = newRoster;
        acc.renown -= template.cost;
        res.send();
    } catch (err) {
        console.error("[ROSTER] DB error during unit/hire:", err);
        res.sendStatus(500);
    }
});

// Known limitation: renown cost for stat upgrades is client-computed and not available
// server-side. For MVP, server validates delta bounds only. Future stream: add cost table.
RosterRouter.post("/unit/stats/purchase/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    const { unit_id, stats, deltas } = req.body;
    if (!unit_id || !Array.isArray(stats) || !Array.isArray(deltas)) { res.sendStatus(400); return; }
    if (stats.length !== deltas.length || stats.length === 0) { res.sendStatus(400); return; }

    // Reject duplicate stat names — would multiply the delta in a single request.
    if (new Set(stats).size !== stats.length) { res.sendStatus(400); return; }

    const unit = acc.roster_json.find((u: any) => u.id === unit_id);
    if (!unit) { res.sendStatus(404); return; }

    // Validate all before mutating any — prevents partial in-memory corruption
    // when a multi-stat request mixes valid and invalid deltas.
    for (let i = 0; i < stats.length; i++) {
        if (typeof deltas[i] !== "number" || !Number.isInteger(deltas[i]) || deltas[i] <= 0 || deltas[i] > 5) {
            res.status(400).json({ error: `invalid delta for ${stats[i]}` });
            return;
        }
        if (!unit.stats.find((s: any) => s.stat === stats[i])) {
            res.status(400).json({ error: `unknown stat: ${stats[i]}` });
            return;
        }
    }

    // Save old values so we can restore them if the DB write fails.
    const oldValues: number[] = stats.map((statName: string) =>
        unit.stats.find((s: any) => s.stat === statName)!.value
    );
    for (let i = 0; i < stats.length; i++) {
        unit.stats.find((s: any) => s.stat === stats[i])!.value += deltas[i];
    }

    try {
        await saveRoster(session.user_id, acc.roster_json);
        res.send();
    } catch (err) {
        for (let i = 0; i < stats.length; i++) {
            unit.stats.find((s: any) => s.stat === stats[i])!.value = oldValues[i];
        }
        console.error("[ROSTER] DB error during unit/stats/purchase:", err);
        res.sendStatus(500);
    }
});

RosterRouter.post("/unlock/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    if (acc.renown < 60) { res.status(402).json({ error: "insufficient renown" }); return; }

    try {
        // expandBarracks uses AND renown >= 60 in SQL — atomic guard against race conditions.
        // Returns false if renown was insufficient at the DB level (e.g. concurrent request).
        const unlocked = await expandBarracks(session.user_id);
        if (!unlocked) { res.status(402).json({ error: "insufficient renown" }); return; }
        acc.roster_rows += 1;
        acc.renown -= 60;
        res.send();
    } catch (err) {
        console.error("[ROSTER] DB error during unlock:", err);
        res.sendStatus(500);
    }
});
