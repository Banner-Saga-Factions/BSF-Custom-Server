import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { loginPlayer } from "../helpers";
import {
    saveParty,
    saveRoster,
    saveRosterAndSpendRenown,
    saveRosterAndParty,
    saveRosterAndAddRenown,
    expandBarracks,
} from "../../src/db/account";

vi.mock("../../src/db/account", () => ({
    // Fresh object per call — mutations in one test must not bleed into the next
    upsertAccount: vi.fn().mockImplementation(async () => ({
        user_id: 123,
        username: "testplayer",
        renown: 1000,
        daily_login_streak: 1,
        login_count: 1,
        completed_tutorial: true,
        roster_rows: 10,
        roster_json: [
            { id: "unit1", entityClass: "archer", name: "Iver", stats: [{ stat: "RANK", value: 1 }, { stat: "STRENGTH", value: 7 }, { stat: "ARMOR", value: 5 }] },
            { id: "unit2", entityClass: "warrior", name: "Rook", stats: [{ stat: "RANK", value: 2 }] },
        ],
        party_ids_json: ["unit1"],
    })),
    addRenown: vi.fn().mockResolvedValue(undefined),
    saveParty: vi.fn().mockResolvedValue(undefined),
    saveRoster: vi.fn().mockResolvedValue(undefined),
    saveRosterAndSpendRenown: vi.fn().mockResolvedValue(undefined),
    saveRosterAndParty: vi.fn().mockResolvedValue(undefined),
    saveRosterAndAddRenown: vi.fn().mockResolvedValue(undefined),
    expandBarracks: vi.fn().mockResolvedValue(true),
    getAccountByUserId: vi.fn().mockResolvedValue(null),
    getAccountById: vi.fn().mockResolvedValue(null),
    parseRow: vi.fn(),
    MAX_ROSTER_ROWS: 8,
    UNITS_PER_ROW: 9,
}));

beforeEach(() => {
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
    vi.mocked(saveParty).mockClear().mockResolvedValue(undefined);
    vi.mocked(saveRoster).mockClear().mockResolvedValue(undefined);
    vi.mocked(saveRosterAndSpendRenown).mockClear().mockResolvedValue(undefined);
    vi.mocked(saveRosterAndParty).mockClear().mockResolvedValue(undefined);
    vi.mocked(saveRosterAndAddRenown).mockClear().mockResolvedValue(undefined);
    vi.mocked(expandBarracks).mockClear().mockResolvedValue(true);
});

// ──────────────────────────────────────────────
// party/arrange
// ──────────────────────────────────────────────
describe("POST /services/roster/party/arrange/:session_key", () => {
    it("updates in-memory party and calls saveParty", async () => {
        const { session_key } = await loginPlayer("300");
        const session = sessionHandler.getSession("session_key", session_key)!;

        const res = await request(app)
            .post(`/services/roster/party/arrange/${session_key}`)
            .send({ party: ["unit1", "unit2"] });

        expect(res.status).toBe(200);
        expect(session.accountData!.party_ids_json).toEqual(["unit1", "unit2"]);
        expect(vi.mocked(saveParty)).toHaveBeenCalledOnce();
    });

    it("returns 400 when party is not an array", async () => {
        const { session_key } = await loginPlayer("301");
        const res = await request(app)
            .post(`/services/roster/party/arrange/${session_key}`)
            .send({ party: "unit1" });
        expect(res.status).toBe(400);
    });

    it("returns 400 when party exceeds 6 units", async () => {
        const { session_key } = await loginPlayer("302");
        const res = await request(app)
            .post(`/services/roster/party/arrange/${session_key}`)
            .send({ party: ["u1", "u2", "u3", "u4", "u5", "u6", "u7"] });
        expect(res.status).toBe(400);
    });

    it("returns 400 when party references unknown unit IDs", async () => {
        const { session_key } = await loginPlayer("303");
        const res = await request(app)
            .post(`/services/roster/party/arrange/${session_key}`)
            .send({ party: ["unit_not_in_roster"] });
        expect(res.status).toBe(400);
    });
});

// ──────────────────────────────────────────────
// unit/promote
// ──────────────────────────────────────────────
describe("POST /services/roster/unit/promote/:session_key", () => {
    it("promotes rank 1 → 2 for 20 renown", async () => {
        const { session_key } = await loginPlayer("310");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        const unit = acc.roster_json.find((u: any) => u.id === "unit1")!;

        const res = await request(app)
            .post(`/services/roster/unit/promote/${session_key}`)
            .send({ unit_id: "unit1", name: "IverNew", class_id: "archer" });

        expect(res.status).toBe(200);
        expect(unit.stats.find((s: any) => s.stat === "RANK").value).toBe(2);
        expect(unit.name).toBe("IverNew");
        expect(acc.renown).toBe(980);
        expect(vi.mocked(saveRosterAndSpendRenown)).toHaveBeenCalledOnce();
    });

    it("promotes rank 2 → 3 for 80 renown", async () => {
        const { session_key } = await loginPlayer("311");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        const unit = acc.roster_json.find((u: any) => u.id === "unit2")!;

        const res = await request(app)
            .post(`/services/roster/unit/promote/${session_key}`)
            .send({ unit_id: "unit2", name: "RookMax", class_id: "warrior" });

        expect(res.status).toBe(200);
        expect(unit.stats.find((s: any) => s.stat === "RANK").value).toBe(3);
        expect(acc.renown).toBe(920);
    });

    it("returns 400 when unit is already at max rank (3)", async () => {
        const { session_key } = await loginPlayer("312");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.roster_json.find((u: any) => u.id === "unit1")!
            .stats.find((s: any) => s.stat === "RANK")!.value = 3;

        const res = await request(app)
            .post(`/services/roster/unit/promote/${session_key}`)
            .send({ unit_id: "unit1", name: "x", class_id: "archer" });
        expect(res.status).toBe(400);
    });

    it("returns 402 when renown is insufficient", async () => {
        const { session_key } = await loginPlayer("313");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.renown = 5;

        const res = await request(app)
            .post(`/services/roster/unit/promote/${session_key}`)
            .send({ unit_id: "unit1", name: "x", class_id: "archer" });
        expect(res.status).toBe(402);
    });

    it("returns 404 for unknown unit_id", async () => {
        const { session_key } = await loginPlayer("314");
        const res = await request(app)
            .post(`/services/roster/unit/promote/${session_key}`)
            .send({ unit_id: "ghost", name: "x", class_id: "archer" });
        expect(res.status).toBe(404);
    });

    it("reverts in-memory state when DB throws", async () => {
        const { session_key } = await loginPlayer("315");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        const unit = acc.roster_json.find((u: any) => u.id === "unit1")!;
        const originalRank = unit.stats.find((s: any) => s.stat === "RANK").value;
        const originalName = unit.name;

        vi.mocked(saveRosterAndSpendRenown).mockRejectedValueOnce(new Error("db down"));

        const res = await request(app)
            .post(`/services/roster/unit/promote/${session_key}`)
            .send({ unit_id: "unit1", name: "ShouldRevert", class_id: "archer" });

        expect(res.status).toBe(500);
        expect(unit.stats.find((s: any) => s.stat === "RANK").value).toBe(originalRank);
        expect(unit.name).toBe(originalName);
    });
});

// ──────────────────────────────────────────────
// unit/rename
// ──────────────────────────────────────────────
describe("POST /services/roster/unit/rename/:session_key", () => {
    it("renames the unit and deducts 10 renown", async () => {
        const { session_key } = await loginPlayer("320");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        const unit = acc.roster_json.find((u: any) => u.id === "unit1")!;

        const res = await request(app)
            .post(`/services/roster/unit/rename/${session_key}`)
            .send({ unit_id: "unit1", name: "NewName" });

        expect(res.status).toBe(200);
        expect(unit.name).toBe("NewName");
        expect(acc.renown).toBe(990);
    });

    it("returns 402 when renown < 10", async () => {
        const { session_key } = await loginPlayer("321");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.renown = 9;

        const res = await request(app)
            .post(`/services/roster/unit/rename/${session_key}`)
            .send({ unit_id: "unit1", name: "x" });
        expect(res.status).toBe(402);
    });

    it("returns 400 for empty name", async () => {
        const { session_key } = await loginPlayer("322");
        const res = await request(app)
            .post(`/services/roster/unit/rename/${session_key}`)
            .send({ unit_id: "unit1", name: "" });
        expect(res.status).toBe(400);
    });

    it("returns 400 for name longer than 32 chars", async () => {
        const { session_key } = await loginPlayer("323");
        const res = await request(app)
            .post(`/services/roster/unit/rename/${session_key}`)
            .send({ unit_id: "unit1", name: "x".repeat(33) });
        expect(res.status).toBe(400);
    });

    it("returns 404 for unknown unit_id", async () => {
        const { session_key } = await loginPlayer("324");
        const res = await request(app)
            .post(`/services/roster/unit/rename/${session_key}`)
            .send({ unit_id: "ghost", name: "x" });
        expect(res.status).toBe(404);
    });

    it("reverts the name when DB throws", async () => {
        const { session_key } = await loginPlayer("325");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const original = unit.name;

        vi.mocked(saveRosterAndSpendRenown).mockRejectedValueOnce(new Error("db down"));

        const res = await request(app)
            .post(`/services/roster/unit/rename/${session_key}`)
            .send({ unit_id: "unit1", name: "ShouldRevert" });

        expect(res.status).toBe(500);
        expect(unit.name).toBe(original);
    });
});

// ──────────────────────────────────────────────
// unit/retire
// ──────────────────────────────────────────────
describe("POST /services/roster/unit/retire/:session_key", () => {
    it("removes a non-party unit and refunds hire + rank-up renown", async () => {
        const { session_key } = await loginPlayer("330");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        const prevLen = acc.roster_json.length;
        const pushSpy = vi.spyOn(session, "pushData");

        // unit2 is warrior RANK 2, not in party. Refund = template.cost (10) + 20 = 30.
        const res = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "unit2" });

        expect(res.status).toBe(200);
        expect(acc.roster_json).toHaveLength(prevLen - 1);
        expect(acc.renown).toBe(1020);
        expect(vi.mocked(saveRosterAndAddRenown)).toHaveBeenCalledOnce();
        const call = vi.mocked(saveRosterAndAddRenown).mock.calls[0];
        expect(call[2]).toBe(20);            // refund delta
        expect(call[3]).toBeUndefined();     // no party arg when party unchanged
        expect(vi.mocked(saveRoster)).not.toHaveBeenCalled();
        expect(vi.mocked(saveRosterAndParty)).not.toHaveBeenCalled();

        // The client only learns about the refund via a pushed RenownMsg — total is absolute, not delta.
        expect(pushSpy).toHaveBeenCalledOnce();
        const pushed = pushSpy.mock.calls[0][0] as any;
        expect(pushed.class).toBe("tbs.srv.util.RenownMsg");
        expect(pushed.total).toBe(1020);
        expect(pushed.user_id).toBe(session.account_id);
    });

    it("removes a party unit and refunds renown with party update in one write", async () => {
        const { session_key } = await loginPlayer("331");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        const pushSpy = vi.spyOn(session, "pushData");

        // unit1 is archer RANK 1, in the party. Refund = template.cost (10) + 0 = 10.
        const res = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "unit1" });

        expect(res.status).toBe(200);
        expect(acc.party_ids_json).not.toContain("unit1");
        expect(acc.renown).toBe(1000);
        expect(vi.mocked(saveRosterAndAddRenown)).toHaveBeenCalledOnce();
        const call = vi.mocked(saveRosterAndAddRenown).mock.calls[0];
        expect(call[2]).toBe(0);            // refund delta
        expect(call[3]).toEqual([]);         // party arg is the new (emptied) party
        expect(vi.mocked(saveRosterAndParty)).not.toHaveBeenCalled();

        expect(pushSpy).toHaveBeenCalledOnce();
        const pushed = pushSpy.mock.calls[0][0] as any;
        expect(pushed.class).toBe("tbs.srv.util.RenownMsg");
        expect(pushed.total).toBe(1000);
    });

    it("refunds 100 renown for a rank-3 unit (hire 0 + 20 + 80)", async () => {
        const { session_key } = await loginPlayer("334");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        acc.roster_json.find((u: any) => u.id === "unit2")!
            .stats.find((s: any) => s.stat === "RANK")!.value = 3;
        const pushSpy = vi.spyOn(session, "pushData");

        const res = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "unit2" });

        expect(res.status).toBe(200);
        expect(acc.renown).toBe(1100);
        const call = vi.mocked(saveRosterAndAddRenown).mock.calls[0];
        expect(call[2]).toBe(100);

        expect(pushSpy).toHaveBeenCalledOnce();
        const pushed = pushSpy.mock.calls[0][0] as any;
        expect(pushed.total).toBe(1100);
    });

    it("refunds rank-up only when the unit's class is no longer in the catalog", async () => {
        const { session_key } = await loginPlayer("335");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        // unit2 is RANK 2. Forcing an unknown entityClass means hire cost can't be verified.
        acc.roster_json.find((u: any) => u.id === "unit2")!.entityClass = "ghost_class";
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const pushSpy = vi.spyOn(session, "pushData");

        const res = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "unit2" });

        expect(res.status).toBe(200);
        expect(acc.renown).toBe(1020);       // hire 0 (unknown) + 20 (rank-up)
        expect(acc.roster_json.find((u: any) => u.id === "unit2")).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();

        expect(pushSpy).toHaveBeenCalledOnce();
        const pushed = pushSpy.mock.calls[0][0] as any;
        expect(pushed.total).toBe(1020);

        warnSpy.mockRestore();
    });

    it("still dismisses with no refund when template missing and unit is rank 1", async () => {
        const { session_key } = await loginPlayer("336");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        // unit1 is RANK 1, in the party. Unknown class + rank 1 → refund 0.
        acc.roster_json.find((u: any) => u.id === "unit1")!.entityClass = "ghost_class";
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const pushSpy = vi.spyOn(session, "pushData");

        const res = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "unit1" });

        expect(res.status).toBe(200);
        expect(acc.renown).toBe(1000);       // unchanged
        expect(acc.party_ids_json).not.toContain("unit1");
        expect(acc.roster_json.find((u: any) => u.id === "unit1")).toBeUndefined();
        const call = vi.mocked(saveRosterAndAddRenown).mock.calls[0];
        expect(call[2]).toBe(0);

        // Push still fires on success even when refund is 0 — keeps the contract simple.
        expect(pushSpy).toHaveBeenCalledOnce();
        const pushed = pushSpy.mock.calls[0][0] as any;
        expect(pushed.total).toBe(1000);

        warnSpy.mockRestore();
    });

    it("returns 404 for unknown unit_id", async () => {
        const { session_key } = await loginPlayer("332");
        const res = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "ghost" });
        expect(res.status).toBe(404);
    });

    it("returns 500 and leaves roster + renown unchanged when DB throws", async () => {
        const { session_key } = await loginPlayer("333");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const prevLen = session.accountData!.roster_json.length;
        const prevRenown = session.accountData!.renown;
        const pushSpy = vi.spyOn(session, "pushData");

        vi.mocked(saveRosterAndAddRenown).mockRejectedValueOnce(new Error("db down"));

        const res = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "unit2" });

        expect(res.status).toBe(500);
        expect(session.accountData!.roster_json).toHaveLength(prevLen);
        expect(session.accountData!.renown).toBe(prevRenown);
        expect(pushSpy).not.toHaveBeenCalled();
    });
});

// ──────────────────────────────────────────────
// unit/hire
// ──────────────────────────────────────────────
describe("POST /services/roster/unit/hire/:session_key", () => {
    it("hires a unit, appends it to the roster, deducts renown", async () => {
        const { session_key } = await loginPlayer("340");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        const prevLen = acc.roster_json.length;
        const prevRenown = acc.renown;

        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "archer", new_unit_id: "archer_anything", new_unit_name: "Gunnar" });

        expect(res.status).toBe(200);
        expect(acc.roster_json).toHaveLength(prevLen + 1);
        expect(acc.renown).toBeLessThanOrEqual(prevRenown);
        expect(vi.mocked(saveRosterAndSpendRenown)).toHaveBeenCalledOnce();
    });

    it("returns 404 for unknown purchasable_unit_id", async () => {
        const { session_key } = await loginPlayer("341");
        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "unknown_class", new_unit_id: "x_start_0", new_unit_name: "x" });
        expect(res.status).toBe(404);
    });

    it("allows hiring when renown is 0 since cost is 0", async () => {
        const { session_key } = await loginPlayer("342");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.renown = 0;

        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "archer", new_unit_id: "x_start_0", new_unit_name: "x" });
        expect(res.status).toBe(200);
    });

    it("returns 400 when barracks are full", async () => {
        const { session_key } = await loginPlayer("343");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        // Capacity is roster_rows * 9. Set roster_rows so length == capacity.
        // Pad with placeholders so we don't exceed an integer roster_rows.
        const targetRows = Math.ceil(acc.roster_json.length / 9) || 1;
        while (acc.roster_json.length < targetRows * 9) {
            acc.roster_json.push({ id: `pad_${acc.roster_json.length}`, entityClass: "archer", stats: [] });
        }
        acc.roster_rows = targetRows;

        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "archer", new_unit_id: "x_start_0", new_unit_name: "x" });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("barracks full");
    });

    it("auto-numbers the ID when a _start_ prefix already has entries", async () => {
        const { session_key } = await loginPlayer("344");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        acc.roster_json.push({ id: "archer_start_0", entityClass: "archer", stats: [] });
        acc.roster_json.push({ id: "archer_start_1", entityClass: "archer", stats: [] });

        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "archer", new_unit_id: "archer_anything", new_unit_name: "Third" });

        expect(res.status).toBe(200);
        const ids = acc.roster_json.map((u: any) => u.id);
        expect(ids).toContain("archer_start_2");
    });

    it("returns 400 when the resolved unit ID already exists in the roster", async () => {
        const { session_key } = await loginPlayer("345");
        const session = sessionHandler.getSession("session_key", session_key)!;
        // Plant archer_start_0 so the auto-numbered ID collides
        session.accountData!.roster_json.push({ id: "archer_start_0", entityClass: "archer", stats: [] });

        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "archer", new_unit_id: "archer_start_0", new_unit_name: "Dupe" });

        expect(res.status).toBe(400);
    });

    it("fills the gap left by a retired unit instead of colliding (regression: dismiss then 'unable to hire')", async () => {
        const { session_key } = await loginPlayer("346");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        // Mirror the broken account 123456: axeman_start_0 was dismissed, leaving a
        // gap at index 0 (slots 1 and 2 survive). The old count-based scheme computed
        // prefix + count = axeman_start_2, which still exists → 400 "unit ID already
        // exists" → client showed "unable to hire axeman".
        acc.roster_json.push({ id: "axeman_start_1", entityClass: "axeman", stats: [] });
        acc.roster_json.push({ id: "axeman_start_2", entityClass: "axeman", stats: [] });

        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "axeman", new_unit_id: "axeman_anything", new_unit_name: "GapFiller" });

        expect(res.status).toBe(200);
        const ids = acc.roster_json.map((u: any) => u.id);
        expect(ids).toContain("axeman_start_0"); // lowest free slot, not a collision
    });

    it("lets you re-hire after dismissing a unit from the start of a class sequence (full retire → hire flow)", async () => {
        const { session_key } = await loginPlayer("347");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        acc.roster_json.push({ id: "axeman_start_0", entityClass: "axeman", stats: [{ stat: "RANK", value: 1 }] });
        acc.roster_json.push({ id: "axeman_start_1", entityClass: "axeman", stats: [{ stat: "RANK", value: 1 }] });
        acc.roster_json.push({ id: "axeman_start_2", entityClass: "axeman", stats: [{ stat: "RANK", value: 1 }] });

        // Dismiss the lowest-numbered axeman → leaves the {1,2} gap that broke hiring.
        const retire = await request(app)
            .post(`/services/roster/unit/retire/${session_key}`)
            .send({ unit_id: "axeman_start_0" });
        expect(retire.status).toBe(200);

        const hire = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "axeman", new_unit_id: "axeman_anything", new_unit_name: "Reborn" });

        expect(hire.status).toBe(200);
        const ids = acc.roster_json.map((u: any) => u.id);
        expect(ids).toContain("axeman_start_0"); // gap refilled, no collision
    });
});

// ──────────────────────────────────────────────
// unit/stats/purchase
// ──────────────────────────────────────────────
describe("POST /services/roster/unit/stats/purchase/:session_key", () => {
    it("applies a single valid stat delta", async () => {
        const { session_key } = await loginPlayer("350");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [2] });

        expect(res.status).toBe(200);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr + 2);
        expect(vi.mocked(saveRoster)).toHaveBeenCalledOnce();
    });

    it("accepts delta = 0 as a no-op (issue #71 — client sometimes includes unchanged stats in a batched confirm)", async () => {
        const { session_key } = await loginPlayer("351");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [0] });

        expect(res.status).toBe(200);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr);
        expect(vi.mocked(saveRoster)).toHaveBeenCalledOnce();
    });

    it("returns 400 for delta > 20", async () => {
        const { session_key } = await loginPlayer("352");
        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [21] });
        expect(res.status).toBe(400);
    });

    it("applies a batched delta of 6 (issue #71 regression — old code 400'd anything > 5)", async () => {
        const { session_key } = await loginPlayer("380");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [6] });

        expect(res.status).toBe(200);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr + 6);
        expect(vi.mocked(saveRoster)).toHaveBeenCalledOnce();
    });

    it("applies a batched delta of 20 at the upper bound", async () => {
        const { session_key } = await loginPlayer("381");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [20] });

        expect(res.status).toBe(200);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr + 20);
    });

    it("returns 400 for delta < 0 (negative — refunds belong on /unit/stats/reset)", async () => {
        const { session_key } = await loginPlayer("382");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [-1] });

        expect(res.status).toBe(400);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr);
    });

    it("mixed batch with one zero-delta and one non-zero delta applies only the non-zero", async () => {
        const { session_key } = await loginPlayer("383");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;
        const originalArm = unit.stats.find((s: any) => s.stat === "ARMOR").value;

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH", "ARMOR"], deltas: [0, 3] });

        expect(res.status).toBe(200);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr);
        expect(unit.stats.find((s: any) => s.stat === "ARMOR").value).toBe(originalArm + 3);
        expect(vi.mocked(saveRoster)).toHaveBeenCalledOnce();
    });

    it("rejects a batch where one stat is over-cap (validate-all-before-mutate)", async () => {
        const { session_key } = await loginPlayer("384");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;
        const originalArm = unit.stats.find((s: any) => s.stat === "ARMOR").value;

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH", "ARMOR"], deltas: [3, 21] });

        expect(res.status).toBe(400);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr);
        expect(unit.stats.find((s: any) => s.stat === "ARMOR").value).toBe(originalArm);
        expect(vi.mocked(saveRoster)).not.toHaveBeenCalled();
    });

    it("returns 400 for a non-integer delta", async () => {
        const { session_key } = await loginPlayer("353");
        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [1.5] });
        expect(res.status).toBe(400);
    });

    it("returns 400 for duplicate stat names", async () => {
        const { session_key } = await loginPlayer("354");
        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH", "STRENGTH"], deltas: [1, 1] });
        expect(res.status).toBe(400);
    });

    it("returns 400 for an unknown stat name", async () => {
        const { session_key } = await loginPlayer("355");
        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["INVISIBLE_STAT"], deltas: [1] });
        expect(res.status).toBe(400);
    });

    it("returns 404 for unknown unit_id", async () => {
        const { session_key } = await loginPlayer("356");
        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "ghost", stats: ["STRENGTH"], deltas: [1] });
        expect(res.status).toBe(404);
    });

    it("reverts all stat values when DB throws", async () => {
        const { session_key } = await loginPlayer("357");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        const originalStr = unit.stats.find((s: any) => s.stat === "STRENGTH").value;

        vi.mocked(saveRoster).mockRejectedValueOnce(new Error("db down"));

        const res = await request(app)
            .post(`/services/roster/unit/stats/purchase/${session_key}`)
            .send({ unit_id: "unit1", stats: ["STRENGTH"], deltas: [3] });

        expect(res.status).toBe(500);
        expect(unit.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(originalStr);
    });
});

// ──────────────────────────────────────────────
// unlock (expand barracks)
// ──────────────────────────────────────────────
describe("POST /services/roster/unlock/:session_key", () => {
    it("increments roster_rows and deducts 60 renown", async () => {
        const { session_key } = await loginPlayer("360");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const acc = session.accountData!;
        acc.roster_rows = 5; // below MAX_ROSTER_ROWS=8 so the unlock is allowed
        const prevRows = acc.roster_rows;
        const prevRenown = acc.renown;

        const res = await request(app).post(`/services/roster/unlock/${session_key}`);

        expect(res.status).toBe(200);
        expect(acc.roster_rows).toBe(prevRows + 1);
        expect(acc.renown).toBe(prevRenown - 60);
    });

    it("returns 402 when renown < 60 before the DB call", async () => {
        const { session_key } = await loginPlayer("361");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.roster_rows = 5;
        session.accountData!.renown = 59;

        const res = await request(app).post(`/services/roster/unlock/${session_key}`);
        expect(res.status).toBe(402);
        expect(vi.mocked(expandBarracks)).not.toHaveBeenCalled();
    });

    it("returns 402 when expandBarracks returns false (race condition at DB level)", async () => {
        const { session_key } = await loginPlayer("362");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.roster_rows = 5;
        vi.mocked(expandBarracks).mockResolvedValueOnce(false);

        const res = await request(app).post(`/services/roster/unlock/${session_key}`);
        expect(res.status).toBe(402);
    });

    it("returns 500 when expandBarracks throws", async () => {
        const { session_key } = await loginPlayer("363");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.roster_rows = 5;
        vi.mocked(expandBarracks).mockRejectedValueOnce(new Error("db down"));

        const res = await request(app).post(`/services/roster/unlock/${session_key}`);
        expect(res.status).toBe(500);
    });

    it("returns 400 when roster_rows already at MAX_ROSTER_ROWS", async () => {
        const { session_key } = await loginPlayer("364");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.roster_rows = 8; // MAX_ROSTER_ROWS
        const prevRenown = session.accountData!.renown;

        const res = await request(app).post(`/services/roster/unlock/${session_key}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("max");
        expect(vi.mocked(expandBarracks)).not.toHaveBeenCalled();
        expect(session.accountData!.renown).toBe(prevRenown); // no renown deducted
    });
});

describe("POST /services/roster/unit/stats/reset/:session_key", () => {
    it("restores unit stats to the purchasable_units template defaults", async () => {
        const { session_key } = await loginPlayer("370");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        unit.stats.find((s: any) => s.stat === "STRENGTH")!.value = 99;

        const res = await request(app)
            .post(`/services/roster/unit/stats/reset/${session_key}`)
            .send({ unit_id: "unit1" });

        expect(res.status).toBe(200);
        const reset = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        expect(reset.stats.find((s: any) => s.stat === "STRENGTH").value).toBe(7);
        expect(reset.stats.find((s: any) => s.stat === "RANK").value).toBe(1);
        expect(reset.stats.length).toBeGreaterThan(2);
        expect(vi.mocked(saveRoster)).toHaveBeenCalledOnce();
    });

    it("returns 400 when unit_id is missing", async () => {
        const { session_key } = await loginPlayer("371");
        const res = await request(app)
            .post(`/services/roster/unit/stats/reset/${session_key}`)
            .send({});
        expect(res.status).toBe(400);
        expect(vi.mocked(saveRoster)).not.toHaveBeenCalled();
    });

    it("returns 404 when unit is not in the roster", async () => {
        const { session_key } = await loginPlayer("372");
        const res = await request(app)
            .post(`/services/roster/unit/stats/reset/${session_key}`)
            .send({ unit_id: "missing_unit" });
        expect(res.status).toBe(404);
        expect(vi.mocked(saveRoster)).not.toHaveBeenCalled();
    });

    it("rolls back in-memory stats when saveRoster throws", async () => {
        const { session_key } = await loginPlayer("373");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        unit.stats.find((s: any) => s.stat === "STRENGTH")!.value = 99;
        const before = unit.stats.map((s: any) => ({ ...s }));

        vi.mocked(saveRoster).mockRejectedValueOnce(new Error("db down"));

        const res = await request(app)
            .post(`/services/roster/unit/stats/reset/${session_key}`)
            .send({ unit_id: "unit1" });

        expect(res.status).toBe(500);
        const after = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        expect(after.stats).toEqual(before);
    });
});
