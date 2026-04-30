import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { gameQueue } from "../../src/services/queue";
import { battleHandler } from "../../src/services/battle/Battle";
import { loginPlayer } from "../helpers";

// upsertAccount returns user_id=Number(steam_id) so each player gets a distinct
// account_id — required for aliveUnits and killedparty/killerparty to make sense.
vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockImplementation(async (steam_id: string) => ({
        user_id: Number(steam_id),
        username: `player_${steam_id}`,
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

// Logs in two players with distinct steam_ids and queues both so matchmaking
// creates a battle. Returns session login data plus the live Battle object.
async function createMatch() {
    const a = await loginPlayer("501");
    const b = await loginPlayer("502");

    await request(app)
        .post(`/services/vs/start/${a.session_key}`)
        .send({ vs_type: "QUICK", match_handle: 1 });

    await request(app)
        .post(`/services/vs/start/${b.session_key}`)
        .send({ vs_type: "QUICK", match_handle: 1 });

    const battle = battleHandler.getBattles().find((b) => a.session_key in b.parties)!;
    return { a, b, battle };
}

describe("POST /battle/killed/:session_key", () => {
    it("returns 200 and removes the killed unit from aliveUnits", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        const res = await request(app)
            .post(`/services/battle/killed/${a.session_key}`)
            .send({
                battle_id: battle.battle_id,
                entity: "unit1",
                turn: 0,
                ordinal: 0,
                killedparty: bSession.account_id,
                killer: "unit1",
                killerparty: aSession.account_id,
            });

        expect(res.status).toBe(200);
        expect(battle.aliveUnits[String(bSession.account_id)]).not.toContain("unit1");
    });

    it("final kill sets battle.winner to the killer's account_id", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        const body = (entity: string) => ({
            battle_id: battle.battle_id,
            entity,
            turn: 0,
            ordinal: 0,
            killedparty: bSession.account_id,
            killer: "unit1",
            killerparty: aSession.account_id,
        });

        await request(app).post(`/services/battle/killed/${a.session_key}`).send(body("unit1"));
        const res = await request(app).post(`/services/battle/killed/${a.session_key}`).send(body("unit2"));

        expect(res.status).toBe(200);
        expect(battle.winner).toBe(aSession.account_id);
    });

    it("returns 404 when battle_id is unknown", async () => {
        const { a } = await createMatch();

        const res = await request(app)
            .post(`/services/battle/killed/${a.session_key}`)
            .send({
                battle_id: "no-such-battle",
                entity: "unit1",
                turn: 0,
                ordinal: 0,
                killedparty: 502,
                killer: "unit1",
                killerparty: 501,
            });

        expect(res.status).toBe(404);
    });

    it("returns 410 when opponent has disconnected", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;
        sessionHandler.removeSession(b.session_key);

        const res = await request(app)
            .post(`/services/battle/killed/${a.session_key}`)
            .send({
                battle_id: battle.battle_id,
                entity: "unit1",
                turn: 0,
                ordinal: 0,
                killedparty: bSession.account_id,
                killer: "unit1",
                killerparty: aSession.account_id,
            });

        expect(res.status).toBe(410);
        // Middleware blocked the request — aliveUnits must not have been mutated
        expect(battle.aliveUnits[String(bSession.account_id)]).toContain("unit1");
    });
});

describe("POST /battle/exit/:session_key", () => {
    it("returns success when both players are present", async () => {
        const { a, battle } = await createMatch();

        const res = await request(app)
            .post(`/services/battle/exit/${a.session_key}`)
            .send({ battle_id: battle.battle_id });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("status", "success");
    });

    it("returns 200 when opponent has already disconnected", async () => {
        const { a, b, battle } = await createMatch();
        sessionHandler.removeSession(b.session_key);

        const res = await request(app)
            .post(`/services/battle/exit/${a.session_key}`)
            .send({ battle_id: battle.battle_id });

        expect(res.status).toBe(200);
    });
});
