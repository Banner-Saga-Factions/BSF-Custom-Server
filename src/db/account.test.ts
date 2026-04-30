import { describe, it, expect } from "vitest";
import { parseRow } from "./account";

describe("parseRow", () => {
    it("parses roster_json and party_ids_json from JSON strings", () => {
        const raw = {
            user_id: 123,
            username: "player",
            renown: 0,
            daily_login_streak: 0,
            login_count: 1,
            completed_tutorial: 1,
            roster_rows: 2,
            roster_json: '[{"id":"unit1"}]',
            party_ids_json: '["unit1"]',
        };
        const row = parseRow(raw);
        expect(row.roster_json).toEqual([{ id: "unit1" }]);
        expect(row.party_ids_json).toEqual(["unit1"]);
    });

    it("does not double-parse if roster_json is already an object", () => {
        const raw = {
            user_id: 1,
            username: "p",
            renown: 0,
            daily_login_streak: 0,
            login_count: 1,
            completed_tutorial: 0,
            roster_rows: 0,
            roster_json: [{ id: "unit1" }],   // already parsed
            party_ids_json: ["unit1"],          // already parsed
        };
        const row = parseRow(raw);
        expect(row.roster_json).toEqual([{ id: "unit1" }]);
        expect(row.party_ids_json).toEqual(["unit1"]);
    });

    it("casts user_id to Number and completed_tutorial to Boolean", () => {
        const raw = {
            user_id: "76561197960265728",   // arrives as string from MySQL
            username: "p",
            renown: 0,
            daily_login_streak: 0,
            login_count: 1,
            completed_tutorial: 0,           // MySQL stores as tinyint 0/1
            roster_rows: 0,
            roster_json: "[]",
            party_ids_json: "[]",
        };
        const row = parseRow(raw);
        expect(typeof row.user_id).toBe("number");
        expect(typeof row.completed_tutorial).toBe("boolean");
        expect(row.completed_tutorial).toBe(false);
    });
});
