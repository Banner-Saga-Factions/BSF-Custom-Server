import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// endgame() persists renown / Elo / the battle row through the DB layer and only
// then mutates in-memory state and messages the clients. These tests mock that DB
// layer so they never touch SQLite and can force a write to fail — exercising the
// renown-desync guard (#43) — and assert the turn-log is freed afterwards (#41).
//
// A separate file (not Battle.test.ts) keeps these module mocks isolated; Battle.test.ts
// deliberately drives endgame down a no-DB early-return path and must stay un-mocked.
//
// The mocked paths (../../db/*) resolve to the exact modules Battle.ts imports.
vi.mock("../../db/account", () => ({
    addRenown: vi.fn().mockResolvedValue(undefined),
    saveRoster: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../db/battles", () => ({
    saveBattle: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../db/ranking", () => ({
    getOrCreateRanking: vi.fn().mockResolvedValue({ battle_elo: 1000, win_streak: 0 }),
    applyBattleRankingUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { Battle, endgame } from "./Battle";
import { GameModes, ServerClasses } from "../../const";
import { Session } from "../auth/auth";
import { addRenown, saveRoster } from "../../db/account";
import { saveBattle } from "../../db/battles";
import { getOrCreateRanking, applyBattleRankingUpdate } from "../../db/ranking";

const START_RENOWN = 100;

// Minimal fake session — mirrors Battle.test.ts but adds the two fields endgame reads:
// external_id_str (used as the DB write key) and accountData.renown (the in-memory total
// it mutates only after the writes resolve).
function fakeSession(account_id: number, session_key: string, units: string[]): Session {
    return {
        account_id,
        session_key,
        user_id: account_id,
        external_id_str: String(account_id),
        display_name: `player_${account_id}`,
        match_handle: 0,
        battle_id: undefined,
        accountData: {
            renown: START_RENOWN,
            roster_json: units.map((id) => ({ id, stats: [{ stat: "RANK", value: 1 }] })),
            party_ids_json: units,
        },
        pushData: vi.fn(),
    } as unknown as Session;
}

// A finished 1v1 where s1 won: its unit is alive, s2's unit is dead. Mirrors the
// post-/killed state endgame() reads (battle.winner + aliveUnits deltas).
function finishedBattle() {
    const s1 = fakeSession(1, "key-a", ["a1"]);
    const s2 = fakeSession(2, "key-b", ["b1"]);
    const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);
    battle.winner = s1.account_id;                      // server-derived winner
    battle.aliveUnits[String(s1.account_id)] = ["a1"];  // winner intact
    battle.aliveUnits[String(s2.account_id)] = [];      // loser wiped
    return { s1, s2, battle };
}

// First pushed message of a given class across all of a session's pushData calls.
function pushedClass(session: Session, cls: string): any {
    return (session.pushData as any).mock.calls.flat().find((m: any) => m?.class === cls);
}

beforeEach(() => {
    // Forget which calls the previous test made. restoreAllMocks() below puts the
    // module mocks' implementations back but keeps their call history, so without
    // this a "called twice" assertion quietly reads the whole file's total and only
    // holds for whichever test happens to run first.
    vi.clearAllMocks();
    // Silence (and capture) endgame's console output.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Re-arm the DB mocks to a clean all-resolve baseline each test. afterEach's
    // restoreAllMocks() resets their state, so test order can't leak a queued rejection.
    vi.mocked(getOrCreateRanking).mockResolvedValue({ battle_elo: 1000, win_streak: 0 } as any);
    vi.mocked(addRenown).mockResolvedValue(undefined);
    vi.mocked(saveRoster).mockResolvedValue(undefined);
    vi.mocked(saveBattle).mockResolvedValue(undefined);
    vi.mocked(applyBattleRankingUpdate).mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("endgame() renown persistence guard (#43)", () => {
    it("applies renown to in-memory accountData exactly once, after the DB writes resolve", async () => {
        const { s1, s2, battle } = finishedBattle();

        await endgame({ session: s1, opponent: s2, battle });

        // endgame fires the writes then resolves; the renown mutation + push happen in the
        // .then() a tick later. Wait for the finished message to land.
        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        const renownMsg = pushedClass(s1, ServerClasses.RENOWN_MESSAGE);
        const finished = pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA);
        expect(renownMsg).toBeDefined();
        expect(renownMsg.total).toBeGreaterThan(0);              // winner actually earned renown
        expect(finished.total_renown).toBeGreaterThan(0);

        // Winner's in-memory renown rose by exactly what they were told they earned —
        // applied once (not zero, not double).
        expect(s1.accountData!.renown).toBe(START_RENOWN + renownMsg.total);

        // The renown writes did fire on the success path.
        expect(addRenown).toHaveBeenCalledTimes(2);             // winner + loser
        // Loser also gets a finished message (total renown for a loss may be 0).
        expect(pushedClass(s2, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
    });

    it("leaves in-memory renown untouched and sends the zero-renown fallback when a DB write fails", async () => {
        const { s1, s2, battle } = finishedBattle();
        // The winner's renown write rejects — the whole Promise.all rejects.
        vi.mocked(addRenown).mockRejectedValueOnce(new Error("db down"));

        await endgame({ session: s1, opponent: s2, battle });

        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        // No desync: memory must not move when the DB didn't save.
        expect(s1.accountData!.renown).toBe(START_RENOWN);
        expect(s2.accountData!.renown).toBe(START_RENOWN);

        // Fallback is truthful: zero renown + a report-to-admin chat message, error logged.
        const finished = pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA);
        expect(finished.total_renown).toBe(0);
        expect(finished.rewards).toEqual([]);
        expect(pushedClass(s1, ServerClasses.CHAT_MESSAGE)).toBeDefined();
        expect(pushedClass(s2, ServerClasses.CHAT_MESSAGE)).toBeDefined();
        expect(console.error).toHaveBeenCalled();
    });
});

describe("endgame() prunes Battle.turns (#41)", () => {
    it("clears battle.turns after a completed battle while still delivering endgame messages", async () => {
        const { s1, s2, battle } = finishedBattle();
        // Simulate an accumulated per-turn log (what handleMove/handleAction build up).
        battle.turns = [[{ some: "turn-data" }], [{ more: "data" }]];
        expect(battle.turns.length).toBeGreaterThan(0);

        await endgame({ session: s1, opponent: s2, battle });

        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        // #41: the big turn log is freed once the battle is over.
        expect(battle.turns).toEqual([]);

        // Regression: endgame messages still go out to both players.
        expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        expect(pushedClass(s2, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        expect(pushedClass(s1, ServerClasses.RENOWN_MESSAGE)).toBeDefined();
    });

    it("clears battle.turns even when the DB persistence fails", async () => {
        const { s1, s2, battle } = finishedBattle();
        battle.turns = [[{ some: "turn-data" }]];
        vi.mocked(saveBattle).mockRejectedValueOnce(new Error("db down"));

        await endgame({ session: s1, opponent: s2, battle });

        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        // The failure path frees the turn log too — the battle is equally over.
        expect(battle.turns).toEqual([]);
    });
});


// ---------------------------------------------------------------------------
// #205 — what a friend match is worth. Decided 2026-08-27: it counts towards
// rating and win/loss exactly like a quick match, and pays nothing at all.
// ---------------------------------------------------------------------------

describe("endgame() for a friend match (#205)", () => {
    // Same finished 1v1 as above, but arranged between two friends, and with each
    // side's unit credited a kill so the roster write would fire if it were allowed to.
    function finishedFriendlyBattle(friendly: boolean) {
        const s1 = fakeSession(1, "key-a", ["a1"]);
        const s2 = fakeSession(2, "key-b", ["b1"]);
        const battle = new Battle(
            [s1, s2],
            friendly ? GameModes.FRIEND : GameModes.QUICK,
            [{ power: 0, elo: 0 }, { power: 0, elo: 0 }],
            { friendly },
        );
        battle.winner = s1.account_id;
        battle.aliveUnits[String(s1.account_id)] = ["a1"];
        battle.aliveUnits[String(s2.account_id)] = [];
        battle.unitKillCounts[String(s1.account_id)] = { a1: 1 };
        return { s1, s2, battle };
    }

    it("pays nobody anything", async () => {
        const { s1, s2, battle } = finishedFriendlyBattle(true);

        await endgame({ session: s1, opponent: s2, battle });
        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        expect(pushedClass(s1, ServerClasses.RENOWN_MESSAGE).total).toBe(0);
        expect(pushedClass(s2, ServerClasses.RENOWN_MESSAGE).total).toBe(0);
        expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA).total_renown).toBe(0);
        // Neither player's balance moved.
        expect(s1.accountData!.renown).toBe(START_RENOWN);
        expect(s2.accountData!.renown).toBe(START_RENOWN);
    });

    it("still moves both players' rating and win/loss record", async () => {
        const { s1, s2, battle } = finishedFriendlyBattle(true);

        await endgame({ session: s1, opponent: s2, battle });
        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        // One update per side — the winner recorded as a win, the loser as a loss.
        expect(applyBattleRankingUpdate).toHaveBeenCalledTimes(2);
        const wons = vi.mocked(applyBattleRankingUpdate).mock.calls.map(([u]) => u.won);
        expect(wons).toEqual(expect.arrayContaining([true, false]));
    });

    it("does not advance units towards a promotion", async () => {
        const { s1, s2, battle } = finishedFriendlyBattle(true);

        await endgame({ session: s1, opponent: s2, battle });
        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        expect(saveRoster).not.toHaveBeenCalled();
    });

    // The control: the very same battle, not arranged between friends, pays out and
    // credits the kill. Without this, all three tests above would still pass if the
    // flag were ignored and the feature simply never worked.
    it("an ordinary battle with the same shape still pays and still credits the kill", async () => {
        const { s1, s2, battle } = finishedFriendlyBattle(false);

        await endgame({ session: s1, opponent: s2, battle });
        await vi.waitFor(() => {
            expect(pushedClass(s1, ServerClasses.BATTLE_FINISHED_DATA)).toBeDefined();
        });

        expect(pushedClass(s1, ServerClasses.RENOWN_MESSAGE).total).toBeGreaterThan(0);
        expect(saveRoster).toHaveBeenCalled();
    });
});
