import { describe, it, expect } from "vitest";
import { STEAM_ID_BASE, accountIdFromSteamId, accountIdFromSnowflake, isValidSnowflake } from "./accountId";

// These tests are the safety net for the load-bearing rule in accountId.ts: the
// conversions must keep giving byte-identical answers to the inline math they
// replaced (#146), because every stored ranking row and the game client's entity
// strings were built with those exact answers.

describe("accountIdFromSteamId (the Steam rule)", () => {
    it("subtracts the base from a Steam-sized id", () => {
        // +4096 is a multiple of 16, so the sum is exactly representable in a JS
        // number even at Steam-id magnitude (where floats step by 16).
        expect(accountIdFromSteamId(STEAM_ID_BASE + 4096)).toBe(4096);
    });

    it("leaves small (non-Steam) ids unchanged", () => {
        expect(accountIdFromSteamId(0)).toBe(0);
        expect(accountIdFromSteamId(123)).toBe(123);
        expect(accountIdFromSteamId(77284)).toBe(77284); // original-server-sized id
    });

    it("maps the base itself to 0", () => {
        expect(accountIdFromSteamId(STEAM_ID_BASE)).toBe(0);
    });

    it("gives the same answer for string input (the leaderboard path)", () => {
        expect(accountIdFromSteamId("76561197960269824")).toBe(4096); // base + 4096, as text
        expect(accountIdFromSteamId("123")).toBe(123);
    });

    it("matches the old inline math exactly for a spread of ids (parity)", () => {
        // The exact expression this helper replaced in auth.ts and leaderboard.ts.
        const oldInline = (user_id: number | string): number => {
            const uid = Number(user_id);
            return uid >= 76561197960265728 ? uid - 76561197960265728 : uid;
        };
        const samples: (number | string)[] = [
            0, 1, 123, 77284, 343275,
            2 ** 30, 2 ** 31 - 1,
            STEAM_ID_BASE, STEAM_ID_BASE + 16, STEAM_ID_BASE + 4096,
            // Not exactly representable (floats step by 16 up here) — both sides see
            // the same rounded number, which is precisely the behavior to preserve.
            STEAM_ID_BASE + 17, STEAM_ID_BASE + 33,
            "76561197960269824", "9007199254740993", "343275",
        ];
        for (const id of samples) {
            expect(accountIdFromSteamId(id), `parity failed for ${id}`).toBe(oldInline(id));
        }
    });
});

describe("accountIdFromSnowflake (the Discord rule)", () => {
    it("keeps only the low 30 bits", () => {
        expect(accountIdFromSnowflake("5")).toBe(5);
        // 2^30 + 7 → the 2^30 bit is cut off, leaving 7.
        expect(accountIdFromSnowflake("1073741831")).toBe(7);
    });

    it("agrees with an independent mod-2^30 computation for a real Snowflake", () => {
        const snowflake = "1122976027140956221";
        const expected = Number(BigInt(snowflake) % BigInt(2 ** 30));
        expect(accountIdFromSnowflake(snowflake)).toBe(expected);
    });

    it("always lands in the legal 30-bit range", () => {
        for (const s of ["1", "1122976027140956221", "9007199254740993", "18446744073709551615"]) {
            const id = accountIdFromSnowflake(s);
            expect(id).toBeGreaterThanOrEqual(0);
            expect(id).toBeLessThanOrEqual(0x3fffffff);
        }
    });

    it("maps two Snowflakes sharing their low 30 bits to the SAME id (#140 residual, documented)", () => {
        // They differ only above bit 30: 2^40 + 12345 vs 2^41 + 12345. Sessions and
        // DB rows stay distinct (keyed on the full string); the in-game id collides —
        // the known leftover that keeps #140 open.
        expect(accountIdFromSnowflake("1099511640121")).toBe(12345);
        expect(accountIdFromSnowflake("2199023267897")).toBe(12345);
    });
});

describe("isValidSnowflake (the screening check)", () => {
    it("accepts real positive ids up to 20 digits", () => {
        expect(isValidSnowflake("1")).toBe(true);
        expect(isValidSnowflake("1122976027140956221")).toBe(true);
        expect(isValidSnowflake("12345678901234567890")).toBe(true); // 20 digits
    });

    it("rejects zero, empty, non-digits, negatives, and over-long ids (#140)", () => {
        expect(isValidSnowflake("0")).toBe(false);
        expect(isValidSnowflake("00")).toBe(false); // zero in disguise
        expect(isValidSnowflake("")).toBe(false);
        expect(isValidSnowflake("abc")).toBe(false);
        expect(isValidSnowflake("-1")).toBe(false);
        expect(isValidSnowflake("1.5")).toBe(false);
        expect(isValidSnowflake("123456789012345678901")).toBe(false); // 21 digits
    });
});
