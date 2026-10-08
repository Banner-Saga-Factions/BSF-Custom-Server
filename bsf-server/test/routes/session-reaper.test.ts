import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler, reapStaleSessions, SESSION_TTL_MS } from "../../src/services/auth/auth";
import { gameQueue } from "../../src/services/queue";
import { battleHandler } from "../../src/services/battle/Battle";
import { addRenown } from "../../src/db/account";
import { ServerClasses } from "../../src/const";
import { loginPlayer, flushEndgame } from "../helpers";

// Mirrors battle.test.ts so each player gets a distinct account_id and the endgame
// path has real-looking renown / steam_id strings to assert against.
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
            { id: "unit1", entityClass: "Archer", stats: [{ stat: "RANK", value: 1 }] },
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

async function createMatch() {
    const a = await loginPlayer("501");
    const b = await loginPlayer("502");

    await request(app).post(`/services/vs/start/${a.session_key}`).send({ vs_type: "QUICK", match_handle: 1 });

    await request(app).post(`/services/vs/start/${b.session_key}`).send({ vs_type: "QUICK", match_handle: 1 });

    const battle = battleHandler.getBattles().find((bt) => a.session_key in bt.parties)!;
    return { a, b, battle };
}

describe("reapStaleSessions — route-level integration", () => {
    it("evicts a stale mid-battle session and surrenders to the opponent", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;
        const battleId = battle.battle_id;

        vi.mocked(addRenown).mockClear();

        // Backdate when player A's game last asked for messages, past the TTL threshold.
        aSession.lastPollAt = Date.now() - SESSION_TTL_MS - 1000;

        reapStaleSessions();

        // Synchronous post-conditions: session gone, battle gone, opponent unstuck,
        // BATTLE_SURRENDER_DATA buffered before the async tail starts.
        expect(sessionHandler.getSession("session_key", a.session_key)).toBeUndefined();
        expect(battleHandler.getBattle(battleId)).toBeUndefined();
        expect(bSession.battle_id).toBeUndefined();

        const surrenderMsg = bSession.data.find((m: any) => m.class === ServerClasses.BATTLE_SURRENDER_DATA);
        expect(surrenderMsg).toBeDefined();
        expect(surrenderMsg.battle_id).toBe(battleId);
        expect(surrenderMsg.user_id).toBe(aSession.account_id);

        // Async tail: endgame's Promise.all → BattleFinishedData + RenownMessage.
        await new Promise<void>((r) => setImmediate(r));
        await new Promise<void>((r) => setImmediate(r));

        const finishedMsg = bSession.data.find((m: any) => m.class === ServerClasses.BATTLE_FINISHED_DATA);
        expect(finishedMsg).toBeDefined();
        expect(finishedMsg.victoriousTeam).toBe(String(bSession.account_id));

        // addRenown fires once per player; the exact-string external_id_str must be
        // passed, not the precision-lost user_id.
        expect(vi.mocked(addRenown)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(addRenown)).toHaveBeenCalledWith(bSession.external_id_str, expect.any(Number));
        expect(vi.mocked(addRenown)).toHaveBeenCalledWith(aSession.external_id_str, expect.any(Number));
    });

    it("removes the battle when both sessions are stale, and evicts both in the same pass", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;
        const battleId = battle.battle_id;

        vi.mocked(addRenown).mockClear();

        // Both sides stale — the "both abandoned mid-battle" scenario.
        aSession.lastPollAt = Date.now() - SESSION_TTL_MS - 1000;
        bSession.lastPollAt = Date.now() - SESSION_TTL_MS - 1000;

        expect(() => reapStaleSessions()).not.toThrow();

        // The first stale session (A) is evicted and the battle is removed —
        // this is the leak fix the audit asked for.
        expect(sessionHandler.getSession("session_key", a.session_key)).toBeUndefined();
        expect(battleHandler.getBattle(battleId)).toBeUndefined();

        // A surrendered to B, and that message no longer counts as a sign B is still there
        // (#246), so B is evicted in this same pass rather than lingering another 30 minutes.
        // Removing the battle cleared B's battle_id first, so B leaves as a plain eviction.
        expect(sessionHandler.getSession("session_key", b.session_key)).toBeUndefined();
        expect(bSession.battle_id).toBeUndefined();

        // Exactly one endgame fired (for A's surrender to B). If B's eviction had also
        // run finalizeSurrender we'd see 4 addRenown calls instead of 2.
        await new Promise<void>((r) => setImmediate(r));
        await new Promise<void>((r) => setImmediate(r));
        expect(vi.mocked(addRenown)).toHaveBeenCalledTimes(2);
    });

    // #246. Whenever anyone searches, the server sends a queue update to every player not in a
    // battle. Those updates used to count as a sign the player was still there, so a game that had
    // crashed stayed signed in -- invitable, its lobby open -- for as long as anyone kept searching.
    // Only the game's own requests for messages count now.
    it("a queue update does not keep a crashed game signed in", async () => {
        const a = await loginPlayer("503");
        const c = await loginPlayer("504");
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const lastAsked = Date.now() - SESSION_TTL_MS - 1000;
        aSession.lastPollAt = lastAsked;
        aSession.data = [];

        await request(app).post(`/services/vs/start/${c.session_key}`).send({ vs_type: "QUICK", match_handle: 1 });

        // The update reached the crashed game, and did not move the time its game last asked.
        expect(aSession.data.some((m: any) => m.class === ServerClasses.VS_QUEUE_DATA)).toBe(true);
        expect(aSession.lastPollAt).toBe(lastAsked);

        reapStaleSessions();

        expect(sessionHandler.getSession("session_key", a.session_key)).toBeUndefined();
        expect(sessionHandler.getSession("session_key", c.session_key)).toBeDefined();
    });
});

// #224 — the reaper is not the only way a session ends mid-battle. A player who signs in
// again (the usual move after a crash) replaces their old session at once, and the game
// sends /logout when it closes. Both used to drop the session and leave the battle for a
// later sweep that told nobody, so the player left behind never got a result. Both now
// finish the battle the way the reaper does.
describe("a session that ends mid-battle finishes the battle (#224)", () => {
    // What the player left behind should see: the battle gone, the surrender message, and
    // then the result with themselves as the winner.
    async function expectWonBy(winner: any, loserAccountId: number, battleId: string) {
        expect(battleHandler.getBattle(battleId)).toBeUndefined();
        expect(winner.battle_id).toBeUndefined();

        const surrenderMsg = winner.data.find((m: any) => m.class === ServerClasses.BATTLE_SURRENDER_DATA);
        expect(surrenderMsg).toBeDefined();
        expect(surrenderMsg.battle_id).toBe(battleId);
        expect(surrenderMsg.user_id).toBe(loserAccountId);

        await new Promise<void>((r) => setImmediate(r));
        await new Promise<void>((r) => setImmediate(r));

        const finishedMsg = winner.data.find((m: any) => m.class === ServerClasses.BATTLE_FINISHED_DATA);
        expect(finishedMsg).toBeDefined();
        expect(finishedMsg.victoriousTeam).toBe(String(winner.account_id));
    }

    it("signing in again mid-battle surrenders the old session's battle to the opponent", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        const again = await loginPlayer("501");

        expect(again.session_key).not.toBe(a.session_key);
        expect(sessionHandler.getSession("session_key", a.session_key)).toBeUndefined();
        await expectWonBy(bSession, aSession.account_id, battle.battle_id);
    });

    it("signing out mid-battle surrenders the battle to the opponent", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        const res = await request(app).post(`/services/auth/logout/${a.session_key}`);

        expect(res.status).toBe(200);
        expect(sessionHandler.getSession("session_key", a.session_key)).toBeUndefined();
        await expectWonBy(bSession, aSession.account_id, battle.battle_id);
    });

    // A player who has just lost and then closes the game signs out while the finished
    // battle is still registered (it stays 30 seconds while the results go out). Signing
    // out must not end it a second time.
    it("signing out after the battle has ended writes no second result", async () => {
        const { a, b, battle } = await createMatch();
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;

        await request(app)
            .post(`/services/battle/surrender/${a.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0 });
        await flushEndgame();
        expect(battle.winner).toBe(bSession.account_id);
        vi.mocked(addRenown).mockClear();

        await request(app).post(`/services/auth/logout/${a.session_key}`);
        await flushEndgame();

        expect(vi.mocked(addRenown)).not.toHaveBeenCalled();
        expect(battle.winner).toBe(bSession.account_id);
        expect(battleHandler.getBattle(battle.battle_id)).toBeUndefined();
    });

    // The log is how a sign-out is read back from a real run, so it must not say a player
    // surrendered when the battle had already ended and nothing was surrendered.
    it("logs a sign-out after the battle has ended as that, not as a surrender", async () => {
        const { a, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;

        await request(app)
            .post(`/services/battle/surrender/${a.session_key}`)
            .send({ battle_id: battle.battle_id, turn: 0 });
        await flushEndgame();

        // console.log may already be watched by an earlier test, so only the lines from this
        // sign-out are read.
        const log = vi.spyOn(console, "log");
        const before = log.mock.calls.length;
        try {
            await request(app).post(`/services/auth/logout/${a.session_key}`);

            const lines = log.mock.calls.slice(before).map((call) => String(call[0]));
            expect(lines).toContain(
                `[SESSION] Signed out user_id=${aSession.user_id} (battle=${battle.battle_id} already over)`
            );
            expect(lines.filter((line) => line.includes("surrendered to"))).toEqual([]);
        } finally {
            log.mockRestore();
        }
    });
});
