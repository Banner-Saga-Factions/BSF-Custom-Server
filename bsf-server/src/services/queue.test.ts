import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { matchmaking, gameQueue, QueueItem, stopMatchmakerPump, processMatches } from "./queue";
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
// accountData is included so calculateLevel() returns 0 deterministically — required
// because tryCreateBattle calls calculateLevel for the power-recompute fix.
function fakeSession(account_id: number, session_key: string): Session {
    return {
        account_id,
        session_key,
        user_id: account_id,
        battle_id: undefined,
        accountData: { roster_json: [], party_ids_json: [] },
        // notifyQueueUpdate calls pushData after a successful match.
        pushData: () => {},
    } as unknown as Session;
}

// Helper: build a QueueItem. New M2 fields (elo, threshold_*, tourney_id) are
// populated to the same initial values createQueueItem in queue.ts assigns
// at /vs/start time — so on-entry matching behaves the same as a real
// POST-driven entry.
function queueItem(account_id: number, type: GameModes, power: number, session_key: string): QueueItem {
    const eloWindow = type === GameModes.RANKED || type === GameModes.TOURNEY;
    return {
        account_id,
        type,
        power,
        session_key,
        queuedAt: new Date(),
        elo: 0,
        threshold_power: 0,
        threshold_elo: eloWindow ? 4 : Number.MAX_SAFE_INTEGER,
        threshold_power_max: 3, // computeDynamicPowerMax(0) = 3
        tourney_id: 0,
    };
}

// Stop the 5s auto-pump so it doesn't fire mid-test and splice the queue
// under us. Tests that need pump behavior call processMatches() directly.
stopMatchmakerPump();

beforeEach(async () => {
    // Clear the shared queue and reset the addBattle spy between tests
    gameQueue.length = 0;
    const { battleHandler } = await import("./battle/Battle");
    vi.mocked(battleHandler.addBattle).mockClear();
});

afterEach(() => {
    // Defensive: keep the pump stopped even if a test restarted it.
    stopMatchmakerPump();
});

describe("matchmaking()", () => {
    it("matches two players with the same type and power", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const opponent = fakeSession(1, "key-opponent");
        const challenger = fakeSession(2, "key-challenger");

        gameQueue.push(queueItem(1, GameModes.QUICK, 0, "key-opponent"));

        // The new tryCreateBattle looks up BOTH sessions via sessionHandler
        // (pre-M2 the challenger was passed in directly). Mock returns both.
        vi.spyOn(await import("./auth/auth"), "sessionHandler", "get").mockReturnValue({
            getSession: (_k: string, v: any) => {
                if (v === "key-opponent") return opponent;
                if (v === "key-challenger") return challenger;
                return undefined;
            },
            getSessions: () => [],
            addSession: vi.fn(),
            removeSession: vi.fn(),
        } as any);

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

// Wire sessionHandler so processMatches and tryCreateBattle can look up
// both sides. Returns the spy so the caller can restore it via vi.restoreAllMocks.
async function installSessionMock(sessions: Session[]) {
    const handler = {
        getSession: (k: string, v: any) => {
            if (k === "session_key") return sessions.find((s) => s.session_key === v);
            if (k === "user_id") return sessions.find((s) => s.user_id === v);
            return undefined;
        },
        getSessions: () => sessions,
        addSession: vi.fn(),
        removeSession: vi.fn(),
    };
    return vi.spyOn(await import("./auth/auth"), "sessionHandler", "get").mockReturnValue(handler as any);
}

// Build a session with a roster that yields a specific power via calculateLevel.
// power = sum of (RANK - 1) across party units. To get power=N: one unit at RANK=N+1.
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
        // notifyQueueUpdate calls pushData on every queued session after a
        // successful match. Provide a no-op so it doesn't blow up.
        pushData: () => {},
    } as unknown as Session;
}

describe("processMatches() — bracket widening over wait-time", () => {
    it("two QUICK players one power apart do not match on entry but match after threshold widens", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const p1 = powerSession(1, "key-a", 0);
        const p2 = powerSession(2, "key-b", 2);
        await installSessionMock([p1, p2]);

        // Queue both at t=0 with initial threshold_power=0 — power gap of 2
        // exceeds either threshold, so no match yet.
        const baseTime = new Date("2026-05-20T00:00:00Z");
        const item1 = { ...queueItem(1, GameModes.QUICK, 0, "key-a"), queuedAt: baseTime };
        const item2 = { ...queueItem(2, GameModes.QUICK, 2, "key-b"), queuedAt: baseTime };
        gameQueue.push(item1, item2);

        processMatches(baseTime.getTime());
        expect(battleHandler.addBattle).not.toHaveBeenCalled();

        // After 60s, bumpThreshold widens both entries' threshold_power:
        //   trunc(4 * 60000 / 90000) = trunc(2.66) = 2.
        // First call bumps thresholds (no match yet since the bump happens
        // AFTER findBestMatch fails for both entries). Second call finds
        // them within the now-widened windows.
        processMatches(baseTime.getTime() + 60_000);
        processMatches(baseTime.getTime() + 60_001);
        expect(battleHandler.addBattle).toHaveBeenCalledOnce();
    });

    it("RANKED players one power apart never match — equalPower locks threshold_power at 0", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const p1 = powerSession(1, "key-a", 0);
        const p2 = powerSession(2, "key-b", 1);
        await installSessionMock([p1, p2]);

        const baseTime = new Date("2026-05-20T00:00:00Z");
        // Construct RANKED entries with the matching threshold_elo init that
        // createQueueItem assigns (eloWindow=true → 4) — otherwise the elo
        // check would fail and obscure the power-check rejection we're testing.
        const item1 = { ...queueItem(1, GameModes.RANKED, 0, "key-a"), queuedAt: baseTime, elo: 1000 };
        const item2 = { ...queueItem(2, GameModes.RANKED, 1, "key-b"), queuedAt: baseTime, elo: 1000 };
        gameQueue.push(item1, item2);

        // Even at +10 minutes the power threshold stays at 0 for RANKED.
        processMatches(baseTime.getTime() + 10 * 60_000);
        processMatches(baseTime.getTime() + 10 * 60_000 + 1);
        expect(battleHandler.addBattle).not.toHaveBeenCalled();
    });

    it("drops a queued entry whose session has disappeared (no battle, no crash)", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const p1 = powerSession(1, "key-a", 0);
        // p2's session is never registered — only p1 in the mock.
        await installSessionMock([p1]);

        const baseTime = new Date("2026-05-20T00:00:00Z");
        const item1 = { ...queueItem(1, GameModes.QUICK, 0, "key-a"), queuedAt: baseTime };
        const itemGhost = { ...queueItem(2, GameModes.QUICK, 0, "key-ghost"), queuedAt: baseTime };
        gameQueue.push(item1, itemGhost);

        processMatches(baseTime.getTime());

        // Ghost evicted; p1 stays put.
        expect(gameQueue).toHaveLength(1);
        expect(gameQueue[0]).toBe(item1);
        expect(battleHandler.addBattle).not.toHaveBeenCalled();
    });
});

describe("processMatches() — power-recompute closes the snapshot race", () => {
    it("uses the fresh power from accountData, not the queue-entry snapshot", async () => {
        const { battleHandler } = await import("./battle/Battle");

        // p1 starts at power=0, p2 starts at power=8. With initial
        // threshold_power=0 they cannot match. Then p1 promotes a unit
        // to power=8 mid-queue — fresh recompute should let them pair.
        const p1 = powerSession(1, "key-a", 0);
        const p2 = powerSession(2, "key-b", 8);
        await installSessionMock([p1, p2]);

        const baseTime = new Date("2026-05-20T00:00:00Z");
        const item1 = { ...queueItem(1, GameModes.QUICK, 0, "key-a"), queuedAt: baseTime };
        const item2 = { ...queueItem(2, GameModes.QUICK, 8, "key-b"), queuedAt: baseTime };
        gameQueue.push(item1, item2);

        // No match yet — power gap of 8 vastly exceeds initial threshold_power=0.
        processMatches(baseTime.getTime());
        expect(battleHandler.addBattle).not.toHaveBeenCalled();

        // Player 1 promotes a unit (in-memory accountData mutation, the same
        // path /roster/unit/promote takes). Power recomputes to 8 on next tick.
        const u = p1.accountData!.roster_json[0] as any;
        u.stats.find((s: any) => s.stat === "RANK").value = 9;

        processMatches(baseTime.getTime() + 1);
        // After recompute, both entries are at power=8 — exact match.
        expect(battleHandler.addBattle).toHaveBeenCalledOnce();

        // Verify the per-side perSide array reflects the recomputed power.
        const callArgs = vi.mocked(battleHandler.addBattle).mock.calls[0];
        const perSide = callArgs[2];
        expect(perSide).toEqual([
            { power: expect.any(Number), elo: 0 },
            { power: expect.any(Number), elo: 0 },
        ]);
        // Both sides ended at power=8 (p1 after promotion, p2 unchanged).
        expect(perSide[0].power).toBe(8);
        expect(perSide[1].power).toBe(8);
    });
});

describe("BSF_MATCHMAKER_LEGACY=true — instant rollback path", () => {
    let priorEnv: string | undefined;

    beforeEach(() => {
        priorEnv = process.env.BSF_MATCHMAKER_LEGACY;
        process.env.BSF_MATCHMAKER_LEGACY = "true";
    });

    afterEach(() => {
        if (priorEnv === undefined) delete process.env.BSF_MATCHMAKER_LEGACY;
        else process.env.BSF_MATCHMAKER_LEGACY = priorEnv;
    });

    it("matchmaking still pairs exact-power-equal players (pre-M2 behavior)", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const opponent = fakeSession(1, "key-opponent");
        const challenger = fakeSession(2, "key-challenger");
        await installSessionMock([opponent, challenger]);

        gameQueue.push(queueItem(1, GameModes.QUICK, 3, "key-opponent"));
        const item = queueItem(2, GameModes.QUICK, 3, "key-challenger");
        gameQueue.push(item);

        matchmaking(item, challenger);

        expect(battleHandler.addBattle).toHaveBeenCalledOnce();
    });

    it("processMatches is a no-op in legacy mode (no bracket widening)", async () => {
        const { battleHandler } = await import("./battle/Battle");

        const p1 = powerSession(1, "key-a", 0);
        const p2 = powerSession(2, "key-b", 2);
        await installSessionMock([p1, p2]);

        const baseTime = new Date("2026-05-20T00:00:00Z");
        const item1 = { ...queueItem(1, GameModes.QUICK, 0, "key-a"), queuedAt: baseTime };
        const item2 = { ...queueItem(2, GameModes.QUICK, 2, "key-b"), queuedAt: baseTime };
        gameQueue.push(item1, item2);

        // Even an hour later — legacy mode never widens.
        processMatches(baseTime.getTime() + 60 * 60_000);
        processMatches(baseTime.getTime() + 60 * 60_000 + 1);
        expect(battleHandler.addBattle).not.toHaveBeenCalled();
    });
});
