import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    MAX_ROSTER_ROWS,
} from "./account";
import { DEFAULT_STARTING_RENOWN } from "../const";

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

afterEach(() => {
    vi.unstubAllEnvs();
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

    // #227. A new player used to be created with nothing to spend and had to win
    // several battles before they could hire or promote anybody.
    it("gives a brand-new account the starting renown", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        await upsertAccount("123", "testplayer");
        const [sql, params] = vi.mocked(query).mock.calls[0] as [string, any[]];
        // Pin the column list AND the position. `toContain` on the parameter array
        // would only test membership, so swapping the renown and roster_rows
        // parameters -- which creates every account with renown 8 and a 9999-row
        // barracks -- would still pass. Nothing else in the suite runs this INSERT
        // against a real database, so these two assertions are the only guard.
        expect(sql).toContain("(user_id, username, renown, roster_json, party_ids_json, roster_rows, completed_tutorial)");
        expect(params[2]).toBe(DEFAULT_STARTING_RENOWN);
        expect(params[5]).toBe(MAX_ROSTER_ROWS);
        // One column, one "?", one parameter. Nothing else checks this, and the
        // connection is mocked suite-wide (test/setup.ts), so db.prepare() never runs
        // here -- a column added without its placeholder passes every test in the
        // suite and then throws the first time a real person signs in, which fails
        // account creation for everybody rather than for one edge case.
        expect(params).toHaveLength(7);
        expect((sql.match(/\?/g) ?? []).length).toBe(7);
    });

    // The regression guard for "a returning player keeps what they earned and spent".
    // The conflict branch is the half an existing row takes. If renown ever appears in
    // it, every player's balance silently resets to the starting grant on every login.
    it("leaves renown alone on the conflict branch, so a returning player keeps their balance", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        await upsertAccount("123", "testplayer");
        const [sql] = vi.mocked(query).mock.calls[0] as [string, any[]];
        const [insertHalf, conflictHalf] = sql.split("ON CONFLICT");
        expect(conflictHalf).toBeDefined();
        expect(insertHalf).toContain("renown");
        expect(conflictHalf).not.toContain("renown");
        expect(conflictHalf).toContain("login_count = login_count + 1");
    });

    it("uses the amount configured in the environment", async () => {
        vi.stubEnv("STARTING_RENOWN", "250");
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        await upsertAccount("123", "testplayer");
        const [, params] = vi.mocked(query).mock.calls[0] as [string, any[]];
        expect(params[2]).toBe(250);
    });

    // #230. A new player used to be made to sit through the scripted first battle
    // before the game would let them do anything else.
    it("creates a brand-new account with the tutorial already done", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        await upsertAccount("123", "testplayer");
        const [, params] = vi.mocked(query).mock.calls[0] as [string, any[]];
        // By position, for the same reason the renown assertion above is: membership
        // alone would still pass with this and roster_rows swapped, which would create
        // every account with a one-row barracks and no tutorial skip.
        expect(params[6]).toBe(1);
        // And a number, not a boolean -- node:sqlite throws on a bound boolean.
        expect(typeof params[6]).toBe("number");
    });

    it("hands the tutorial back to new players when the setting is switched off", async () => {
        vi.stubEnv("SKIP_TUTORIAL", "false");
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        await upsertAccount("123", "testplayer");
        const [, params] = vi.mocked(query).mock.calls[0] as [string, any[]];
        expect(params[6]).toBe(0);
    });

    // The regression guard for "a returning player keeps where they had got to".
    // If completed_tutorial ever appears in the conflict branch, every sign-in
    // overwrites the player's progress with whatever the setting currently says.
    it("leaves the tutorial flag alone on the conflict branch, so a returning player keeps their progress", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(RAW_ROW);
        await upsertAccount("123", "testplayer");
        const [sql] = vi.mocked(query).mock.calls[0] as [string, any[]];
        const [insertHalf, conflictHalf] = sql.split("ON CONFLICT");
        expect(conflictHalf).toBeDefined();
        expect(insertHalf).toContain("completed_tutorial");
        expect(conflictHalf).not.toContain("completed_tutorial");
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
    it("calls query with JSON-stringified roster without overwriting roster_rows", async () => {
        const roster = [{ id: "unit1" }, { id: "unit2" }];
        await saveRoster(123, roster);
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("roster_json"),
            [JSON.stringify(roster), "123"]
        );
    });
});

describe("saveRosterAndSpendRenown", () => {
    it("passes cost as a parameter to the single UPDATE without touching roster_rows", async () => {
        const roster = [{ id: "u1" }];
        await saveRosterAndSpendRenown(42, roster, 80);
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("renown = renown - ?"),
            [JSON.stringify(roster), 80, "42"]
        );
    });
});

describe("saveRosterAndParty", () => {
    it("updates roster and party atomically in one query call without touching roster_rows", async () => {
        const roster = [{ id: "u1" }];
        const party = ["u1"];
        await saveRosterAndParty(7, roster, party);
        expect(vi.mocked(query)).toHaveBeenCalledOnce();
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("party_ids_json"),
            [JSON.stringify(roster), JSON.stringify(party), "7"]
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
