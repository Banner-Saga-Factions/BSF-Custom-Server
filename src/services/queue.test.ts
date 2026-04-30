import { describe, it, expect, beforeEach, vi } from "vitest";
import { matchmaking, gameQueue, QueueItem } from "./queue";
import { GameModes } from "../const";
import { Session } from "./auth/auth";

// Replace battleHandler.addBattle with a spy so matchmaking() can call it
// without actually creating a Battle (which would push data to real sessions).
vi.mock("./battle/Battle", () => ({
    battleHandler: {
        addBattle: vi.fn(),
    },
}));

// Helper: build a minimal fake Session with only the fields matchmaking() uses.
// We cast to Session so TypeScript doesn't complain about missing EventEmitter methods.
function fakeSession(account_id: number, session_key: string): Session {
    return { account_id, session_key, user_id: account_id, battle_id: undefined } as unknown as Session;
}

// Helper: build a QueueItem
function queueItem(account_id: number, type: GameModes, power: number, session_key: string): QueueItem {
    return { account_id, type, power, session_key, queuedAt: new Date() };
}

beforeEach(async () => {
    // Clear the shared queue and reset the addBattle spy between tests
    gameQueue.length = 0;
    const { battleHandler } = await import("./battle/Battle");
    vi.mocked(battleHandler.addBattle).mockClear();
});

describe("matchmaking()", () => {
    it("matches two players with the same type and power", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const opponent = fakeSession(1, "key-opponent");
        gameQueue.push(queueItem(1, GameModes.QUICK, 0, "key-opponent"));

        // Wire sessionHandler so matchmaking can find the opponent session
        vi.spyOn(await import("./auth/auth"), "sessionHandler", "get").mockReturnValue({
            getSession: (_k: string, v: any) => (v === "key-opponent" ? opponent : undefined),
            getSessions: () => [],
            addSession: vi.fn(),
            removeSession: vi.fn(),
        } as any);

        const challenger = fakeSession(2, "key-challenger");
        const item = queueItem(2, GameModes.QUICK, 0, "key-challenger");
        gameQueue.push(item);

        matchmaking(item, challenger);

        expect(battleHandler.addBattle).toHaveBeenCalledOnce();
    });

    it("does not match players with different power", async () => {
        const { battleHandler } = await import("./battle/Battle");

        gameQueue.push(queueItem(1, GameModes.QUICK, 0, "key-opponent"));

        const challenger = fakeSession(2, "key-challenger");
        const item = queueItem(2, GameModes.QUICK, 5, "key-challenger"); // power 5 ≠ 0
        gameQueue.push(item);

        matchmaking(item, challenger);

        expect(battleHandler.addBattle).not.toHaveBeenCalled();
    });

    it("does not match players with different vs_type", async () => {
        const { battleHandler } = await import("./battle/Battle");

        gameQueue.push(queueItem(1, GameModes.RANKED, 0, "key-opponent"));

        const challenger = fakeSession(2, "key-challenger");
        const item = queueItem(2, GameModes.QUICK, 0, "key-challenger"); // QUICK ≠ RANKED
        gameQueue.push(item);

        matchmaking(item, challenger);

        expect(battleHandler.addBattle).not.toHaveBeenCalled();
    });

    it("does not match a player against themselves", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const challenger = fakeSession(1, "key-solo");
        const item = queueItem(1, GameModes.QUICK, 0, "key-solo");
        gameQueue.push(item);

        matchmaking(item, challenger);

        expect(battleHandler.addBattle).not.toHaveBeenCalled();
    });
});
