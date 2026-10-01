import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A surrender runs endgame, which writes to the database. These mocks keep that sealed
// off, the same way Battle.endgame.test.ts does. The paths resolve to the exact modules
// Battle.ts imports.
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

import { battleHandler, setDebugFastTimer } from "./Battle";
import { GameModes, ServerClasses } from "../../const";
import { Session } from "../auth/auth";

// ---------------------------------------------------------------------------
// #213 — the server's per-turn deadline.
//
// It is NOT a clock. The clock belongs to the player and runs in their own game.
// This deadline exists to notice somebody who has GONE, so that a crashed game
// cannot freeze a match and leak it for the full 30-minute session timeout.
//
// Most of these tests drive the callback down its cheap path — "a session has gone,
// sweep the battle" — so they can assert exactly WHEN it fires. The battle
// disappearing from the registry is the signal. The no-clock surrender tests (#224)
// check only what a surrender does at once; its database writes are mocked above.
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
        // A game that has just signed in. The no-clock check reads this (#224).
        lastPollAt: Date.now(),
        accountData: {
            roster_json: [{ id: `u${account_id}`, stats: [{ stat: "RANK", value: 1 }] }],
            party_ids_json: [`u${account_id}`],
        },
        data,
        pushData: (...msgs: any[]) => { data.push(...msgs); },
    } as unknown as FakeSession;
}

// `present` lists the sessions still signed in; anything else looks up as gone.
async function installSessionMock(present: Session[]) {
    return vi.spyOn(await import("../auth/auth"), "sessionHandler", "get").mockReturnValue({
        getSession: (k: string, v: any) =>
            k === "session_key" ? present.find((s) => s.session_key === v) : undefined,
        getSessions: () => present,
        addSession: vi.fn(),
        removeSession: vi.fn(),
    } as any);
}

const ACTOR = "key-actor";
const WAITING = "key-waiting";

// Both players run on one clock, so `timer` is the battle's, and it is what decides how
// long the player we are waiting on gets.
function makeBattle(timer: number) {
    const actor = fakeSession(1, ACTOR);
    const waiting = fakeSession(2, WAITING);
    const battle = battleHandler.addBattle(
        [actor, waiting],
        GameModes.FRIEND,
        [{ power: 0, elo: 0 }, { power: 0, elo: 0 }],
        { friendly: true, timer },
    );
    return { battle, actor, waiting };
}

const stillRegistered = (id: string) => battleHandler.getBattle(id) !== undefined;

beforeEach(() => {
    vi.useFakeTimers();
    // NODE_ENV is "test", so the fast-timer switch is on by default and would rewrite
    // every real clock to 15 seconds.
    setDebugFastTimer(false);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setDebugFastTimer(true);
    battleHandler.getBattles().forEach((b) => battleHandler.removeBattle(b.battle_id));
});

describe("the deadline follows the waiting player's own turn length (#213)", () => {
    it("gives a 45-second player 105 seconds, not the old flat 90", async () => {
        const { battle, actor } = makeBattle(45);
        await installSessionMock([actor]);   // the waiting player has gone

        battle.refreshTurnDeadline(ACTOR);

        vi.advanceTimersByTime(104_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);

        vi.advanceTimersByTime(2_000);
        expect(stillRegistered(battle.battle_id)).toBe(false);
    });

    // 30 + 60 is 90, so the commonest case is deliberately unchanged by this issue.
    it("still gives a 30-second player exactly 90 seconds", async () => {
        const { battle, actor } = makeBattle(30);
        await installSessionMock([actor]);

        battle.refreshTurnDeadline(ACTOR);

        vi.advanceTimersByTime(89_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);

        vi.advanceTimersByTime(2_000);
        expect(stillRegistered(battle.battle_id)).toBe(false);
    });
});

describe("a player who asked for no clock is never surrendered for thinking (#213)", () => {
    it("leaves a thinking player alone while their game keeps asking for messages", async () => {
        const { battle, actor, waiting } = makeBattle(0);
        await installSessionMock([actor, waiting]);   // both still here
        // A running game keeps asking for messages every few seconds, thinking or not.
        const polling = setInterval(() => { waiting.lastPollAt = Date.now(); }, 5_000);

        battle.refreshTurnDeadline(ACTOR);

        // Eleven one-minute checks, far past the 90 seconds a silent game is allowed.
        vi.advanceTimersByTime(11 * 60_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);
        expect(battle.endgameStarted).toBe(false);

        // It re-armed rather than giving up watching, so a later crash is still caught.
        vi.advanceTimersByTime(11 * 60_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);
        expect(battle.endgameStarted).toBe(false);

        clearInterval(polling);
    });

    it("still sweeps the battle once that player's session has gone, at the one-minute check", async () => {
        const { battle, actor } = makeBattle(0);
        await installSessionMock([actor]);

        battle.refreshTurnDeadline(ACTOR);

        vi.advanceTimersByTime(59_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);

        vi.advanceTimersByTime(2_000);
        expect(stillRegistered(battle.battle_id)).toBe(false);
    });
});

// #224 — a crashed game and a thinking player used to look the same, so a no-clock
// opponent could wait up to 35 minutes. What tells them apart is the game itself asking
// for messages: a running game keeps doing so, and a crashed one stops.
describe("a no-clock player whose game has gone quiet is surrendered (#224)", () => {
    // The immediate effects of a surrender, before endgame's database work.
    function expectSurrenderedTo(battle: any, loser: FakeSession, winner: FakeSession) {
        expect(battle.endgameStarted).toBe(true);
        expect(battle.winner).toBe(winner.account_id);
        const msg = winner.data.find((m: any) => m.class === ServerClasses.BATTLE_SURRENDER_DATA);
        expect(msg).toBeDefined();
        expect(msg.user_id).toBe(loser.account_id);
    }

    it("surrenders a game that stops asking, at the first check after 90 seconds of silence", async () => {
        const { battle, actor, waiting } = makeBattle(0);
        await installSessionMock([actor, waiting]);   // the session lives on after a crash

        // The waiting player's game crashes the moment the turn passes to them: its last
        // request is the one stamped at sign-in, and it never asks again.
        battle.refreshTurnDeadline(ACTOR);

        // The 60-second check finds 60 seconds of silence, which is not yet enough.
        vi.advanceTimersByTime(119_000);
        expect(battle.endgameStarted).toBe(false);

        // The 120-second check finds 120.
        vi.advanceTimersByTime(2_000);
        expectSurrenderedTo(battle, waiting, actor);
    });

    it("looks in after one minute, not ten", async () => {
        const { battle, actor, waiting } = makeBattle(0);
        await installSessionMock([actor, waiting]);
        waiting.lastPollAt = Date.now() - 100_000;   // already silent for 100 seconds

        battle.refreshTurnDeadline(ACTOR);

        vi.advanceTimersByTime(59_000);
        expect(battle.endgameStarted).toBe(false);

        vi.advanceTimersByTime(2_000);
        expectSurrenderedTo(battle, waiting, actor);
    });

    it("counts exactly 90 seconds of silence as still here", async () => {
        const { battle, actor, waiting } = makeBattle(0);
        await installSessionMock([actor, waiting]);
        waiting.lastPollAt = Date.now() - 30_000;     // 90 seconds silent at the first check

        battle.refreshTurnDeadline(ACTOR);

        vi.advanceTimersByTime(61_000);
        expect(battle.endgameStarted).toBe(false);
        expect(stillRegistered(battle.battle_id)).toBe(true);
    });

    // The check is written "not within 90 seconds" rather than "over 90 seconds" so that
    // a missing or broken stamp reads as gone. Written the other way round, it would read
    // as here for ever, and the opponent would wait for nothing.
    it("treats a session with no poll stamp as gone", async () => {
        const { battle, actor, waiting } = makeBattle(0);
        await installSessionMock([actor, waiting]);
        (waiting as any).lastPollAt = undefined;

        battle.refreshTurnDeadline(ACTOR);

        vi.advanceTimersByTime(61_000);
        expectSurrenderedTo(battle, waiting, actor);
    });
});
