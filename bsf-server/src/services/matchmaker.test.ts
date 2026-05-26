import { describe, it, expect } from "vitest";
import {
    bumpThreshold,
    checkWindows,
    bestMatchScore,
} from "./queue";
import { GameModes } from "../const";

// ============================================================================
// Pure-function parity tests for the M2 matchmaker port.
//
// Ported from tbs.srv.worker.VsWorker.java (see Plan-Integrate-Original-Stoic
// -Server.md milestone M2). Java references in each describe-block.
//
// Module constants in queue.ts that these tests rely on (env-var defaults):
//   VS_WINDOW_POWER_MIN=0, VS_WINDOW_POWER_MAX=4
//   VS_QUICK_ELO_DIFF=50
//   VS_BRACKET_ELO=200, VS_BRACKET_POWER=4
// ============================================================================

describe("bumpThreshold (VsWorker.java:226-240)", () => {
    it("returns min at t=0", () => {
        expect(bumpThreshold(0, 0, 0, 4, 90_000)).toBe(0);
    });

    it("returns midpoint at t=duration/2", () => {
        // trunc(4 * 45000 / 90000) = trunc(2.0) = 2
        expect(bumpThreshold(45_000, 0, 0, 4, 90_000)).toBe(2);
    });

    it("returns max at t=duration", () => {
        expect(bumpThreshold(90_000, 0, 0, 4, 90_000)).toBe(4);
    });

    it("clamps to max past duration", () => {
        expect(bumpThreshold(200_000, 4, 0, 4, 90_000)).toBe(4);
    });

    it("returns cur unchanged when cur < 0 (infinite)", () => {
        // Java semantics: negative cur means "infinite, don't grow"
        expect(bumpThreshold(5_000, -1, 0, 4, 90_000)).toBe(-1);
    });

    it("returns min when range is zero", () => {
        expect(bumpThreshold(45_000, 0, 7, 7, 90_000)).toBe(7);
    });

    it("uses truncation (toward zero) not floor — matches Java (int) cast", () => {
        // 4 * 22500 / 90000 = 1.0 exactly
        expect(bumpThreshold(22_500, 0, 0, 4, 90_000)).toBe(1);
        // 4 * 22501 / 90000 = 1.0000444... → trunc to 1
        expect(bumpThreshold(22_501, 0, 0, 4, 90_000)).toBe(1);
    });
});

describe("checkWindows (VsWorker.java:851-865)", () => {
    const baseEntry = {
        type: GameModes.QUICK,
        power: 0,
        elo: 0,
        threshold_power: 0,
        threshold_elo: Number.MAX_SAFE_INTEGER,
    };

    it("admits identical entries", () => {
        expect(checkWindows({ ...baseEntry }, { ...baseEntry })).toBe(true);
    });

    it("rejects when power difference exceeds either threshold", () => {
        const a = { ...baseEntry, power: 0, threshold_power: 0 };
        const b = { ...baseEntry, power: 5, threshold_power: 0 };
        expect(checkWindows(a, b)).toBe(false);
    });

    it("admits when power difference fits both thresholds", () => {
        const a = { ...baseEntry, power: 0, threshold_power: 5 };
        const b = { ...baseEntry, power: 5, threshold_power: 5 };
        expect(checkWindows(a, b)).toBe(true);
    });

    it("rejects when one side's power threshold is too tight", () => {
        // Java: powerDifference > entry.threshold_power || powerDifference > other.threshold_power
        // So the stricter of the two thresholds wins.
        const a = { ...baseEntry, power: 0, threshold_power: 5 };
        const b = { ...baseEntry, power: 5, threshold_power: 4 };
        expect(checkWindows(a, b)).toBe(false);
    });

    it("uses VS_QUICK_ELO_DIFF=50 when either side has elo <= 0", () => {
        // Both elos zero → effective diff 50. Threshold of 51 admits, 49 rejects.
        const lowThresh = { ...baseEntry, threshold_elo: 49 };
        const highThresh = { ...baseEntry, threshold_elo: 51 };
        expect(checkWindows(lowThresh, lowThresh)).toBe(false);
        expect(checkWindows(highThresh, highThresh)).toBe(true);
    });

    it("rejects on large Elo gap when both elos > 0", () => {
        const a = { ...baseEntry, elo: 1000, threshold_elo: 100 };
        const b = { ...baseEntry, elo: 1300, threshold_elo: 100 };
        expect(checkWindows(a, b)).toBe(false);
    });

    it("admits on Elo gap exactly at the threshold", () => {
        const a = { ...baseEntry, elo: 1000, threshold_elo: 100 };
        const b = { ...baseEntry, elo: 1100, threshold_elo: 100 };
        expect(checkWindows(a, b)).toBe(true);
    });
});

describe("bestMatchScore (VsBestMatchComparator, VsWorker.java:743-761)", () => {
    // MULT=100; dElo=trunc(100*(a.elo-b.elo)/200); dPower=trunc(100*(a.power-b.power)/4)
    // dTimer dropped from the port (bsf-server has no per-player timer preference).
    // Type-mismatch penalty: d += (d > 0) ? 1 : -1

    const base = { type: GameModes.QUICK, elo: 0, power: 0 };

    it("identical entries score 0", () => {
        expect(bestMatchScore({ ...base }, { ...base })).toBe(0);
    });

    it("power gap of VS_BRACKET_POWER=4 produces magnitude 100", () => {
        const a = { ...base, power: 4 };
        const b = { ...base, power: 0 };
        expect(bestMatchScore(a, b)).toBe(100);
        expect(bestMatchScore(b, a)).toBe(-100);
    });

    it("ignores Elo when either side has elo <= 0", () => {
        const a = { ...base, elo: 0, power: 0 };
        const b = { ...base, elo: 1000, power: 0 };
        // useElo guard requires BOTH > 0
        expect(bestMatchScore(a, b)).toBe(0);
    });

    it("type mismatch penalizes the score by 1 (away from zero)", () => {
        const a = { ...base, type: GameModes.QUICK, elo: 1000, power: 0 };
        const b = { ...base, type: GameModes.RANKED, elo: 1000, power: 0 };
        // dElo=0, dPower=0, total=0 → type penalty pushes to -1 (d>0 is false)
        expect(bestMatchScore(a, b)).toBe(-1);
    });

    it("Elo gap of VS_BRACKET_ELO=200 produces magnitude 100", () => {
        const a = { ...base, type: GameModes.RANKED, elo: 1200, power: 0 };
        const b = { ...base, type: GameModes.RANKED, elo: 1000, power: 0 };
        expect(bestMatchScore(a, b)).toBe(100);
    });
});
