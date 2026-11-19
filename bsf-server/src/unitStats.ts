// The rules that bring a unit's saved numbers into line with its class, and the one-time repair
// that reuses them (#409).
//
// statsForClass and withAbilityRanks moved here unchanged from src/services/roster.ts, where
// /unit/promote still uses them on every promotion. planUnitRepair applies the same two rules to
// units already saved, for src/tools/repairUnitStats.ts, so promotion and repair share one copy of
// the rule. The class ranges themselves are in src/classRanks.ts.

import { ClassDef, classDefFor } from "./classRanks";

// A unit that changes class has each of its numbers brought inside the new class's range, and
// gains any number the class has that it lacked, at the lowest value -- as the 2013 server did
// (EntityDef.applyClassStats). For the classes players can hold this only ever raises a number:
// a Shieldbanger's RANGE number of 1 becomes the 2 a Strongarm's class asks for. (RANGE is not
// how far a unit hits: each attack carries its own reach, and the game never reads this number
// by name.) The game makes the same correction each time it loads the unit, and logs an error
// for each number it had to move.
// Returns a new list; the unit's own list is left alone until the save succeeds.
export function statsForClass(stats: any[], def: ClassDef): any[] {
    const out = stats.map((s: any) => {
        const range = def.ranges.get(s?.stat);
        if (!range) return s;
        const value = typeof s.value === "number" && Number.isFinite(s.value) ? s.value : range.min;
        return { ...s, value: Math.max(range.min, Math.min(range.max, value)) };
    });
    for (const [stat, range] of def.ranges) {
        if (!out.some((s: any) => s?.stat === stat)) out.push({ stat, value: range.min });
    }
    return out;
}

// After every promotion, each ability rank the class has is set to the new RANK minus 1, kept
// inside the class's range, and added if the unit lacked it -- as the 2013 server did
// (EntityDef.checkAbilityRanks, run whenever RANK is set). The game works out the same numbers
// each time it loads the unit. Returns a new list.
const ABILITY_STATS = ["ABILITY_0", "ABILITY_1", "ABILITY_2"];
export function withAbilityRanks(stats: any[], def: ClassDef, rank: number): any[] {
    const out = [...stats];
    for (const stat of ABILITY_STATS) {
        const range = def.ranges.get(stat);
        if (!range) continue;
        const value = Math.max(range.min, Math.min(range.max, rank - 1));
        const i = out.findIndex((s: any) => s?.stat === stat);
        if (i === -1) out.push({ stat, value });
        else out[i] = { ...out[i], value };
    }
    return out;
}

// A number the repair raises. `from` is undefined when the unit had no such number.
export interface RaisedStat {
    stat: string;
    from: number | undefined;
    to: number;
}

// A number the rule would lower, which the repair leaves as stored.
export interface HeldBackStat {
    stat: string;
    stored: number;
    ruleWants: number;
}

export type UnitRepairPlan =
    | { kind: "unknown-class" }
    | { kind: "bad-shape" }
    | { kind: "rank-out-of-range"; rank: unknown; minRank: number; maxRank: number }
    | { kind: "ok"; stats: any[]; raised: RaisedStat[]; heldBack: HeldBackStat[] };

// The game holds each stat in a 32-bit int.
const isNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= -2147483648 && v <= 2147483647;

// Work out the repair for one saved unit, changing nothing (#409). The target is what a promotion
// into the unit's own class would give it: every number inside the class's range, and each ability
// rank at RANK minus 1. The repair only ever raises a number towards that target:
//   - a number the rule would lower is kept as stored, and listed in heldBack;
//   - RANK itself is never changed, because the ability ranks are worked out from it;
//   - a number the unit lacks is added at its target.
// A unit whose class the table does not know, whose RANK is missing or outside its class's
// range, or whose stats are not a list, is left whole. So is one that lists a stat twice, or
// stores something other than a 32-bit number for a stat its class has a range for: the game
// reads those its own way (the last of two entries wins; text such as "15" is read as 15; a
// bigger number wraps round), so the repair and the game could disagree about the value.
// The repaired list keeps the order of the
// stored one, with any added numbers at the end; every field of the unit other than its stats
// (id, name, class, kills, appearance and the rest) is the caller's to keep as stored.
export function planUnitRepair(unit: any): UnitRepairPlan {
    if (unit === null || typeof unit !== "object") return { kind: "bad-shape" };
    const def = classDefFor(unit.entityClass);
    if (!def) return { kind: "unknown-class" };
    if (!Array.isArray(unit.stats)) return { kind: "bad-shape" };

    const stored: any[] = unit.stats;
    const names = stored.map((s: any) => s?.stat);
    if (new Set(names).size !== names.length) return { kind: "bad-shape" };
    const rank = stored.find((s: any) => s?.stat === "RANK")?.value;
    if (!Number.isInteger(rank) || rank < def.minRank || rank > def.maxRank) {
        return { kind: "rank-out-of-range", rank, minRank: def.minRank, maxRank: def.maxRank };
    }
    if (stored.some((s: any) => def.ranges.has(s?.stat) && !isNumber(s.value))) return { kind: "bad-shape" };

    // statsForClass keeps the stored list's order and appends what was missing, and
    // withAbilityRanks changes entries in place or appends, so target[i] is stored[i]'s target.
    const target = withAbilityRanks(statsForClass(stored, def), def, rank);
    const stats: any[] = [];
    const raised: RaisedStat[] = [];
    const heldBack: HeldBackStat[] = [];

    stored.forEach((s: any, i: number) => {
        const t = target[i];
        if (t === s) {
            stats.push(s); // not a number this class has a range for
            return;
        }
        const ruleWants: number = t.value;
        if (ruleWants > s.value && s.stat !== "RANK") {
            raised.push({ stat: s.stat, from: s.value, to: ruleWants });
            stats.push({ ...s, value: ruleWants });
        } else {
            if (ruleWants !== s.value) heldBack.push({ stat: s.stat, stored: s.value, ruleWants });
            stats.push(s);
        }
    });
    for (const t of target.slice(stored.length)) {
        raised.push({ stat: t.stat, from: undefined, to: t.value });
        stats.push(t);
    }
    return { kind: "ok", stats, raised, heldBack };
}
