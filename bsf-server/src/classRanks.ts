// The game's own rules for promoting a unit: which class each class grows out of, the range
// each of its numbers may sit in, and what a promotion costs.
//
// Why the server needs a copy: the game works these out itself, raises the unit on screen, and
// only then asks the server. Before this table the server refused every promotion past stored
// rank 3 and knew two prices, where the game allows rank 4 and charges three (#305, #388).
//
// Where it comes from. The classes are the stock game's character_classes.json.z (in the game's
// assets/common/character folder; the same file sits in the reference folder described in
// REFERENCE.md). Despite the name it is not JSON: it is AMF3, Flash's binary packaging, inside a
// zlib wrapper. The prices are stat_costs.json.z beside it. Re-derive both if the game's data
// ever changes; nothing checks this copy against the game.
//
// The stored rank is one above the number players see (the game shows rank minus 1 as "power").
// A base class sits at rank 1 and never moves: its first promotion is a change of class, into
// an advanced class whose ranks run from 2 to 4.
//
// It fails in the safe direction: a class that is not listed here is refused with 400, which
// the game does not re-send.

// The order of the nine ranges in each row below.
const STAT_ORDER = [
    "STRENGTH",
    "ARMOR",
    "WILLPOWER",
    "EXERTION",
    "ARMOR_BREAK",
    "ABILITY_0",
    "MOVEMENT",
    "RANGE",
    "RANK",
] as const;

// Each row: the class, the class it is promoted from (null for a base class), and the lowest
// and highest value of each number in STAT_ORDER, written "lowest-highest".
const ROWS: readonly (readonly [string, string | null, string])[] = [
    ["archer", null, "4-7 4-7 5-8 1-2 1-1 0-0 3-3 5-5 1-1"],
    ["axeman", null, "6-9 6-9 4-6 1-2 1-2 0-0 4-4 1-1 1-1"],
    ["axemaster", "axeman", "6-12 6-12 4-11 1-3 1-3 1-3 4-4 1-1 2-4"],
    ["backbiter", "axeman", "8-10 5-12 4-13 0-3 1-3 1-3 4-4 1-1 2-4"],
    ["bowmaster", "archer", "4-8 4-9 5-12 1-3 1-2 1-3 3-3 5-5 2-4"],
    ["dredge_bellower", null, "20-20 16-16 4-4 2-2 5-5 1-1 3-3 1-1 4-4"],
    ["dredge_doom_slinger", "dredge_slag_slinger", "16-16 12-12 6-6 1-1 3-3 1-1 3-3 1-1 2-4"],
    ["dredge_fire_slinger", "dredge_slag_slinger", "6-9 5-8 2-6 1-1 1-2 1-1 3-3 1-1 2-4"],
    ["dredge_grunt", "dredge_grunt", "5-12 10-12 0-3 1-1 1-2 0-0 4-4 1-1 1-1"],
    ["dredge_scourge", "dredge_grunt", "14-20 14-16 1-4 1-1 1-3 1-1 4-4 1-1 2-4"],
    ["dredge_slag_slinger", null, "6-9 3-7 1-10 1-5 1-5 0-0 3-3 1-1 1-1"],
    ["dredge_stoneguard", "dredge_grunt", "14-16 14-20 1-4 1-1 1-4 1-1 3-3 1-1 2-4"],
    ["dredge_sun_slinger", "dredge_slag_slinger", "6-10 5-8 2-6 1-1 1-3 1-1 3-3 1-1 2-4"],
    ["dredge_torpor", "dredge_grunt", "20-20 16-16 4-4 2-2 5-5 1-1 3-3 1-1 4-4"],
    ["lancer", "spearman", "6-9 6-9 4-6 1-2 1-2 0-0 4-4 2-2 2-4"],
    ["provoker", "shieldbanger", "7-12 11-18 3-9 0-2 1-3 1-3 3-3 1-1 2-4"],
    ["shieldbanger", null, "8-10 9-14 3-5 1-1 1-2 0-0 3-3 1-1 1-1"],
    ["shieldmaster", "shieldbanger", "8-13 9-16 3-9 1-2 1-4 1-3 3-3 1-1 2-4"],
    ["siegearcher", "archer", "4-7 4-9 6-13 1-3 0-2 1-3 3-3 5-5 2-4"],
    ["skystriker", "archer", "4-8 3-9 7-13 1-3 0-1 1-3 3-3 5-5 2-4"],
    ["spearman", null, "6-9 6-9 4-6 1-2 1-2 0-0 4-4 2-2 1-1"],
    ["strongarm", "shieldbanger", "9-15 9-15 3-10 0-2 1-2 1-3 3-3 2-4 2-4"],
    ["thrasher", "axeman", "8-12 5-11 3-13 1-3 1-2 1-3 4-4 1-1 2-4"],
    ["tutorial_chieftain", "axeman", "8-12 5-11 3-13 1-3 1-2 1-1 4-4 1-1 2-2"],
    ["tutorial_raider", "axeman", "8-12 5-12 4-11 0-3 1-3 1-1 4-4 1-1 2-2"],
    ["wardog", "warrior", "10-19 7-12 3-8 1-3 1-2 1-1 4-4 1-1 2-2"],
    ["warhawk", "warrior", "10-16 7-12 2-11 0-2 1-2 1-3 4-4 1-1 2-4"],
    ["warleader", "warrior", "9-15 6-12 4-9 1-3 0-4 1-3 4-4 1-1 2-4"],
    ["warmaster", "warrior", "9-17 6-11 3-10 1-2 1-3 1-3 4-4 1-1 2-4"],
    ["warrior", null, "9-12 6-9 3-5 1-2 1-2 0-0 4-4 1-1 1-1"],
];

export interface StatRange {
    min: number;
    max: number;
}

export interface ClassDef {
    id: string;
    // The class a unit must already be to take this one. Null for a base class.
    parent: string | null;
    ranges: ReadonlyMap<string, StatRange>;
    minRank: number;
    maxRank: number;
}

// A Map, not a plain object: the class name arrives in a request, and a plain object would
// answer "yes, I have that" to words such as "constructor".
const CLASS_DEFS: ReadonlyMap<string, ClassDef> = new Map(
    ROWS.map(([id, parent, spec]) => {
        const parts = spec.split(" ");
        if (parts.length !== STAT_ORDER.length) throw new Error(`classRanks: ${id} needs ${STAT_ORDER.length} ranges`);
        const ranges = new Map<string, StatRange>();
        parts.forEach((part, i) => {
            const [min, max] = part.split("-").map(Number);
            if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
                throw new Error(`classRanks: ${id} has a bad range "${part}"`);
            }
            ranges.set(STAT_ORDER[i], { min, max });
        });
        const rank = ranges.get("RANK")!;
        return [id, { id, parent, ranges, minRank: rank.min, maxRank: rank.max }];
    })
);

export function classDefFor(classId: unknown): ClassDef | undefined {
    return typeof classId === "string" ? CLASS_DEFS.get(classId) : undefined;
}

export function allClassDefs(): ClassDef[] {
    return [...CLASS_DEFS.values()];
}

// What it costs to promote a unit standing at rank 1, 2 and 3. The game's file goes on to list
// 400 for three further ranks, which no class can reach.
export const PROMOTION_COSTS: readonly number[] = [20, 80, 160];

// The price of promoting a unit that is now at `fromRank`, or undefined when there is no such
// promotion (as the game reads it: promotes[rank - 1]).
export function promotionCost(fromRank: unknown): number | undefined {
    if (typeof fromRank !== "number" || !Number.isInteger(fromRank)) return undefined;
    return PROMOTION_COSTS[fromRank - 1];
}

// Everything a unit at `rank` has cost in promotions: 0 at rank 1, then 20, 100 and 260.
export function promotionRenownSpent(rank: unknown): number {
    if (typeof rank !== "number" || !Number.isFinite(rank)) return 0;
    let spent = 0;
    for (let from = 1; from < rank && from <= PROMOTION_COSTS.length; from++) spent += PROMOTION_COSTS[from - 1];
    return spent;
}
