import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    gameQueue,
    startMatchmakerPump,
    stopMatchmakerPump,
    QueueItem,
} from "./queue";
import { GameModes } from "../const";
import { Session } from "./auth/auth";

// The pump only invokes battleHandler.addBattle indirectly via processMatches,
// but we mock it anyway so a successful match wouldn't construct a real Battle.
vi.mock("./battle/Battle", () => ({
    battleHandler: { addBattle: vi.fn() },
}));

// Build a session that calculateLevel will resolve to a specific power.
function powerSession(account_id: number, session_key: string, power: number): Session {
    const unitId = `unit-${account_id}`;
    return {
        account_id,
        session_key,
        user_id: account_id,
        battle_id: undefined,
        accountData: {
            roster_json: [{ id: unitId, stats: [{ stat: "RANK", value: power + 1 }] }],
            party_ids_json: [unitId],
        },
        // notifyQueueUpdate calls pushData after a successful match.
        pushData: () => {},
    } as unknown as Session;
}

function staleEntry(account_id: number, session_key: string): QueueItem {
    return {
        account_id,
        type: GameModes.QUICK,
        power: 0,
        session_key,
        queuedAt: new Date("2026-05-20T00:00:00Z"),
        elo: 0,
        threshold_power: 0,
        threshold_elo: Number.MAX_SAFE_INTEGER,
        threshold_power_max: 3,
        tourney_id: 0,
    };
}

describe("matchmaker pump lifecycle", () => {
    beforeEach(() => {
        // Module load may have started the pump — get to a known stopped state.
        stopMatchmakerPump();
        gameQueue.length = 0;
    });

    afterEach(() => {
        stopMatchmakerPump();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("startMatchmakerPump schedules an interval at the 5-second cadence", () => {
        const spy = vi.spyOn(global, "setInterval");
        startMatchmakerPump();
        expect(spy).toHaveBeenCalledTimes(1);
        // Java VsWorkerConfig.VS_CHECK_MS = 5000.
        expect(spy.mock.calls[0][1]).toBe(5_000);
    });

    it("calling startMatchmakerPump twice does not stack intervals", () => {
        startMatchmakerPump();
        const spy = vi.spyOn(global, "setInterval");
        startMatchmakerPump();
        expect(spy).not.toHaveBeenCalled();
    });

    it("stopMatchmakerPump clears the interval handle", () => {
        startMatchmakerPump();
        const clearSpy = vi.spyOn(global, "clearInterval");
        stopMatchmakerPump();
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });

    it("the scheduled callback drives processMatches — evicts stale entries on tick", async () => {
        vi.useFakeTimers();

        // Queue an entry whose session is NOT registered in the handler.
        // processMatches should detect the missing session and remove it.
        await vi.spyOn(await import("./auth/auth"), "sessionHandler", "get").mockReturnValue({
            getSession: () => undefined,
            getSessions: () => [],
            addSession: vi.fn(),
            removeSession: vi.fn(),
        } as any);

        gameQueue.push(staleEntry(1, "key-ghost"));
        expect(gameQueue).toHaveLength(1);

        startMatchmakerPump();
        vi.advanceTimersByTime(5_001);
        expect(gameQueue).toHaveLength(0);
    });

    it("processMatches recomputes power and matches across the tick boundary", async () => {
        vi.useFakeTimers();
        const { battleHandler } = await import("./battle/Battle");

        const p1 = powerSession(1, "key-a", 0);
        const p2 = powerSession(2, "key-b", 0);
        await vi.spyOn(await import("./auth/auth"), "sessionHandler", "get").mockReturnValue({
            getSession: (k: string, v: any) => {
                if (k === "session_key") return [p1, p2].find((s) => s.session_key === v);
                if (k === "user_id") return [p1, p2].find((s) => s.user_id === v);
                return undefined;
            },
            getSessions: () => [p1, p2],
            addSession: vi.fn(),
            removeSession: vi.fn(),
        } as any);

        gameQueue.push(staleEntry(1, "key-a"));
        gameQueue.push(staleEntry(2, "key-b"));

        startMatchmakerPump();
        vi.advanceTimersByTime(5_001);
        // Same power, same type, windows admit → battle on first tick.
        expect(battleHandler.addBattle).toHaveBeenCalledOnce();
        expect(gameQueue).toHaveLength(0);
    });
});
