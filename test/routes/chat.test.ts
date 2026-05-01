import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { battleHandler } from "../../src/services/battle/Battle";
import { gameQueue } from "../../src/services/queue";
import { loginPlayer } from "../helpers";

vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockImplementation(async (steam_id: string) => ({
        user_id: Number(steam_id),
        username: `player_${steam_id}`,
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
    })),
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
    battleHandler.getBattles().forEach((b) => battleHandler.removeBattle(b.battle_id));
});

describe("POST /services/chat/global/:session_key", () => {
    it("delivers the message to all connected sessions", async () => {
        const a = await loginPlayer("601");
        const b = await loginPlayer("602");

        const sessionA = sessionHandler.getSession("session_key", a.session_key)!;
        const sessionB = sessionHandler.getSession("session_key", b.session_key)!;

        // Clear initial poll data so we can detect only the chat message
        sessionA.data = [];
        sessionB.data = [];

        const res = await request(app)
            .post(`/services/chat/global/${a.session_key}`)
            .set("Content-Type", "text/plain")
            .send("hello world");

        expect(res.status).toBe(200);
        expect(sessionA.data).toHaveLength(1);
        expect(sessionA.data[0]).toMatchObject({ msg: "hello world", room: "global" });
        expect(sessionB.data).toHaveLength(1);
        expect(sessionB.data[0]).toMatchObject({ msg: "hello world", room: "global" });
    });
});

describe("POST /services/chat/:room/:session_key (battle room)", () => {
    it("delivers the message only to battle participants", async () => {
        const a = await loginPlayer("603");
        const b = await loginPlayer("604");
        const c = await loginPlayer("605");

        // Create a battle between a and b
        await request(app)
            .post(`/services/vs/start/${a.session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });
        await request(app)
            .post(`/services/vs/start/${b.session_key}`)
            .send({ vs_type: "QUICK", match_handle: 1 });

        const battle = battleHandler.getBattles().find((bt) => a.session_key in bt.parties)!;
        expect(battle).toBeDefined();

        const sessionA = sessionHandler.getSession("session_key", a.session_key)!;
        const sessionB = sessionHandler.getSession("session_key", b.session_key)!;
        const sessionC = sessionHandler.getSession("session_key", c.session_key)!;

        sessionA.data = [];
        sessionB.data = [];
        sessionC.data = [];

        const res = await request(app)
            .post(`/services/chat/${battle.battle_id}/${a.session_key}`)
            .set("Content-Type", "text/plain")
            .send("battle chat");

        expect(res.status).toBe(200);
        expect(sessionA.data).toHaveLength(1);
        expect(sessionB.data).toHaveLength(1);
        // c is not in the battle — should receive nothing
        expect(sessionC.data).toHaveLength(0);
    });

    it("sends nothing when the session has no battle_id", async () => {
        const a = await loginPlayer("606");
        const b = await loginPlayer("607");

        const sessionB = sessionHandler.getSession("session_key", b.session_key)!;
        sessionB.data = [];

        // room is a non-"global" string but session.battle_id is undefined
        const res = await request(app)
            .post(`/services/chat/some-room/${a.session_key}`)
            .set("Content-Type", "text/plain")
            .send("lost message");

        expect(res.status).toBe(200);
        expect(sessionB.data).toHaveLength(0);
    });
});
