import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { loginPlayer } from "../helpers";

// vi.mock is hoisted to the top of the file by vitest before any imports run.
// That means imported variables (like MOCK_ACCOUNT_ROW from helpers) don't exist yet.
// Solution: define all mock return values as inline object literals — no external references.
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

describe("POST /services/auth/login/11", () => {
    it("returns session_key, user_id, display_name, build_number for a valid steam_id", async () => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({ steam_id: "123" });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("session_key");
        expect(res.body).toHaveProperty("user_id");
        expect(res.body).toHaveProperty("display_name");
        expect(res.body).toHaveProperty("build_number");
    });

    it("returns 400 for a non-numeric steam_id", async () => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({ steam_id: "not-a-number" });

        expect(res.status).toBe(400);
    });

    it("returns 400 when steam_id is missing", async () => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({});

        expect(res.status).toBe(400);
    });
});

describe("POST /services/auth/logout/:session_key", () => {
    it("removes the session — subsequent requests return 403", async () => {
        const { session_key } = await loginPlayer("456");

        const logout = await request(app).post(`/services/auth/logout/${session_key}`);
        expect(logout.status).toBe(200);

        const after = await request(app).get(`/services/account/info/${session_key}`);
        expect(after.status).toBe(403);
    });
});

describe("Session middleware", () => {
    it("returns 403 for a request with an unknown session key", async () => {
        const res = await request(app).get("/services/account/info/nonexistent-key");
        expect(res.status).toBe(403);
    });

    it("passes through for a valid session key", async () => {
        const { session_key } = await loginPlayer("789");
        const res = await request(app).get(`/services/account/info/${session_key}`);
        expect(res.status).not.toBe(403);
    });

    it("returns 200 for the captured steam overlay shape without any session key", async () => {
        const res = await request(app).get("/services/session/steam/overlay/abc123/true");
        expect(res.status).toBe(200);
    });

    it("returns 403 for non-overlay paths under /steam/overlay/ (Issue #55, no prefix bypass)", async () => {
        const res = await request(app).get("/services/session/steam/overlay/anything");
        expect(res.status).toBe(403);
    });

    it("returns 403 for a malformed Bearer token, not 500", async () => {
        const res = await request(app)
            .post("/services/vs/start/bad-token")
            .set("Authorization", "Bearer this.is.not.a.valid.jwt");
        expect(res.status).toBe(403);
    });
});
