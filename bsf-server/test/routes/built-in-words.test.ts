import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { loginPlayer } from "../helpers";

// #311: every game request ends in the player's sign-in key, and a battle request also names its
// battle. The server looks both up in lists it keeps in memory. A few words are built into every
// ordinary JavaScript object, so a list made as an ordinary object answered to those words even
// though nobody had put them there. These tests check that each such word is treated like any
// other sign-in key or battle the server does not know.

const BUILT_IN_WORDS = ["constructor", "__proto__", "toString"];

vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockResolvedValue({
        user_id: 311,
        username: "testplayer",
        renown: 100,
        daily_login_streak: 1,
        login_count: 1,
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

describe("built-in words in a request (#311)", () => {
    it.each(BUILT_IN_WORDS)("a built-in word (%s) is never taken for a signed-in player", async (word) => {
        const res = await request(app).get(`/services/account/info/${word}`);
        // 403 ("forbidden") is the answer for anything not shaped like a sign-in key. Unlike 401,
        // the game does not read it as "you have been signed out".
        expect(res.status).toBe(403);
    });

    it.each(BUILT_IN_WORDS)(
        "a built-in word (%s) as a battle id is answered like any battle the server does not hold",
        async (word) => {
            const { session_key } = await loginPlayer("311");
            const unknown = await request(app)
                .post(`/services/battle/exit/${session_key}`)
                .send({ battle_id: "no-such-battle" });
            const builtIn = await request(app)
                .post(`/services/battle/exit/${session_key}`)
                .send({ battle_id: word });
            // Compared with each other, not with a fixed number: #164 changes what a battle the
            // server does not hold is answered, and this check must hold before and after it.
            expect(builtIn.status).toBe(unknown.status);
        }
    );
});
