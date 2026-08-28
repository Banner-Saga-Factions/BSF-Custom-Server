// Pure renown-award math, ported from the original 2013 Java server's
// tbs.srv.battle.BattleMonitor.constructBattleFinishedData (lines 1091-1251).
// No DB, no I/O — DB writes happen in Battle.ts endgame().
// BSF_RENOWN_LEGACY_FORMULA=true falls back to the pre-M1.5 flat formula
// for instant rollback. DAILY and BOOST are deferred (they need supporting infra);
// FRIEND was declined in #205 and is not coming.

import { BattleRenownAwardTypes } from "../../const";

export const WIN_AWARD = 5;
export const KILL_RENOWN = 1;
export const UNDERDOG_MAX = 4;
export const EXPERT_TIMER_SEC = 30;
export const EXPERT_AWARD = 2;
export const STREAK_MIN = 2;
export const STREAK_MIN_PARTY_POWER = 6;
export const STREAK_AWARD = 1;

export const LEGACY_WIN_BONUS = 20;
export const LEGACY_PER_KILL = 3;

export type RenownAwardsInput = {
    winnerKills: number;
    loserKills: number;
    winnerPower: number;
    loserPower: number;
    winnerWinStreakBefore: number;
    battleDurationSec: number;
    loserSurrendered: boolean;
    isFriendly: boolean;
};

export type AwardsBreakdown = Partial<Record<BattleRenownAwardTypes, number>>;

export type RenownAwardsResult = {
    winner: AwardsBreakdown;
    loser: AwardsBreakdown;
    winnerTotal: number;
    loserTotal: number;
};

export function computeRenownAwards(input: RenownAwardsInput): RenownAwardsResult {
    // Checked FIRST, ahead of the rollback flag below, and that order is the whole
    // point. Whether a battle two friends arranged pays anything is a decision about
    // the game (#205), not a version of the arithmetic — so switching the formula back
    // must not quietly switch the decision back with it. Before this was moved, turning
    // the flag on paid renown for a friend match while unit kill credit stayed withheld,
    // leaving the two halves of "pays nothing" disagreeing with each other.
    if (input.isFriendly) {
        return { winner: {}, loser: {}, winnerTotal: 0, loserTotal: 0 };
    }

    if (process.env.BSF_RENOWN_LEGACY_FORMULA === "true") {
        return computeLegacyAwards(input);
    }

    const winner: AwardsBreakdown = {};
    const loser: AwardsBreakdown = {};

    // Winner's KILLS suppressed when loser surrendered — matches Java's
    // "opponent must not have surrendered" gate. Loser's KILLS are never
    // suppressed by the winner, since the winner can't surrender.
    if (!input.loserSurrendered && input.winnerKills > 0) {
        winner[BattleRenownAwardTypes.KILLS] = input.winnerKills * KILL_RENOWN;
    }
    if (input.loserKills > 0) {
        loser[BattleRenownAwardTypes.KILLS] = input.loserKills * KILL_RENOWN;
    }

    winner[BattleRenownAwardTypes.WIN] = WIN_AWARD;

    const powerGap = input.loserPower - input.winnerPower;
    if (powerGap > 0) {
        winner[BattleRenownAwardTypes.UNDERDOG] = Math.min(UNDERDOG_MAX, powerGap);
    }

    if (input.battleDurationSec <= EXPERT_TIMER_SEC) {
        winner[BattleRenownAwardTypes.EXPERT] = EXPERT_AWARD;
    }

    // ≥2 means this win is the 3rd consecutive (Java reads pre-update streak).
    // Both sides' power must clear the ranked threshold — matches Java's
    // battle_ranking_allowed gate, which returns false if *any* party is under
    // the floor (curb-stomp protection only works if both sides are checked).
    if (
        input.winnerWinStreakBefore >= STREAK_MIN &&
        input.winnerPower >= STREAK_MIN_PARTY_POWER &&
        input.loserPower >= STREAK_MIN_PARTY_POWER
    ) {
        winner[BattleRenownAwardTypes.STREAK] = STREAK_AWARD;
    }

    return {
        winner,
        loser,
        winnerTotal: sumBreakdown(winner),
        loserTotal: sumBreakdown(loser),
    };
}

function computeLegacyAwards(input: RenownAwardsInput): RenownAwardsResult {
    // Pre-M1.5 unconditionally wrote a KILLS key on both sides (even when 0),
    // so the legacy fallback restores that wire shape bit-exact for rollback.
    const winner: AwardsBreakdown = {
        [BattleRenownAwardTypes.WIN]: LEGACY_WIN_BONUS,
        [BattleRenownAwardTypes.KILLS]: input.winnerKills * LEGACY_PER_KILL,
    };
    const loser: AwardsBreakdown = {
        [BattleRenownAwardTypes.KILLS]: input.loserKills * LEGACY_PER_KILL,
    };
    return {
        winner,
        loser,
        winnerTotal: LEGACY_WIN_BONUS + input.winnerKills * LEGACY_PER_KILL,
        loserTotal: input.loserKills * LEGACY_PER_KILL,
    };
}

function sumBreakdown(b: AwardsBreakdown): number {
    let total = 0;
    for (const v of Object.values(b)) {
        if (typeof v === "number") total += v;
    }
    return total;
}
