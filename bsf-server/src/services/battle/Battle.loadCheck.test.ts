import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

// A surrender runs endgame, which writes to the database. These mocks keep that sealed
// off, the same way Battle.turnDeadline.test.ts does.
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

import app from "../../app";
import { battleHandler, endgame, finalizeSurrender } from "./Battle";
import { GameModes } from "../../const";
import { Session, sessionHandler } from "../auth/auth";

// ---------------------------------------------------------------------------
// #408 — the log says when a matched player's game never reports ready.
//
// Log lines only: nothing here is sent to a player or changes how a battle ends.
// The checks run 30 and 90 seconds after the match, and each names a player who is
// not ready together with how long ago that player's game last asked for messages.
// ---------------------------------------------------------------------------

type FakeSession = Session & { data: any[] };

function fakeSession(account_id: number, session_key: string): FakeSession {
    const data: any[] = [];
    return {
        account_id,
        session_key,
        user_id: account_id,
        external_id_str: String(account_id),
        display_name: `player_${account_id}`,
        match_handle: 0,
        battle_id: undefined,
        lastPollAt: Date.now(),
        accountData: {
            roster_json: [{ id: `u${account_id}`, stats: [{ stat: "RANK", value: 1 }] }],
            party_ids_json: [`u${account_id}`],
        },
        data,
        pushData: (...msgs: any[]) => {
            data.push(...msgs);
        },
    } as unknown as FakeSession;
}

// `present` lists the sessions still signed in; anything else looks up as gone.
async function installSessionMock(present: Session[]) {
    return vi.spyOn(await import("../auth/auth"), "sessionHandler", "get").mockReturnValue({
        getSession: (k: string, v: any) => (k === "session_key" ? present.find((s) => s.session_key === v) : undefined),
        getSessions: () => present,
        addSession: vi.fn(),
        removeSession: vi.fn(),
    } as any);
}

function makeBattle() {
    const first = fakeSession(1, "key-first");
    const second = fakeSession(2, "key-second");
    const battle = battleHandler.addBattle([first, second], GameModes.QUICK, [
        { power: 0, elo: 0 },
        { power: 0, elo: 0 },
    ]);
    return { battle, first, second };
}

let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;

const linesOf = (spy: ReturnType<typeof vi.spyOn>, tag: string): string[] =>
    spy.mock.calls.map((call: any[]) => String(call[0])).filter((line: string) => line.includes(tag));
const loadWarnings = () => linesOf(warn, "[BATTLE-LOAD]");
const loadLines = () => linesOf(log, "[BATTLE-LOAD]");

beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    battleHandler.getBattles().forEach((b) => battleHandler.removeBattle(b.battle_id));
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("a ready line for each player (#408)", () => {
    it("says how many seconds after the match each player was ready", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);

        vi.advanceTimersByTime(8_000);
        battle.markReady(first);
        vi.advanceTimersByTime(4_000);
        battle.markReady(second);

        expect(loadLines()).toEqual([
            `[BATTLE-LOAD] player_1 ready 8s after the match (battle ${battle.battle_id})`,
            `[BATTLE-LOAD] player_2 ready 12s after the match (battle ${battle.battle_id})`,
        ]);
    });

    it("logs a player once, however often their game repeats it", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);

        battle.markReady(first);
        battle.markReady(first);

        expect(loadLines()).toHaveLength(1);
    });
});

describe("the checks 30 and 90 seconds after the match (#408)", () => {
    it("warns about nobody when both players are ready in time", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);

        vi.advanceTimersByTime(10_000);
        battle.markReady(first);
        battle.markReady(second);
        // Both ready: the checks are dropped before they are due, rather than left to fire.
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(120_000);

        expect(loadWarnings()).toEqual([]);
    });

    it("names only the player who is not ready, at 30 seconds and again at 90", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);

        vi.advanceTimersByTime(5_000);
        battle.markReady(first);
        // The second player's game last asked for messages 14 seconds after the match.
        vi.advanceTimersByTime(9_000);
        second.lastPollAt = Date.now();

        vi.advanceTimersByTime(15_000);
        expect(loadWarnings()).toEqual([]);

        vi.advanceTimersByTime(1_000);
        expect(loadWarnings()).toEqual([
            `[BATTLE-LOAD] player_2 has not reported ready 30s after the match; their game asked for messages 16s ago (battle ${battle.battle_id})`,
        ]);

        vi.advanceTimersByTime(60_000);
        expect(loadWarnings()).toHaveLength(2);
        expect(loadWarnings()[1]).toContain("player_2 has not reported ready 90s after the match");
        expect(loadWarnings()[1]).toContain("asked for messages 76s ago");
    });

    it("warns about both players when neither is ready", async () => {
        const { first, second } = makeBattle();
        await installSessionMock([first, second]);

        vi.advanceTimersByTime(30_000);

        expect(loadWarnings()).toHaveLength(2);
        expect(loadWarnings()[0]).toContain("player_1");
        expect(loadWarnings()[1]).toContain("player_2");
    });

    it("says so when the player's session has already ended", async () => {
        const { first } = makeBattle();
        await installSessionMock([first]); // the second player is no longer signed in

        vi.advanceTimersByTime(30_000);

        expect(loadWarnings()[1]).toContain("player_2 has not reported ready 30s after the match");
        expect(loadWarnings()[1]).toContain("their session has ended");
    });

    it("leaves nothing running once the battle is removed", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);
        expect(vi.getTimerCount()).toBe(2);

        battleHandler.removeBattle(battle.battle_id);

        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(120_000);
        expect(loadWarnings()).toEqual([]);
    });

    it("says nothing about a battle that has already ended", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);

        battle.endgameStarted = true;
        vi.advanceTimersByTime(120_000);

        expect(loadWarnings()).toEqual([]);
    });
});

describe("the end-of-battle line says how the battle ended (#408)", () => {
    const endgameLine = () => linesOf(log, "[BATTLE] endgame: winner=")[0];

    it("says 'last unit' when the last unit fell", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);
        battle.winner = first.account_id;

        await endgame({ battle, session: first, opponent: second });

        expect(endgameLine()).toContain("ended by: last unit");
    });

    it("says 'surrender' for a plain surrender", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);

        await finalizeSurrender({ battle, session: first, opponent: second });

        expect(endgameLine()).toContain("ended by: surrender");
    });

    it("carries the reason a caller gives", async () => {
        const { battle, first, second } = makeBattle();
        await installSessionMock([first, second]);

        await finalizeSurrender({ battle, session: first, opponent: second }, "turn deadline");

        expect(endgameLine()).toContain("ended by: turn deadline");
    });
});

// The route, with real sessions and the real clock, so the wiring is covered too.
describe("POST /battle/ready writes the ready line (#408)", () => {
    it("logs the player who reported ready", async () => {
        vi.useRealTimers();
        const first = sessionHandler.addSession(1001, "1001", 1001);
        const second = sessionHandler.addSession(2002, "2002", 2002);
        for (const s of [first, second]) {
            s.accountData = {
                roster_json: [{ id: "a1", stats: [{ stat: "RANK", value: 1 }] }],
                party_ids_json: ["a1"],
            } as any;
        }
        const battle = battleHandler.addBattle([first, second], GameModes.QUICK, [
            { power: 0, elo: 0 },
            { power: 0, elo: 0 },
        ]);

        try {
            await request(app)
                .post(`/services/battle/ready/${first.session_key}`)
                .send({ battle_id: battle.battle_id })
                .expect(200);

            expect(loadLines()).toEqual([
                `[BATTLE-LOAD] ${first.display_name} ready 0s after the match (battle ${battle.battle_id})`,
            ]);
        } finally {
            battleHandler.removeBattle(battle.battle_id);
            sessionHandler.removeSession(first.session_key);
            sessionHandler.removeSession(second.session_key);
        }
    });
});
