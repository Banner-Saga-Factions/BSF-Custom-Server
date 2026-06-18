import { Router } from "express";
import { Session } from "./auth/auth";
import { PURCHASABLE_UNITS } from "./account";
import { saveRoster, saveParty, saveRosterAndSpendRenown, saveRosterAndAddRenown, expandBarracks, MAX_ROSTER_ROWS, UNITS_PER_ROW } from "../db/account";
import { ServerClasses } from "../const";

export const RosterRouter = Router();

const MAX_NAME_LEN = 32;

// Refund the renown spent PROMOTING the unit (20 for rank 1→2, 80 for 2→3) — never
// the hire cost. See the note in /unit/retire (#95): refunding the hire cost let a
// cheap-variant hire→retire cycle mint renown, and the original game refunded nothing
// on retire anyway. A rank-3 unit refunds 100; a rank-1 unit refunds 0.
function computeRetireRefund(rank: number): number {
    let refund = 0;
    if (rank >= 2) refund += 20;
    if (rank >= 3) refund += 80;
    return refund;
}

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
        await saveParty(session.external_id_str, party);
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
        await saveRosterAndSpendRenown(session.external_id_str, acc.roster_json, cost);
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
        await saveRosterAndSpendRenown(session.external_id_str, acc.roster_json, 10);
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
    const unit = acc.roster_json[idx];

    // Refund only the renown spent PROMOTING this unit (rank-up costs) — never the
    // original hire cost. The original game refunded nothing on retire (UnitRetireSvc
    // just deletes the unit); bsf-server's hire-cost refund was an addition, and because
    // a class has several hire prices (archer 10 / archer_exp 25 / archer_vet 0) it let
    // "hire the cheap variant, then retire" mint renown (#95). The fixed promotion costs
    // are provably paid, so refunding only those can never net positive.
    const rank = unit.stats.find((s: any) => s.stat === "RANK")?.value ?? 1;
    const refund = computeRetireRefund(rank);

    // Build new arrays without mutating acc until after the DB write succeeds.
    const newRoster = acc.roster_json.filter((_: any, i: number) => i !== idx);
    const partyChanged = acc.party_ids_json.includes(unit_id);
    const newParty = partyChanged
        ? acc.party_ids_json.filter((id: string) => id !== unit_id)
        : acc.party_ids_json;

    try {
        await saveRosterAndAddRenown(session.external_id_str, newRoster, refund, partyChanged ? newParty : undefined);
        acc.roster_json = newRoster;
        if (partyChanged) acc.party_ids_json = newParty;
        acc.renown += refund;
        // Push the new absolute total so the on-screen renown counter refreshes immediately
        // (AS3 GameFsm.handleOneMessage assigns rm.total to legend.renown — not a delta).
        const ts = Date.now();
        session.pushData({
            reliable_msg_id: `renown_retire_${session.account_id}_${ts}`,
            reliable_msg_target: null,
            class: ServerClasses.RENOWN_MESSAGE,
            timestamp: ts,
            total: acc.renown,
            user_id: session.account_id,
        });
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
    if (acc.roster_json.length >= acc.roster_rows * UNITS_PER_ROW) { res.status(400).json({ error: "barracks full" }); return; }

    const existingIds = new Set(acc.roster_json.map((u: any) => u.id));
    let finalId = new_unit_id;
    if (!finalId.includes("_start_")) {
        // Allocate the lowest UNUSED <class>_start_<n> slot. A running count
        // used to collide here: retiring a unit from the middle (or start) of a
        // class's sequence drops the count below a surviving higher index, so the
        // next hire re-picked an id still in use and the dup-guard 400'd
        // ("unable to hire <class>"). Scanning for the first free index can never
        // collide and fills the gap the retired unit left behind.
        const prefix = finalId.split("_")[0] + "_start_";
        let n = 0;
        while (existingIds.has(prefix + n)) n++;
        finalId = prefix + n;
    }

    // Defensive backstop: the generated path above is collision-free by
    // construction, but a client that sends its own explicit _start_ id could
    // still pick one that already exists.
    if (existingIds.has(finalId)) { res.status(400).json({ error: "unit ID already exists in roster" }); return; }

    // Build the new roster without touching acc — assign only after DB succeeds.
    const newUnit = { ...template.def, id: finalId, name: new_unit_name };
    const newRoster = [...acc.roster_json, newUnit];

    try {
        await saveRosterAndSpendRenown(session.external_id_str, newRoster, template.cost);
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
    //
    // Per-delta bounds — the AS3 client batches every "+"/"-" click into one
    // delta per stat at Confirm time (GuiCharacterStats.purchaseStats:405-421).
    //
    // POSITIVE: an old cap of 5 rejected legitimate batched purchases (e.g. a
    // 6-point STRENGTH upgrade), and the client desynced — it already mutated
    // locally, then /account/info wiped the change (issue #71). 20 is a generous
    // absolute backstop.
    //
    // NEGATIVE: the stat panel decrements on right-click
    // (GuiCharacterStats.buttonRightClickHandler), so reallocating points OUT of
    // a stat sends a negative delta (issue #118). The original server
    // (UnitStatsSvc.java:88-118) never checks the delta's sign — it validates the
    // RESULTING value against the per-stat StatRange. Those range tables aren't
    // ported server-side yet, so we approximate with a symmetric ±20 magnitude
    // cap plus a "result can't go below 0" floor below; the real per-stat min/max
    // is enforced client-side by StatRange (FactionsLegend.as:252-260).
    //
    // Delta=0 is tolerated and ignored (skipped in the mutate loop below) — the
    // client adds stat names to changedStats on any interaction; a "+1 then -1"
    // before confirm yields delta=0 for that stat. Rejecting would 400 the batch.
    // TODO: port StatRange tables so bounds become per-stat instead of ±20 / ≥0.
    for (let i = 0; i < stats.length; i++) {
        if (typeof deltas[i] !== "number" || !Number.isInteger(deltas[i])) {
            res.status(400).json({ error: `invalid delta for ${stats[i]}` });
            return;
        }
        if (deltas[i] < -20 || deltas[i] > 20) {  // symmetric magnitude backstop (see above)
            res.status(400).json({ error: `invalid delta for ${stats[i]}` });
            return;
        }
        const cur = unit.stats.find((s: any) => s.stat === stats[i]);
        if (!cur) {
            res.status(400).json({ error: `unknown stat: ${stats[i]}` });
            return;
        }
        if (cur.value + deltas[i] < 0) {  // never store a negative stat value
            res.status(400).json({ error: `invalid delta for ${stats[i]}` });
            return;
        }
    }

    // Save old values so we can restore them if the DB write fails.
    const oldValues: number[] = stats.map((statName: string) =>
        unit.stats.find((s: any) => s.stat === statName)!.value
    );
    for (let i = 0; i < stats.length; i++) {
        if (deltas[i] === 0) continue;  // no-op (client sent change-then-revert in same confirm)
        unit.stats.find((s: any) => s.stat === stats[i])!.value += deltas[i];
    }

    try {
        await saveRoster(session.external_id_str, acc.roster_json);
        res.send();
    } catch (err) {
        for (let i = 0; i < stats.length; i++) {
            unit.stats.find((s: any) => s.stat === stats[i])!.value = oldValues[i];
        }
        console.error("[ROSTER] DB error during unit/stats/purchase:", err);
        res.sendStatus(500);
    }
});

// No renown refund: the symmetric /unit/stats/purchase route does not deduct renown
// server-side (see comment above it). Refunding here would mint free renown.
RosterRouter.post("/unit/stats/reset/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    const { unit_id } = req.body;
    if (!unit_id) { res.sendStatus(400); return; }

    const unit = acc.roster_json.find((u: any) => u.id === unit_id);
    if (!unit) { res.sendStatus(404); return; }

    // Roster units carry entityClass from the spread in /unit/hire; the per-unit `id`
    // is mutated to "<class>_start_<n>", but entityClass is the canonical class key.
    const template = PURCHASABLE_UNITS.units.find((u: any) => u.def.entityClass === unit.entityClass);
    if (!template) { res.sendStatus(404); return; }

    const oldStats = unit.stats.map((s: any) => ({ ...s }));
    unit.stats = template.def.stats.map((s: any) => ({ ...s }));

    try {
        await saveRoster(session.external_id_str, acc.roster_json);
        res.send();
    } catch (err) {
        unit.stats = oldStats;
        console.error("[ROSTER] DB error during unit/stats/reset:", err);
        res.sendStatus(500);
    }
});

RosterRouter.post("/unlock/:session_key?", async (req, res) => {
    const session: Session = (req as any).session;
    const acc = session.accountData;
    if (!acc) { res.sendStatus(401); return; }

    if (acc.roster_rows >= MAX_ROSTER_ROWS) { res.status(400).json({ error: "barracks at max" }); return; }
    if (acc.renown < 60) { res.status(402).json({ error: "insufficient renown" }); return; }

    try {
        // expandBarracks uses AND renown >= 60 in SQL — atomic guard against race conditions.
        // Returns false if renown was insufficient at the DB level (e.g. concurrent request).
        const unlocked = await expandBarracks(session.external_id_str);
        if (!unlocked) { res.status(402).json({ error: "insufficient renown" }); return; }
        acc.roster_rows += 1;
        acc.renown -= 60;
        res.send();
    } catch (err) {
        console.error("[ROSTER] DB error during unlock:", err);
        res.sendStatus(500);
    }
});
