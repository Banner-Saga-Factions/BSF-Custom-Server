import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler, reapStaleSessions, SESSION_TTL_MS } from "../../src/services/auth/auth";
import { gameQueue } from "../../src/services/queue";
import { battleHandler } from "../../src/services/battle/Battle";
import { addRenown } from "../../src/db/account";
import { ServerClasses } from "../../src/const";
import { loginPlayer } from "../helpers";

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

async function createMatch() {
    const a = await loginPlayer("501");
    const b = await loginPlayer("502");

    await request(app)
        .post(`/services/vs/start/${a.session_key}`)
        .send({ vs_type: "QUICK", match_handle: 1 });

    await request(app)
        .post(`/services/vs/start/${b.session_key}`)
        .send({ vs_type: "QUICK", match_handle: 1 });

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

        // Backdate player A's last activity past the TTL threshold.
        aSession.lastActivity = Date.now() - SESSION_TTL_MS - 1000;

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

        // addRenown fires once per player; the exact-string steam_id_str must be
        // passed, not the precision-lost user_id.
        expect(vi.mocked(addRenown)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(addRenown)).toHaveBeenCalledWith(bSession.steam_id_str, expect.any(Number));
        expect(vi.mocked(addRenown)).toHaveBeenCalledWith(aSession.steam_id_str, expect.any(Number));
    });

    it("removes the battle when both sessions are stale; survivor is preserved by the surrender pushData", async () => {
        const { a, b, battle } = await createMatch();
        const aSession = sessionHandler.getSession("session_key", a.session_key)!;
        const bSession = sessionHandler.getSession("session_key", b.session_key)!;
        const battleId = battle.battle_id;

        vi.mocked(addRenown).mockClear();

        // Both sides stale — the "both abandoned mid-battle" scenario.
        aSession.lastActivity = Date.now() - SESSION_TTL_MS - 1000;
        bSession.lastActivity = Date.now() - SESSION_TTL_MS - 1000;

        expect(() => reapStaleSessions()).not.toThrow();

        // The first stale session (A) is evicted and the battle is removed —
        // this is the leak fix the audit asked for.
        expect(sessionHandler.getSession("session_key", a.session_key)).toBeUndefined();
        expect(battleHandler.getBattle(battleId)).toBeUndefined();

        // The survivor (B) gets a BATTLE_SURRENDER_DATA pushData, which sets
        // bSession.lastActivity = Date.now(). Iteration 2 then sees B as fresh
        // and skips eviction. B stays in `sessions` with battle_id cleared and
        // will be evicted on a future reaper pass if still inactive 30 min later.
        // This is correct: B received a notification, so they're not truly dead.
        expect(sessionHandler.getSession("session_key", b.session_key)).toBe(bSession);
        expect(bSession.battle_id).toBeUndefined();

        // Exactly one endgame fired (for A's surrender to B). If iter 2 had also
        // run finalizeSurrender we'd see 4 addRenown calls instead of 2.
        await new Promise<void>((r) => setImmediate(r));
        await new Promise<void>((r) => setImmediate(r));
        expect(vi.mocked(addRenown)).toHaveBeenCalledTimes(2);
    });
});
