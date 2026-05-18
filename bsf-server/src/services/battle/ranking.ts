// Pure Elo math, ported from the original 2013 Java server's
// tbs.srv.battle.BattleRanking (see bsf-refs/server-2013-java/...).
// No DB, no I/O — DB-backed helpers live in src/db/ranking.ts.

export const ELO_BEGIN = 1000;
export const ELO_MIN = 100;

export const K_MAX = 32;
export const K_MIN = 16;
export const K_ELO_MIN = 2100;
export const K_ELO_MAX = 2400;

export const TOURNEY_ID_GLOBAL = 0;

export function getEloKFactor(elo: number): number {
    const K_RANGE = K_MAX - K_MIN;
    const K_ELO_RANGE = K_ELO_MAX - K_ELO_MIN;
    const t = 1.0 - Math.max(0, Math.min(1, (elo - K_ELO_MIN) / K_ELO_RANGE));
    return K_MIN + K_RANGE * t;
}

export function calculateNewElo(myElo: number, otherElo: number, score: number): number {
    const k = getEloKFactor(myElo);
    const ea = 1 / (1 + Math.pow(10, (otherElo - myElo) / 400.0));
    // Math.trunc matches Java's (int) cast (truncate toward zero); Math.floor
    // would diverge for negative deltas (e.g. 1351/994 loss → 1322 not 1323).
    const newElo = myElo + Math.trunc(k * (score - ea));
    return Math.max(ELO_MIN, newElo);
}
