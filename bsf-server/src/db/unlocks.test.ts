import { describe, it, expect, beforeEach, vi } from "vitest";
import { query, queryOne } from "./connection";
import { getUnlockIds, grantUnlock, hasUnlock } from "./unlocks";

// test/setup.ts already replaces the database connection for the whole suite, so these
// tests drive the SQL layer's answers directly rather than standing a database up.
beforeEach(() => {
    vi.mocked(query).mockReset().mockResolvedValue([] as any);
    vi.mocked(queryOne).mockReset().mockResolvedValue(null as any);
});

describe("getUnlockIds", () => {
    it("returns just the ids, keyed on the full provider id string", async () => {
        vi.mocked(query).mockResolvedValueOnce([
            { unlock_id: "bst_renown" },
            { unlock_id: "var_thrashers" },
        ] as any);

        await expect(getUnlockIds("76561197960265999")).resolves
            .toEqual(["bst_renown", "var_thrashers"]);
        expect(vi.mocked(query)).toHaveBeenCalledWith(
            expect.stringContaining("FROM unlocks"),
            ["76561197960265999"]
        );
    });

    it("returns an empty list for an account that owns nothing extra", async () => {
        await expect(getUnlockIds("123")).resolves.toEqual([]);
    });
});

describe("grantUnlock", () => {
    it("is safe to call twice — a repeat updates the row instead of failing", async () => {
        await grantUnlock("123", "bst_renown");
        const [sql, params] = vi.mocked(query).mock.calls[0];
        expect(sql).toContain("INSERT INTO unlocks");
        expect(sql).toContain("ON CONFLICT(user_id, unlock_id) DO UPDATE");
        expect(params?.[0]).toBe("123");
        expect(params?.[1]).toBe("bst_renown");
        // Default duration of zero: the grant never expires.
        expect(params?.[3]).toBe(0);
    });
});

describe("hasUnlock", () => {
    it("is false when the account holds nothing by that name", async () => {
        await expect(hasUnlock("123", "bst_renown")).resolves.toBe(false);
    });

    it("is true for a grant with no expiry", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce({ unlock_time: 0, unlock_duration: 0 } as any);
        await expect(hasUnlock("123", "bst_renown")).resolves.toBe(true);
    });

    it("is true while a timed grant is still inside its window, false once it is past", async () => {
        vi.mocked(queryOne).mockResolvedValueOnce(
            { unlock_time: Date.now(), unlock_duration: 60_000 } as any
        );
        await expect(hasUnlock("123", "bst_renown")).resolves.toBe(true);

        vi.mocked(queryOne).mockResolvedValueOnce(
            { unlock_time: Date.now() - 120_000, unlock_duration: 60_000 } as any
        );
        await expect(hasUnlock("123", "bst_renown")).resolves.toBe(false);
    });
});
