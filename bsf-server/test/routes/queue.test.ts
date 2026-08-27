import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { gameQueue } from "../../src/services/queue";
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
    gameQueue.length = 0;
});

describe("POST /services/vs/start/:session_key", () => {
    it("adds the player to the queue and returns 200 with ServerStatusData", async () => {
        const { session_key } = await loginPlayer("300");
        const res = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]).toHaveProperty("class", "tbs.srv.data.ServerStatusData");
        expect(res.body[0]).toHaveProperty("session_count");
    });

    it("returns 409 when the player is already in the queue", async () => {
        const { session_key } = await loginPlayer("301");

        await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });

        const res = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });

        expect(res.status).toBe(409);
    });

    it("rejects a double-queue even for a large Steam ID where account_id != user_id (#23)", async () => {
        // For a Steam ID above STEAM_ID_BASE, session.account_id is the small 32-bit id,
        // distinct from the 64-bit user_id. Both the duplicate guard and the stored
        // QueueItem must key off account_id; this test pins the stored identity to
        // account_id so a regression that switched it to user_id would be caught.
        const { session_key } = await loginPlayer("76561197960265745");
        const session = sessionHandler.getSession("session_key", session_key)!;
        expect(session.account_id).not.toBe(session.user_id); // precondition: the ids really differ

        const first = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });
        expect(first.status).toBe(200);

        const second = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });
        expect(second.status).toBe(409);

        expect(gameQueue.length).toBe(1);
        expect(gameQueue[0].account_id).toBe(session.account_id); // stored by account_id (16), not the big user_id
    });

    it("returns 400 for an unknown vs_type", async () => {
        const { session_key } = await loginPlayer("302");
        const res = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "UNKNOWN_MODE", match_handle: 1 });

        expect(res.status).toBe(400);
    });

    // #205 — the request the friend lobby actually sends. Before this, the server
    // answered 400 and both players sat on a spinner with nothing on screen to say why.
    it("accepts a friend match and remembers who was asked for and where", async () => {
        const { session_key } = await loginPlayer("304");
        const session = sessionHandler.getSession("session_key", session_key)!;

        const res = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "FRIEND", forcematch: 999, scene: "beach", match_handle: 1 });

        expect(res.status).toBe(200);
        expect(gameQueue).toHaveLength(1);
        expect(gameQueue[0].forcematch).toBe(999);
        expect(gameQueue[0].scene).toBe("beach");
        expect(gameQueue[0].account_id).toBe(session.account_id);
    });

    it("treats a missing or nonsense opponent as no preference", async () => {
        const { session_key } = await loginPlayer("305");

        const res = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "QUICK", forcematch: "not-a-number", match_handle: 1 });

        expect(res.status).toBe(200);
        expect(gameQueue[0].forcematch).toBe(0);
        expect(gameQueue[0].scene).toBe("");
    });

    // Asking to play yourself can never be satisfied, so it is refused outright
    // rather than left to sit until the five-minute queue timeout.
    it("returns 400 when a player asks to play themselves", async () => {
        const { session_key } = await loginPlayer("306");
        const session = sessionHandler.getSession("session_key", session_key)!;

        const res = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "FRIEND", forcematch: session.account_id, match_handle: 1 });

        expect(res.status).toBe(400);
        expect(gameQueue).toHaveLength(0);
    });

    it("session_count reflects current queue size", async () => {
        const { session_key } = await loginPlayer("303");
        const res = await request(app)
            .post(`/services/vs/start/${session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });

        expect(res.body[0].session_count).toBe(1);
    });
});
