import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { markTutorialComplete } from "../../src/db/account";
import { loginPlayer } from "../helpers";

vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockResolvedValue({
        user_id: 123,
        username: "testplayer",
        renown: 100,
        daily_login_streak: 1,
        login_count: 5,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [
            { id: "unit1", entityClass: "Archer",  stats: [{ stat: "RANK", value: 1 }] },
            { id: "unit2", entityClass: "Warrior", stats: [{ stat: "RANK", value: 2 }] },
        ],
        party_ids_json: ["unit1", "unit2"],
    }),
    addRenown: vi.fn().mockResolvedValue(undefined),
    markTutorialComplete: vi.fn().mockResolvedValue(undefined),
    saveParty: vi.fn().mockResolvedValue(undefined),
    saveRoster: vi.fn().mockResolvedValue(undefined),
    saveRosterAndSpendRenown: vi.fn().mockResolvedValue(undefined),
    saveRosterAndParty: vi.fn().mockResolvedValue(undefined),
    expandBarracks: vi.fn().mockResolvedValue(true),
    getAccountByUserId: vi.fn().mockResolvedValue(null),
    getAccountById: vi.fn().mockResolvedValue(null),
    parseRow: vi.fn(),
}));

beforeEach(() => {
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
});

describe("GET /services/account/info/:session_key", () => {
    it("returns the correct shape with all required fields", async () => {
        const { session_key } = await loginPlayer("100");
        const res = await request(app).get(`/services/account/info/${session_key}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("roster");
        expect(res.body).toHaveProperty("party");
        expect(res.body).toHaveProperty("purchasable_units");
        expect(res.body).toHaveProperty("renown");
        expect(res.body).toHaveProperty("roster_rows");
    });

    it("includes roster.defs and party.ids", async () => {
        const { session_key } = await loginPlayer("101");
        const res = await request(app).get(`/services/account/info/${session_key}`);

        expect(res.body.roster).toHaveProperty("defs");
        expect(Array.isArray(res.body.roster.defs)).toBe(true);
        expect(res.body.party).toHaveProperty("ids");
        expect(Array.isArray(res.body.party.ids)).toBe(true);
    });

    it("returns 401 when accountData is null (race condition guard)", async () => {
        const { session_key } = await loginPlayer("102");

        // Simulate the race: session exists but accountData wasn't populated yet
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData = null;

        const res = await request(app).get(`/services/account/info/${session_key}`);
        expect(res.status).toBe(401);
    });
});

describe("POST /services/account/update/:session_key", () => {
    it("returns 200 for a valid party update", async () => {
        const { session_key } = await loginPlayer("200");
        const res = await request(app)
            .post(`/services/account/update/${session_key}`)
            .send({ session_key, party: { ids: ["unit1", "unit2"] } });

        expect(res.status).toBe(200);
    });

    it("returns 400 when party size exceeds 6", async () => {
        const { session_key } = await loginPlayer("201");
        const res = await request(app)
            .post(`/services/account/update/${session_key}`)
            .send({ session_key, party: { ids: ["u1", "u2", "u3", "u4", "u5", "u6", "u7"] } });

        expect(res.status).toBe(400);
    });

    it("returns 400 when party references unit IDs not in the roster", async () => {
        const { session_key } = await loginPlayer("202");
        const res = await request(app)
            .post(`/services/account/update/${session_key}`)
            .send({ session_key, party: { ids: ["unit-not-in-roster"] } });

        expect(res.status).toBe(400);
    });

    it("returns 400 when a roster def has an empty id", async () => {
        const { session_key } = await loginPlayer("203");
        const res = await request(app)
            .post(`/services/account/update/${session_key}`)
            .send({ session_key, roster: { defs: [{ id: "", entityClass: "Archer", stats: [] }] } });

        expect(res.status).toBe(400);
    });

    it("returns 400 when party.ids is not an array", async () => {
        const { session_key } = await loginPlayer("204");
        const res = await request(app)
            .post(`/services/account/update/${session_key}`)
            .send({ session_key, party: { ids: "not-an-array" } });

        expect(res.status).toBe(400);
    });

    it("does not overwrite roster_rows when updating roster (preserves paid barracks capacity)", async () => {
        const { session_key } = await loginPlayer("205");
        const session = sessionHandler.getSession("session_key", session_key)!;
        // Simulate a player who paid for two barracks expansions
        session.accountData!.roster_rows = 15;

        await request(app)
            .post(`/services/account/update/${session_key}`)
            .send({ roster: { defs: session.accountData!.roster_json } });

        expect(session.accountData!.roster_rows).toBe(15);
    });
});

describe("POST /services/account/tutorial/:session_key", () => {
    it("flips completed_tutorial from false to true and persists the change", async () => {
        const { session_key } = await loginPlayer("300");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.completed_tutorial = false;
        vi.mocked(markTutorialComplete).mockClear();

        const res = await request(app).post(`/services/account/tutorial/${session_key}`);

        expect(res.status).toBe(200);
        expect(session.accountData!.completed_tutorial).toBe(true);
        expect(markTutorialComplete).toHaveBeenCalledTimes(1);
        expect(markTutorialComplete).toHaveBeenCalledWith(session.steam_id_str);
    });

    it("is idempotent — no DB write when already completed", async () => {
        const { session_key } = await loginPlayer("301");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.completed_tutorial = true;
        vi.mocked(markTutorialComplete).mockClear();

        const res = await request(app).post(`/services/account/tutorial/${session_key}`);

        expect(res.status).toBe(200);
        expect(markTutorialComplete).not.toHaveBeenCalled();
    });

    it("returns 401 when accountData is null", async () => {
        const { session_key } = await loginPlayer("302");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData = null;

        const res = await request(app).post(`/services/account/tutorial/${session_key}`);
        expect(res.status).toBe(401);
    });

    it("returns 500 when the DB write fails and leaves the in-memory flag unchanged", async () => {
        const { session_key } = await loginPlayer("303");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.accountData!.completed_tutorial = false;
        vi.mocked(markTutorialComplete).mockClear();
        vi.mocked(markTutorialComplete).mockRejectedValueOnce(new Error("simulated DB failure"));

        const res = await request(app).post(`/services/account/tutorial/${session_key}`);

        expect(res.status).toBe(500);
        expect(session.accountData!.completed_tutorial).toBe(false);
    });
});
