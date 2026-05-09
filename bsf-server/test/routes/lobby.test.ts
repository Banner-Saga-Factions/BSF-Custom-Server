import { describe, it, expect, beforeEach, vi } from "vitest";
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

// All /services/lobby/* routes are stateless 200 stubs. Real lobby state is tracked
// as a follow-up issue; these tests only verify the catch-all returns 200 for every
// shape the decompiled client uses (LobbyTxn, LobbyOptionsTxn, LobbyInviteTxn).
describe("POST /services/lobby/*", () => {
    it.each([
        "join",
        "exit",
        "ready",
        "unready",
        "decline",
        "uninvite",
        "options",
        "invite",
    ])("returns 200 for /lobby/%s/<session_key>", async (action) => {
        const { session_key } = await loginPlayer(`8${action.length}0`);

        const res = await request(app)
            .post(`/services/lobby/${action}/${session_key}`)
            .send({});

        expect(res.status).toBe(200);
    });
});
