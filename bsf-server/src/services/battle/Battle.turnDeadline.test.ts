import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { battleHandler, setDebugFastTimer } from "./Battle";
import { GameModes } from "../../const";
import { Session } from "../auth/auth";

// ---------------------------------------------------------------------------
// #213 — the server's per-turn deadline.
//
// It is NOT a clock. The clock belongs to the player and runs in their own game.
// This deadline exists to notice somebody who has GONE, so that a crashed game
// cannot freeze a match and leak it for the full 30-minute session timeout.
//
// These tests drive the callback down its cheap path — "a session has gone, sweep
// the battle" — so they can assert exactly WHEN it fires without running endgame
// and its database writes. The battle disappearing from the registry is the signal.
// ---------------------------------------------------------------------------

function fakeSession(account_id: number, session_key: string): Session {
    return {
        account_id,
        session_key,
        user_id: account_id,
        display_name: `player_${account_id}`,
        match_handle: 0,
        battle_id: undefined,
        accountData: {
            roster_json: [{ id: `u${account_id}`, stats: [{ stat: "RANK", value: 1 }] }],
            party_ids_json: [`u${account_id}`],
        },
        pushData: () => {},
    } as unknown as Session;
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

describe("a player who asked for no clock is never surrendered (#213)", () => {
    it("leaves a thinking player alone, and keeps checking back", async () => {
        const { battle, actor, waiting } = makeBattle(0);
        await installSessionMock([actor, waiting]);   // both still here

        battle.refreshTurnDeadline(ACTOR);

        // Well past the old 90 seconds, and past the first check too.
        vi.advanceTimersByTime(11 * 60_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);
        expect(battle.endgameStarted).toBe(false);

        // It re-armed rather than giving up watching, so a later crash is still caught.
        vi.advanceTimersByTime(11 * 60_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);
        expect(battle.endgameStarted).toBe(false);
    });

    it("still sweeps the battle once that player has actually gone", async () => {
        const { battle, actor } = makeBattle(0);
        await installSessionMock([actor]);

        battle.refreshTurnDeadline(ACTOR);

        vi.advanceTimersByTime(9 * 60_000);
        expect(stillRegistered(battle.battle_id)).toBe(true);

        vi.advanceTimersByTime(2 * 60_000);
        expect(stillRegistered(battle.battle_id)).toBe(false);
    });
});
