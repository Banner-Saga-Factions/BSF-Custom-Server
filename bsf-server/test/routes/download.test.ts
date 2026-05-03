import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { loginPlayer } from "../helpers";

vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockResolvedValue({
        user_id: 123,
        username: "testplayer",
        renown: 100,
        daily_login_streak: 1,
        login_count: 1,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [],
        party_ids_json: [],
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

describe("GET /services/download/checksum/:session_key", () => {
    it("returns 404 when factions.tar.gz is absent", async () => {
        const { session_key } = await loginPlayer("700");
        const res = await request(app).get(`/services/download/checksum/${session_key}`);
        expect(res.status).toBe(404);
    });
});

describe("GET /services/download/:session_key", () => {
    it("returns 404 when factions.tar.gz is absent", async () => {
        const { session_key } = await loginPlayer("701");
        const res = await request(app).get(`/services/download/${session_key}`);
        expect(res.status).toBe(404);
    });
});
