import { describe, it, expect, vi, beforeEach } from "vitest";
import { query, queryOne, queryUpdate } from "./connection";
import {
    parseRow,
    getAccountByUserId,
    upsertAccount,
    addRenown,
    saveParty,
    saveRoster,
    saveRosterAndSpendRenown,
    saveRosterAndParty,
    expandBarracks,
} from "./account";

// Raw DB row shape (JSON fields are strings, completed_tutorial is 0/1 integer)
const RAW_ROW = {
    user_id: "123",
    username: "testplayer",
    renown: 50,
    daily_login_streak: 1,
    login_count: 1,
    completed_tutorial: 1,
    roster_rows: 2,
    roster_json: '[{"id":"unit1"}]',
    party_ids_json: '["unit1"]',
};

beforeEach(() => {
    vi.mocked(query).mockClear();
    vi.mocked(queryOne).mockClear();
    vi.mocked(queryUpdate).mockClear();
});

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
            roster_json: [{ id: "unit1" }],
            party_ids_json: ["unit1"],
        };
        const row = parseRow(raw);
        expect(row.roster_json).toEqual([{ id: "unit1" }]);
        expect(row.party_ids_json).toEqual(["unit1"]);
    });

    it("casts user_id to Number and completed_tutorial to Boolean", () => {
        const raw = {
            user_id: "76561197960265728",
            username: "p",
            renown: 0,
            daily_login_streak: 0,
            login_count: 1,
            completed_tutorial: 0,
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

describe("getAccountByUserId", () => {
    it("calls queryOne with the user_id coerced to a string", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        const result = await getAccountByUserId(123);
        expect(vi.mocked(queryOne)).toHaveBeenCalledWith(
            expect.stringContaining("WHERE user_id = ?"),
            ["123"]
        );
        expect(result).not.toBeNull();
        expect(result!.user_id).toBe(123);
    });

    it("passes a string user_id through without conversion", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        await getAccountByUserId("456");
        expect(vi.mocked(queryOne)).toHaveBeenCalledWith(
            expect.any(String),
            ["456"]
        );
    });

    it("returns null when no row is found", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(null);
        const result = await getAccountByUserId(999);
        expect(result).toBeNull();
    });
});

describe("upsertAccount", () => {
    it("calls query for INSERT and then getAccountByUserId", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        const result = await upsertAccount("123", "testplayer");
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO accounts"),
            expect.arrayContaining(["123", "testplayer"])
        );
        expect(result.username).toBe("testplayer");
    });

    it("throws if the account is missing after insert", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(null);
        await expect(upsertAccount("bad_id", "x")).rejects.toThrow("row missing for user_id=bad_id");
    });
});

describe("addRenown", () => {
    it("calls query with the delta and stringified user_id", async () => {
        await addRenown(123, 20);
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("renown = renown + ?"),
            [20, "123"]
        );
    });
});

describe("saveParty", () => {
    it("calls query with JSON-stringified party array", async () => {
        await saveParty(123, ["unit1", "unit2"]);
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("party_ids_json"),
            [JSON.stringify(["unit1", "unit2"]), "123"]
        );
    });
});

describe("saveRoster", () => {
    it("calls query with JSON-stringified roster and roster_rows count", async () => {
        const roster = [{ id: "unit1" }, { id: "unit2" }];
        await saveRoster(123, roster);
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("roster_rows"),
            [JSON.stringify(roster), 2, "123"]
        );
    });
});

describe("saveRosterAndSpendRenown", () => {
    it("passes cost as a parameter to the single UPDATE", async () => {
        const roster = [{ id: "u1" }];
        await saveRosterAndSpendRenown(42, roster, 80);
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("renown = renown - ?"),
            [JSON.stringify(roster), 1, 80, "42"]
        );
    });
});

describe("saveRosterAndParty", () => {
    it("updates roster and party atomically in one query call", async () => {
        const roster = [{ id: "u1" }];
        const party = ["u1"];
        await saveRosterAndParty(7, roster, party);
        expect(vi.mocked(query)).toHaveBeenCalledOnce();
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("party_ids_json"),
            [JSON.stringify(roster), 1, JSON.stringify(party), "7"]
        );
    });
});

describe("expandBarracks", () => {
    it("returns true when queryUpdate affects 1 row", async () => {
        vi.mocked(queryUpdate).mockResolvedValueOnce(1);
        expect(await expandBarracks(1)).toBe(true);
    });

    it("returns false when queryUpdate affects 0 rows (race condition)", async () => {
        vi.mocked(queryUpdate).mockResolvedValueOnce(0);
        expect(await expandBarracks(1)).toBe(false);
    });
});
