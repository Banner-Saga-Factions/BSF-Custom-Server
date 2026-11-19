import { describe, it, expect } from "vitest";
import { planUnitRepair } from "./unitStats";
import { allClassDefs, classDefFor } from "./classRanks";
import { PURCHASABLE_UNITS } from "./services/account";

// The repair of units saved before #410 (#409). planUnitRepair only works out the change; the
// script in src/tools/repairUnitStats.ts writes it.

const stat = (stats: any[], name: string) => stats.find((s: any) => s.stat === name)?.value;

// Fish's unit as it is saved on the live server: a Strongarm still carrying the Shieldbanger's
// numbers, including RANGE 1 where a Strongarm is allowed 2 to 4, and ability rank 0.
function fishStrongarm(): any {
    return {
        class: "tbs.srv.data.EntityDef",
        id: "shieldbanger_vet_2",
        name: "Bjorn",
        entityClass: "strongarm",
        kills: 17,
        appearanceIndex: 2,
        autoLevel: 1,
        stats: [
            { class: "tbs.srv.data.Stat", stat: "RANK", value: 2 },
            { class: "tbs.srv.data.Stat", stat: "RANGE", value: 1 },
            { class: "tbs.srv.data.Stat", stat: "STRENGTH", value: 10 },
            { class: "tbs.srv.data.Stat", stat: "ARMOR", value: 12 },
            { class: "tbs.srv.data.Stat", stat: "WILLPOWER", value: 4 },
            { class: "tbs.srv.data.Stat", stat: "EXERTION", value: 1 },
            { class: "tbs.srv.data.Stat", stat: "ARMOR_BREAK", value: 1 },
            { class: "tbs.srv.data.Stat", stat: "MOVEMENT", value: 3 },
            { class: "tbs.srv.data.Stat", stat: "ABILITY_0", value: 0 },
        ],
    };
}

function ok(unit: any) {
    const plan = planUnitRepair(unit);
    if (plan.kind !== "ok") throw new Error(`expected ok, got ${plan.kind}`);
    return plan;
}

describe("planUnitRepair", () => {
    it("raises Fish's Strongarm's RANGE from 1 to the 2 its class allows", () => {
        const plan = ok(fishStrongarm());
        expect(stat(plan.stats, "RANGE")).toBe(2);
        expect(plan.raised).toContainEqual({ stat: "RANGE", from: 1, to: 2 });
    });

    it("sets the ability rank to rank minus 1", () => {
        const unit = fishStrongarm();
        unit.stats.find((s: any) => s.stat === "RANK").value = 4;
        const plan = ok(unit);
        expect(stat(plan.stats, "ABILITY_0")).toBe(3);
        expect(plan.raised).toContainEqual({ stat: "ABILITY_0", from: 0, to: 3 });
    });

    it("adds a number the unit lacks, at its target, after the stored ones", () => {
        const unit = fishStrongarm();
        unit.stats = unit.stats.filter((s: any) => s.stat !== "EXERTION");
        const plan = ok(unit);
        expect(plan.stats.at(-1)).toEqual({ stat: "EXERTION", value: 0 });
        expect(plan.raised).toContainEqual({ stat: "EXERTION", from: undefined, to: 0 });
    });

    it.each([["15"], ["ten"], [undefined], [-4294967286]])(
        "leaves a unit untouched when a stat it has a range for holds %j",
        (v) => {
            // The game reads "15" as 15, and -4294967286 wraps to 10, so writing the class's floor of
            // 9 would lower either.
            const unit = fishStrongarm();
            unit.stats.find((s: any) => s.stat === "STRENGTH").value = v;
            expect(planUnitRepair(unit)).toEqual({ kind: "bad-shape" });
        }
    );

    it("keeps a number the rule would lower, and reports it", () => {
        const unit = fishStrongarm();
        unit.stats.find((s: any) => s.stat === "ARMOR").value = 99;
        const plan = ok(unit);
        expect(stat(plan.stats, "ARMOR")).toBe(99);
        expect(plan.heldBack).toEqual([{ stat: "ARMOR", stored: 99, ruleWants: 15 }]);
        expect(plan.raised.map((r) => r.stat)).not.toContain("ARMOR");
    });

    it("keeps an ability rank above rank minus 1, and reports it", () => {
        const unit = fishStrongarm();
        unit.stats.find((s: any) => s.stat === "ABILITY_0").value = 3;
        const plan = ok(unit);
        expect(stat(plan.stats, "ABILITY_0")).toBe(3);
        expect(plan.heldBack).toEqual([{ stat: "ABILITY_0", stored: 3, ruleWants: 1 }]);
    });

    it.each([["RANK"], ["RANGE"], ["INJURY"]])("leaves a unit that lists %s more than once untouched", (name) => {
        // The game keeps the last entry, the repair would read the first.
        const unit = fishStrongarm();
        unit.stats.push({ stat: name, value: 0 }, { stat: name, value: 0 });
        expect(planUnitRepair(unit)).toEqual({ kind: "bad-shape" });
    });

    it("leaves a unit of a class the table does not know untouched", () => {
        const unit = { ...fishStrongarm(), entityClass: "mystery_class" };
        expect(planUnitRepair(unit)).toEqual({ kind: "unknown-class" });
    });

    it.each([
        ["missing", undefined],
        ["below the class's range", 1],
        ["above the class's range", 5],
        ["not a whole number", 2.5],
        ["not a number", "2"],
    ])("leaves a unit whose rank is %s untouched", (_why, rank) => {
        const unit = fishStrongarm();
        unit.stats = unit.stats.filter((s: any) => s.stat !== "RANK");
        if (rank !== undefined) unit.stats.push({ stat: "RANK", value: rank });
        expect(planUnitRepair(unit)).toEqual({ kind: "rank-out-of-range", rank, minRank: 2, maxRank: 4 });
    });

    it.each([
        ["not an object", null],
        ["stats not a list", { entityClass: "strongarm", stats: "RANK 2" }],
    ])("leaves a unit whose %s untouched", (_why, unit) => {
        expect(planUnitRepair(unit)).toEqual({ kind: "bad-shape" });
    });

    it("keeps the stored order, the stat entries' other fields, and everything outside the stats", () => {
        const unit = fishStrongarm();
        const before = structuredClone(unit);
        const plan = ok(unit);
        expect(unit).toEqual(before); // the input is not changed
        expect(plan.stats.slice(0, before.stats.length).map((s: any) => s.stat)).toEqual(
            before.stats.map((s: any) => s.stat)
        );
        for (const s of plan.stats) expect(s.class).toBe("tbs.srv.data.Stat");
        // What the script saves: the unit as stored, with only its stats swapped.
        const saved: any = { ...unit, stats: plan.stats };
        for (const field of ["id", "name", "entityClass", "kills", "appearanceIndex", "autoLevel", "class"]) {
            expect(saved[field]).toEqual(before[field]);
        }
        expect(stat(plan.stats, "RANK")).toBe(2);
    });

    it("finds nothing to raise on a second pass", () => {
        const first = ok(fishStrongarm());
        const second = ok({ ...fishStrongarm(), stats: first.stats });
        expect(second.raised).toEqual([]);
        expect(second.stats).toEqual(first.stats);
    });

    // Measured 2026-11-18: the hire list's base-class units are already right, but its six units of
    // an advanced class (skystriker_base and the like) are saved with ability rank 0, below the 1
    // their class allows. The repair raises that one number and nothing else.
    it("raises only the ability rank on the hire list's units, and only on its advanced ones", () => {
        for (const { def } of PURCHASABLE_UNITS.units as any[]) {
            const plan = ok(def);
            const advanced = classDefFor(def.entityClass)!.parent !== null;
            expect({ id: def.id, raised: plan.raised.map((r) => r.stat), heldBack: plan.heldBack }).toEqual({
                id: def.id,
                raised: advanced ? ["ABILITY_0"] : [],
                heldBack: [],
            });
        }
    });

    // The units #409 is about: promoted under the old rule, they kept their old class's numbers.
    // For every class a player can own, whatever the old class allowed is never above what the
    // new class allows, so the repair raises and never has to hold a number back. (Dredge classes
    // and the tutorial's own units are not a player's to own.)
    it("lowers nothing for a unit promoted into any class a player can own, wherever it stood before", () => {
        const playerClasses = allClassDefs().filter(
            (d) => d.parent && d.parent !== d.id && !/^(dredge_|tutorial_)/.test(d.id)
        );
        expect(playerClasses.length).toBeGreaterThan(10);
        for (const def of playerClasses) {
            const parent = classDefFor(def.parent)!;
            for (const end of ["min", "max"] as const) {
                for (let rank = def.minRank; rank <= def.maxRank; rank++) {
                    const stats = [...parent.ranges].map(([name, range]) => ({
                        stat: name,
                        value: name === "RANK" ? rank : name === "ABILITY_0" ? 0 : range[end],
                    }));
                    const plan = ok({ id: `${def.id}_${end}_${rank}`, entityClass: def.id, stats });
                    expect({ cls: def.id, end, rank, heldBack: plan.heldBack }).toEqual({
                        cls: def.id,
                        end,
                        rank,
                        heldBack: [],
                    });
                }
            }
        }
    });
});
