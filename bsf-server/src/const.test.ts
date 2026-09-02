import { describe, it, expect, afterEach, vi } from "vitest";
import {
    GameModes,
    REPORTED_QUEUE_MODES,
    ServerClasses,
    DEFAULT_STARTING_RENOWN,
    startingRenown,
} from "./const";

describe("GameModes", () => {
    it("contains QUICK, RANKED, TOURNEY, and FRIEND", () => {
        expect(GameModes.QUICK).toBe("QUICK");
        expect(GameModes.RANKED).toBe("RANKED");
        expect(GameModes.TOURNEY).toBe("TOURNEY");
        // #205: the name the game itself sends for a match arranged in the friend
        // lobby. It must match that spelling exactly or the request is refused.
        expect(GameModes.FRIEND).toBe("FRIEND");
    });
});

describe("REPORTED_QUEUE_MODES", () => {
    it("covers the three open queues but not friend matches", () => {
        expect([...REPORTED_QUEUE_MODES]).toEqual([
            GameModes.QUICK,
            GameModes.RANKED,
            GameModes.TOURNEY,
        ]);
    });
});

describe("ServerClasses", () => {
    it("BattleCreateData matches protocol string", () => {
        expect(ServerClasses.BATTLE_CREATE_DATA).toBe("tbs.srv.battle.data.BattleCreateData");
    });

    it("BattlePartyData matches protocol string", () => {
        expect(ServerClasses.BATTLE_PARTY_DATA).toBe("tbs.srv.battle.data.BattlePartyData");
    });

    it("BattleFinishedData matches protocol string", () => {
        expect(ServerClasses.BATTLE_FINISHED_DATA).toBe("tbs.srv.battle.data.client.BattleFinishedData");
    });

    it("RenownMessage matches protocol string", () => {
        expect(ServerClasses.RENOWN_MESSAGE).toBe("tbs.srv.util.RenownMsg");
    });
});

// #227. The grant a brand-new account is created with. The tests below assert what
// startingRenown() RETURNS and never that it logged: the warning on a bad value is
// latched to fire once per process, so asserting it would make these tests depend on
// the order they are declared in. What matters is that a typo in .env cannot break a
// login, and that is a return value.
describe("startingRenown", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("gives a new account 10000 when nothing is configured", () => {
        expect(DEFAULT_STARTING_RENOWN).toBe(10000);
        expect(startingRenown()).toBe(10000);
    });

    it("honours a whole number set in the environment", () => {
        vi.stubEnv("STARTING_RENOWN", "250");
        expect(startingRenown()).toBe(250);
    });

    it("accepts zero, which turns the grant off again", () => {
        vi.stubEnv("STARTING_RENOWN", "0");
        expect(startingRenown()).toBe(0);
    });

    it("treats an empty or blank setting as unset", () => {
        vi.stubEnv("STARTING_RENOWN", "");
        expect(startingRenown()).toBe(DEFAULT_STARTING_RENOWN);
        vi.stubEnv("STARTING_RENOWN", "   ");
        expect(startingRenown()).toBe(DEFAULT_STARTING_RENOWN);
    });

    // The load-bearing case: this runs while a player is signing in, so a bad value
    // has to fall back rather than throw. envInt() in queue.ts throws on the same
    // input, and is right to -- it is read once at boot, where a crash is the point.
    it("falls back to the default on a value that is not a whole number of 0 or more", () => {
        for (const bad of ["abc", "-5", "12.5", "1e3x", "NaN"]) {
            vi.stubEnv("STARTING_RENOWN", bad);
            expect(() => startingRenown()).not.toThrow();
            expect(startingRenown()).toBe(DEFAULT_STARTING_RENOWN);
        }
    });

    // The values that used to get through, and what they cost. Every whole number
    // between 2^53 and 2^63 satisfies Number.isInteger, stores as a SQLite INTEGER,
    // and then throws when the row is read straight back -- permanently bricking the
    // account that was just created. An extra zero in .env was enough. Rejecting
    // these is the whole reason this guard uses isSafeInteger.
    it("rejects a whole number too large to survive a round trip through the database", () => {
        for (const poison of ["1e16", "10000000000000000", "9007199254740993"]) {
            vi.stubEnv("STARTING_RENOWN", poison);
            expect(startingRenown()).toBe(DEFAULT_STARTING_RENOWN);
        }
    });

    // The game holds renown in a 32-bit signed int, so a bigger number would show the
    // player something other than what the server stored.
    it("rejects a value the game could not display correctly", () => {
        vi.stubEnv("STARTING_RENOWN", "3000000000");
        expect(startingRenown()).toBe(DEFAULT_STARTING_RENOWN);
        vi.stubEnv("STARTING_RENOWN", "2147483647");
        expect(startingRenown()).toBe(2147483647);
    });
});
