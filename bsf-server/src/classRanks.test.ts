import { describe, it, expect } from "vitest";
import { allClassDefs, classDefFor, promotionCost, promotionRenownSpent } from "./classRanks";

// The table is a hand-kept copy of the game's class file. These tests cannot tell whether a
// number in it is the game's; they catch a row that was mangled or left out.
describe("classRanks: the game's class table", () => {
    it("lists the game's 30 classes", () => {
        expect(allClassDefs()).toHaveLength(30);
    });

    it("gives every advanced class a parent that is itself in the table", () => {
        for (const def of allClassDefs()) {
            if (def.parent !== null) expect(classDefFor(def.parent), def.id).toBeDefined();
        }
    });

    it("keeps base classes at rank 1 and starts every playable advanced class at rank 2", () => {
        for (const id of ["archer", "axeman", "shieldbanger", "warrior", "spearman"]) {
            expect(classDefFor(id)).toMatchObject({ parent: null, minRank: 1, maxRank: 1 });
        }
        expect(classDefFor("strongarm")).toMatchObject({ parent: "shieldbanger", minRank: 2, maxRank: 4 });
        expect(classDefFor("wardog")).toMatchObject({ parent: "warrior", minRank: 2, maxRank: 2 });
    });

    it("does not answer to names that are not classes", () => {
        for (const name of ["constructor", "__proto__", "toString", "", undefined, null, 3, ["archer"]]) {
            expect(classDefFor(name)).toBeUndefined();
        }
    });

    it("prices the three promotions at 20, 80 and 160, and nothing beyond", () => {
        expect([1, 2, 3].map(promotionCost)).toEqual([20, 80, 160]);
        for (const rank of [0, 4, 5, -1, 1.5, "1", undefined]) expect(promotionCost(rank)).toBeUndefined();
    });

    it("adds up what a unit at each rank has cost", () => {
        expect([1, 2, 3, 4, 9].map(promotionRenownSpent)).toEqual([0, 20, 100, 260, 260]);
        expect(promotionRenownSpent(undefined)).toBe(0);
    });
});
