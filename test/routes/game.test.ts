import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

afterEach(() => {
    vi.useRealTimers();
});

describe("POST /services/game/leaderboards/:session_key", () => {
    it("returns 200 with leaderboard JSON", async () => {
        const { session_key } = await loginPlayer("800");
        const res = await request(app).post(`/services/game/leaderboards/${session_key}`);
        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();
    });
});

describe("GET /services/game/:session_key (long-poll)", () => {
    it("flushes buffered data immediately (Path A)", async () => {
        const { session_key } = await loginPlayer("801");
        const session = sessionHandler.getSession("session_key", session_key)!;

        // Seed specific data so we can verify it comes back
        session.data = [{ class: "test_event", value: 42 }];

        const res = await request(app).get(`/services/game/${session_key}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ class: "test_event" })]));
        expect(session.data).toHaveLength(0);
    });

    it("returns 429 when a concurrent poll is already active", async () => {
        const { session_key } = await loginPlayer("802");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.data = [];

        // Simulate an already-running poll
        session.pollingActive = true;

        const res = await request(app).get(`/services/game/${session_key}`);
        expect(res.status).toBe(429);

        session.pollingActive = false;
    });

    it("flushes data that arrives mid-poll before the timeout", async () => {
        const { session_key } = await loginPlayer("804");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.data = [];

        const responsePromise = request(app).get(`/services/game/${session_key}`);

        // Push data after the server starts waiting
        setImmediate(() => {
            session.pushData({ class: "mid_poll_event" });
        });

        const res = await responsePromise;
        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.arrayContaining([expect.objectContaining({ class: "mid_poll_event" })])
        );
    });
});

describe("POST /services/game/location/:session_key", () => {
    it("returns 200 (no-op location update)", async () => {
        const { session_key } = await loginPlayer("805");
        const res = await request(app).post(`/services/game/location/${session_key}`).send({});
        expect(res.status).toBe(200);
    });
});
