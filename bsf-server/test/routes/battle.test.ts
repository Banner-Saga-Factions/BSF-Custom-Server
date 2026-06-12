import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { gameQueue } from "../../src/services/queue";
import { battleHandler } from "../../src/services/battle/Battle";
import { addRenown } from "../../src/db/account";
import { ServerClasses } from "../../src/const";
import { flushEndgame, loginPlayer } from "../helpers";

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

        // Backdate startedAt past the EXPERT timer (30s) so the asserted total
        // doesn't depend on test wall-clock variance across CI machines.
        battle.startedAt = new Date(Date.now() - 60_000);

        await request(app).post(`/services/battle/killed/${a.session_key}`).send(body("unit1"));
        const res = await request(app).post(`/services/battle/killed/${a.session_key}`).send(body("unit2"));

        expect(res.status).toBe(200);
        expect(battle.winner).toBe(aSession.account_id);

        // Let endgame's Promise.allSettled (ranking) + Promise.all (writes) chain
        // settle so BATTLE_FINISHED_DATA reaches the winner's session.data buffer.
        await flushEndgame();

        const finished = aSession.data.find((m: any) => m.class === ServerClasses.BATTLE_FINISHED_DATA);
        expect(finished).toBeDefined();
        // M1.5 Java values: winner KILLS=2 (× 1) + WIN=5 = 7. Loser killed nothing.
        // UNDERDOG=0 (matchmaking enforces equal power), STREAK=0 (mocked DB returns
        // win_streak=0 and party power=1<6), EXPERT=0 (startedAt backdated above).
        expect(finished.total_renown).toBe(7);
        expect(finished.victoriousTeam).toBe(String(aSession.account_id));
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

    it("notifies the survivor with BattleSurrenderData before BattleFinishedData", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        await request(app)
            .post(`/services/battle/exit/${a.session_key}`)
            .send({ battle_id: battle.battle_id });

        // endgame() is async; flush microtasks so BattleFinishedData also lands.
        await flushEndgame();

        const surrenderIdx = bSession.data.findIndex((m: any) => m.class === ServerClasses.BATTLE_SURRENDER_DATA);
        const finishedIdx  = bSession.data.findIndex((m: any) => m.class === ServerClasses.BATTLE_FINISHED_DATA);

        expect(surrenderIdx).toBeGreaterThanOrEqual(0);
        expect(finishedIdx).toBeGreaterThan(surrenderIdx);
        expect(bSession.data[surrenderIdx].user_id).toBe(aSession.account_id);
    });
});

// ──────────────────────────────────────────────
// Bug 4 — participant guard
// ──────────────────────────────────────────────
describe("BattleRouter participant guard", () => {
    it("returns 403 on /exit when the requester is not in the battle", async () => {
        const { battle } = await createMatch();
        const outsider = await loginPlayer("999");

        const res = await request(app)
            .post(`/services/battle/exit/${outsider.session_key}`)
            .send({ battle_id: battle.battle_id });

        expect(res.status).toBe(403);
    });

    it("returns 403 on /move when the requester is not in the battle", async () => {
        const { battle } = await createMatch();
        const outsider = await loginPlayer("998");

        const res = await request(app)
            .post(`/services/battle/move/${outsider.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0, tiles: [] });

        expect(res.status).toBe(403);
    });

    it("does not corrupt battle.winner when a non-participant hits /exit", async () => {
        const { battle } = await createMatch();
        const outsider = await loginPlayer("997");

        await request(app)
            .post(`/services/battle/exit/${outsider.session_key}`)
            .send({ battle_id: battle.battle_id });

        expect(battle.winner).toBeNull();
    });
});

// ──────────────────────────────────────────────
// Bug 2 — Steam ID precision loss
// ──────────────────────────────────────────────
describe("POST /battle/surrender/:session_key", () => {
    it("finalizes the battle with the surrendering player as loser", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        const res = await request(app)
            .post(`/services/battle/surrender/${a.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0 });

        expect(res.status).toBe(200);
        expect(battle.endgameStarted).toBe(true);
        expect(battle.winner).toBe(bSession.account_id);
        // Player A's party stays — /surrender does NOT delete it (the client follows up with /exit)
        expect(a.session_key in battle.parties).toBe(true);
    });

    it("notifies the winner with BattleSurrenderData before BattleFinishedData", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        await request(app)
            .post(`/services/battle/surrender/${a.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0 });

        // endgame() is async; let DB writes settle so BattleFinishedData also lands
        await flushEndgame();

        const surrenderIdx = bSession.data.findIndex(
            (m: any) => m.class === "tbs.srv.battle.data.client.BattleSurrenderData",
        );
        const finishedIdx = bSession.data.findIndex(
            (m: any) => m.class === "tbs.srv.battle.data.client.BattleFinishedData",
        );

        expect(surrenderIdx).toBeGreaterThanOrEqual(0);
        expect(finishedIdx).toBeGreaterThanOrEqual(0);
        // Surrender message must arrive before finished — that's what triggers
        // the winner's FSM transition to BattleStateFinish.
        expect(surrenderIdx).toBeLessThan(finishedIdx);
        // user_id on the surrender message identifies the surrendering party
        expect(bSession.data[surrenderIdx].user_id).toBe(aSession.account_id);
    });

    it("is a no-op on a second concurrent surrender call (endgameStarted guard)", async () => {
        const { a, b, battle } = await createMatch();
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;
        vi.mocked(addRenown).mockClear();

        await request(app)
            .post(`/services/battle/surrender/${a.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0 });
        await request(app)
            .post(`/services/battle/surrender/${a.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0 });

        await flushEndgame();

        expect(battle.winner).toBe(bSession.account_id);
        // addRenown is called once per player — 2 total. A second surrender must not double it.
        expect(vi.mocked(addRenown).mock.calls.length).toBe(2);
    });

    it("returns 200 when opponent has already disconnected", async () => {
        const { a, b, battle } = await createMatch();
        sessionHandler.removeSession(b.session_key);

        const res = await request(app)
            .post(`/services/battle/surrender/${a.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0 });

        expect(res.status).toBe(200);
        // No opponent → finalizeSurrender bails before setting winner
        expect(battle.winner).toBeNull();
    });
});

describe("BattleFinishedData.rewards indexed by party_index (#33)", () => {
    it("a winner at party_index 1 gets their renown at rewards[1], not rewards[0]", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        // a queued first → party_index 0; b queued second → party_index 1 (earlier-queued
        // entry takes slot 0, per the CLAUDE.md rewards-ordering invariant).
        const aIndex = battle.parties[a.session_key].party_index;
        const bIndex = battle.parties[b.session_key].party_index;
        expect(aIndex).toBe(0);
        expect(bIndex).toBe(1);

        // Backdate past the EXPERT (sub-30s) bonus so the winner total is deterministic.
        battle.startedAt = new Date(Date.now() - 60_000);

        // b (party_index 1) kills both of a's units → b is the winner at slot 1.
        const body = (entity: string) => ({
            battle_id: battle.battle_id,
            entity,
            turn: 0,
            ordinal: 0,
            killedparty: aSession.account_id,
            killer: "unit1",
            killerparty: bSession.account_id,
        });
        await request(app).post(`/services/battle/killed/${b.session_key}`).send(body("unit1"));
        await request(app).post(`/services/battle/killed/${b.session_key}`).send(body("unit2"));

        await flushEndgame();

        const finished = bSession.data.find((m: any) => m.class === ServerClasses.BATTLE_FINISHED_DATA);
        expect(finished).toBeDefined();
        expect(battle.winner).toBe(bSession.account_id);
        // Winner b sits at party_index 1: WIN(5)+KILLS(2)=7 must land in slot 1, and the
        // loser's 0 in slot 0 — proving index-by-party_index, not winner-first.
        expect(finished.rewards[bIndex].total_renown).toBe(7);
        expect(finished.rewards[aIndex].total_renown).toBe(0);
    });
});

describe("endgame DB writes use steam_id_str not user_id", () => {
    it("addRenown receives the exact Steam ID string, not the precision-lost number", async () => {
        // Use STEAM_ID_BASE + 17 and + 33 — neither is a multiple of 16 (ULP in this
        // range), so both lose precision when cast to Number.
        const STEAM_A = "76561197960265745"; // Number → 76561197960265744 (off by 1)
        const STEAM_B = "76561197960265761"; // Number → 76561197960265760 (off by 1)

        // Sanity check: if this fails the test IDs need updating for this engine.
        expect(String(Number(STEAM_A))).not.toBe(STEAM_A);
        expect(String(Number(STEAM_B))).not.toBe(STEAM_B);

        vi.mocked(addRenown).mockClear();

        const a = await loginPlayer(STEAM_A);
        const b = await loginPlayer(STEAM_B);
        await request(app).post(`/services/vs/start/${a.session_key}`).send({ vs_type: "QUICK", match_handle: 1 });
        await request(app).post(`/services/vs/start/${b.session_key}`).send({ vs_type: "QUICK", match_handle: 1 });

        const battle = battleHandler.getBattles().find((bt) => a.session_key in bt.parties)!;
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        // Kill all of b's units so endgame fires
        for (const unit of ["unit1", "unit2"]) {
            await request(app).post(`/services/battle/killed/${a.session_key}`).send({
                battle_id: battle.battle_id, entity: unit, turn: 0, ordinal: 0,
                killedparty: bSession.account_id, killer: "unit1", killerparty: aSession.account_id,
            });
        }

        // endgame is fire-and-forget; flush so the writes (and assertions) settle
        await flushEndgame();

        // Exact steam_id_str strings must be passed — not the precision-lost user_id strings
        expect(vi.mocked(addRenown)).toHaveBeenCalledWith(STEAM_A, expect.any(Number));
        expect(vi.mocked(addRenown)).toHaveBeenCalledWith(STEAM_B, expect.any(Number));
        expect(vi.mocked(addRenown)).not.toHaveBeenCalledWith(String(Number(STEAM_A)), expect.any(Number));
        expect(vi.mocked(addRenown)).not.toHaveBeenCalledWith(String(Number(STEAM_B)), expect.any(Number));
    });
});
