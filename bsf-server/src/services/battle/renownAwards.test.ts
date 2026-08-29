// Parity tests for the M1.5 renown-award port. Each scenario locks down
// one Java parity rule from tbs.srv.battle.BattleMonitor.constructBattleFinishedData
// (lines 1091-1251). The legacy-formula block confirms the BSF_RENOWN_LEGACY_FORMULA
// rollback path still produces the pre-M1.5 wire shape (KILLS + WIN only,
// flat 20 + kills × 3).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeRenownAwards, RenownAwardsInput } from "./renownAwards";
import { BattleRenownAwardTypes } from "../../const";

const baseInput: RenownAwardsInput = {
    winnerKills: 0,
    loserKills: 0,
    winnerPower: 6,
    loserPower: 6,
    winnerWinStreakBefore: 0,
    battleDurationSec: 120,
    loserSurrendered: false,
    isFriendly: false,
};

describe("computeRenownAwards — Java parity", () => {
    it("plain 3-kill win, equal power, no streak, slow battle", () => {
        const result = computeRenownAwards({ ...baseInput, winnerKills: 3 });
        expect(result.winner).toEqual({
            [BattleRenownAwardTypes.KILLS]: 3,
            [BattleRenownAwardTypes.WIN]: 5,
        });
        expect(result.loser).toEqual({});
        expect(result.winnerTotal).toBe(8);
        expect(result.loserTotal).toBe(0);
    });

    it("loser landed kills — loser breakdown has KILLS but no other awards", () => {
        const result = computeRenownAwards({
            ...baseInput,
            winnerKills: 3,
            loserKills: 2,
        });
        expect(result.loser).toEqual({ [BattleRenownAwardTypes.KILLS]: 2 });
        expect(result.loserTotal).toBe(2);
    });

    describe("UNDERDOG", () => {
        it("power gap +3 adds UNDERDOG=3", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                winnerPower: 6,
                loserPower: 9,
            });
            expect(result.winner[BattleRenownAwardTypes.UNDERDOG]).toBe(3);
        });

        it("power gap +10 caps UNDERDOG at 4", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                winnerPower: 6,
                loserPower: 16,
            });
            expect(result.winner[BattleRenownAwardTypes.UNDERDOG]).toBe(4);
        });

        it("equal power → no UNDERDOG key", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
            });
            expect(result.winner[BattleRenownAwardTypes.UNDERDOG]).toBeUndefined();
        });

        it("winner stronger than loser → no UNDERDOG key", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                winnerPower: 10,
                loserPower: 6,
            });
            expect(result.winner[BattleRenownAwardTypes.UNDERDOG]).toBeUndefined();
        });
    });

    describe("EXPERT", () => {
        it("quick win (28 sec) → EXPERT=2", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                battleDurationSec: 28,
            });
            expect(result.winner[BattleRenownAwardTypes.EXPERT]).toBe(2);
        });

        it("exactly 30 sec → EXPERT=2 (inclusive boundary)", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                battleDurationSec: 30,
            });
            expect(result.winner[BattleRenownAwardTypes.EXPERT]).toBe(2);
        });

        it("31 sec → no EXPERT key", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                battleDurationSec: 31,
            });
            expect(result.winner[BattleRenownAwardTypes.EXPERT]).toBeUndefined();
        });
    });

    describe("STREAK", () => {
        it("streak=2 + power=6 → STREAK=1", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                winnerWinStreakBefore: 2,
                winnerPower: 6,
            });
            expect(result.winner[BattleRenownAwardTypes.STREAK]).toBe(1);
        });

        it("streak=1 + power=10 → no STREAK (streak gate)", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                winnerWinStreakBefore: 1,
                winnerPower: 10,
            });
            expect(result.winner[BattleRenownAwardTypes.STREAK]).toBeUndefined();
        });

        it("streak=5 + power=5 → no STREAK (winner power gate)", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                winnerWinStreakBefore: 5,
                winnerPower: 5,
            });
            expect(result.winner[BattleRenownAwardTypes.STREAK]).toBeUndefined();
        });

        it("streak=2 + winnerPower=10 + loserPower=3 → no STREAK (loser power gate)", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 3,
                winnerWinStreakBefore: 2,
                winnerPower: 10,
                loserPower: 3,
            });
            expect(result.winner[BattleRenownAwardTypes.STREAK]).toBeUndefined();
        });
    });

    describe("surrender", () => {
        it("loser surrendered → winner KILLS suppressed even with deaths recorded", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 2,
                loserSurrendered: true,
            });
            expect(result.winner[BattleRenownAwardTypes.KILLS]).toBeUndefined();
            expect(result.winner[BattleRenownAwardTypes.WIN]).toBe(5);
        });

        it("loser surrendered but loser killed winner units → loser KILLS still awarded", () => {
            const result = computeRenownAwards({
                ...baseInput,
                winnerKills: 0,
                loserKills: 2,
                loserSurrendered: true,
            });
            expect(result.loser).toEqual({ [BattleRenownAwardTypes.KILLS]: 2 });
        });
    });

    it("friendly battle → no awards on either side", () => {
        const result = computeRenownAwards({
            ...baseInput,
            winnerKills: 5,
            loserKills: 3,
            isFriendly: true,
        });
        expect(result.winner).toEqual({});
        expect(result.loser).toEqual({});
        expect(result.winnerTotal).toBe(0);
        expect(result.loserTotal).toBe(0);
    });

    it("stacking: underdog + fast + streaked win", () => {
        const result = computeRenownAwards({
            ...baseInput,
            winnerKills: 3,
            winnerPower: 6,
            loserPower: 8,
            winnerWinStreakBefore: 3,
            battleDurationSec: 25,
        });
        expect(result.winner).toEqual({
            [BattleRenownAwardTypes.KILLS]: 3,
            [BattleRenownAwardTypes.WIN]: 5,
            [BattleRenownAwardTypes.UNDERDOG]: 2,
            [BattleRenownAwardTypes.EXPERT]: 2,
            [BattleRenownAwardTypes.STREAK]: 1,
        });
        expect(result.winnerTotal).toBe(13);
    });
});

describe("computeRenownAwards — legacy formula (BSF_RENOWN_LEGACY_FORMULA=true)", () => {
    let priorEnv: string | undefined;

    beforeEach(() => {
        priorEnv = process.env.BSF_RENOWN_LEGACY_FORMULA;
        process.env.BSF_RENOWN_LEGACY_FORMULA = "true";
    });

    afterEach(() => {
        if (priorEnv === undefined) delete process.env.BSF_RENOWN_LEGACY_FORMULA;
        else process.env.BSF_RENOWN_LEGACY_FORMULA = priorEnv;
    });

    it("3-kill win → winner {WIN:20, KILLS:9}; loser bit-exact pre-M1.5 shape {KILLS:0}", () => {
        const result = computeRenownAwards({ ...baseInput, winnerKills: 3 });
        expect(result.winner).toEqual({
            [BattleRenownAwardTypes.WIN]: 20,
            [BattleRenownAwardTypes.KILLS]: 9,
        });
        expect(result.loser).toEqual({ [BattleRenownAwardTypes.KILLS]: 0 });
        expect(result.winnerTotal).toBe(29);
        expect(result.loserTotal).toBe(0);
    });

    it("loser kills → loser breakdown KILLS×3", () => {
        const result = computeRenownAwards({
            ...baseInput,
            winnerKills: 3,
            loserKills: 2,
        });
        expect(result.loser).toEqual({ [BattleRenownAwardTypes.KILLS]: 6 });
        expect(result.loserTotal).toBe(6);
    });

    it("legacy ignores UNDERDOG / EXPERT / STREAK signals", () => {
        const result = computeRenownAwards({
            ...baseInput,
            winnerKills: 3,
            winnerPower: 6,
            loserPower: 10,
            winnerWinStreakBefore: 5,
            battleDurationSec: 20,
        });
        expect(result.winner[BattleRenownAwardTypes.UNDERDOG]).toBeUndefined();
        expect(result.winner[BattleRenownAwardTypes.EXPERT]).toBeUndefined();
        expect(result.winner[BattleRenownAwardTypes.STREAK]).toBeUndefined();
    });
});


// The friendly rule must outrank the rollback switch. Both are toggled by an operator,
// and one of them used to silently undo the other: BSF_RENOWN_LEGACY_FORMULA rolls the
// arithmetic back to the pre-M1.5 formula, and it returned before the friendly check was
// ever reached, so a friend match paid full renown while its unit kill credit stayed
// withheld — the two halves of "pays nothing" disagreeing. Found by review, 2026-08-27.
describe("a friendly battle pays nothing even under the legacy formula (#205)", () => {
    const original = process.env.BSF_RENOWN_LEGACY_FORMULA;
    afterEach(() => {
        if (original === undefined) delete process.env.BSF_RENOWN_LEGACY_FORMULA;
        else process.env.BSF_RENOWN_LEGACY_FORMULA = original;
    });

    const friendlyInput = {
        winnerKills: 3,
        loserKills: 2,
        winnerPower: 6,
        loserPower: 6,
        winnerWinStreakBefore: 5,
        battleDurationSec: 10,
        loserSurrendered: false,
        isFriendly: true,
    };

    it("pays nothing with the rollback switch on", () => {
        process.env.BSF_RENOWN_LEGACY_FORMULA = "true";
        const awards = computeRenownAwards(friendlyInput);
        expect(awards.winnerTotal).toBe(0);
        expect(awards.loserTotal).toBe(0);
        expect(awards.winner).toEqual({});
        expect(awards.loser).toEqual({});
    });

    // The control. Without it the test above would pass just as happily if the legacy
    // formula had stopped paying ANYBODY.
    it("still pays an ordinary battle with the rollback switch on", () => {
        process.env.BSF_RENOWN_LEGACY_FORMULA = "true";
        const awards = computeRenownAwards({ ...friendlyInput, isFriendly: false });
        expect(awards.winnerTotal).toBeGreaterThan(0);
        expect(awards.loserTotal).toBeGreaterThan(0);
    });
});
