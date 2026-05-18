// Parity tests ported from tbs.srv.battle.BattleRankingTest (original
// 2013 Java server). Goal: bit-for-bit Elo math equivalence so a
// player's rating moves the same way it would have on the original.

import { describe, it, expect } from "vitest";
import { calculateNewElo, getEloKFactor } from "./ranking";

describe("BattleRanking parity — calculateNewElo", () => {
    it("baseline matchup (1000 vs 1000, K=32)", () => {
        expect(calculateNewElo(1000, 1000, 1)).toBe(1016);
        expect(calculateNewElo(1000, 1000, 0)).toBe(984);
    });

    it("blowout matchup — expected results barely move Elo", () => {
        expect(calculateNewElo(2332, 1032, 1)).toBe(2332);
        expect(calculateNewElo(1032, 2332, 0)).toBe(1032);
    });

    it("tirean cases — verifies Math.trunc (not Math.floor) for negative deltas", () => {
        expect(calculateNewElo(1016, 1000, 1)).toBe(1031);
        expect(calculateNewElo(1032, 984, 1)).toBe(1045);
        expect(calculateNewElo(1364, 930, 0)).toBe(1335);
        expect(calculateNewElo(1335, 1010, 1)).toBe(1339);
        expect(calculateNewElo(1351, 994, 0)).toBe(1323);
        expect(calculateNewElo(1335, 1010, 0)).toBe(1308);
    });
});

describe("BattleRanking parity — getEloKFactor", () => {
    it("K = 32 at or below Elo 2100", () => {
        expect(getEloKFactor(1000)).toBeCloseTo(32, 4);
        expect(getEloKFactor(1500)).toBeCloseTo(32, 4);
        expect(getEloKFactor(2000)).toBeCloseTo(32, 4);
        expect(getEloKFactor(2100)).toBeCloseTo(32, 4);
    });

    it("K interpolates 32 → 16 between Elo 2100 and 2400", () => {
        expect(getEloKFactor(2200)).toBeCloseTo(32 - 0.333333 * 16, 4);
        expect(getEloKFactor(2300)).toBeCloseTo(32 - 0.666666 * 16, 4);
    });

    it("K = 16 at or above Elo 2400", () => {
        expect(getEloKFactor(2400)).toBeCloseTo(16, 4);
        expect(getEloKFactor(2500)).toBeCloseTo(16, 4);
    });
});
