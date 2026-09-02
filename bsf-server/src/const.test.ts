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

    it("gives a new account 9999 when nothing is configured", () => {
        expect(DEFAULT_STARTING_RENOWN).toBe(9999);
        expect(startingRenown()).toBe(9999);
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
});
