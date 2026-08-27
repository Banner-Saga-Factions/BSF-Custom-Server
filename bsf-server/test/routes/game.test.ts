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

    it("builds the LeaderboardsData shape and honors requested board_ids", async () => {
        const { session_key } = await loginPlayer("810");
        const res = await request(app)
            .post(`/services/game/leaderboards/${session_key}`)
            .send({ tourney_id: 0, board_ids: ["ELO"] });
        expect(res.status).toBe(200);
        expect(res.body.class).toBe("tbs.srv.data.LeaderboardsData");
        expect(res.body.boards).toHaveLength(1);
        expect(res.body.boards[0].leaderboard_type).toBe("ELO");
        expect(Array.isArray(res.body.boards[0].display_names)).toBe(true);
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

    it("resets pollingActive and preserves buffered data when client disconnects mid-poll", async () => {
        const { session_key } = await loginPlayer("806");
        const session = sessionHandler.getSession("session_key", session_key)!;
        session.data = [];

        // Start the long-poll request without awaiting — it enters Path B since data is empty.
        // Attach a no-op rejection handler to prevent unhandled-rejection noise on abort.
        const pollTest = request(app).get(`/services/game/${session_key}`);
        pollTest.then(() => {}, () => {});

        // HTTP request travels over the loopback socket — needs more than one event
        // loop tick to reach Express. Poll until pollingActive flips (up to 200ms).
        for (let i = 0; i < 20; i++) {
            if (session.pollingActive) break;
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        expect(session.pollingActive).toBe(true);

        // Abort the HTTP request — triggers req.on('close') on the server side
        pollTest.abort();

        // Allow the close event to propagate through the socket layer
        await new Promise<void>((resolve) => setTimeout(resolve, 20));

        expect(session.pollingActive).toBe(false);

        // Data pushed after disconnect must stay in the buffer, not be wiped
        session.pushData({ class: "survived_disconnect" });
        expect(session.data).toHaveLength(1);
        expect(session.data[0]).toMatchObject({ class: "survived_disconnect" });
    });
});

describe("POST /services/game/location/:session_key", () => {
    it("returns 200 for a location update", async () => {
        const { session_key } = await loginPlayer("805");
        const res = await request(app).post(`/services/game/location/${session_key}`).send({});
        expect(res.status).toBe(200);
    });
});
