import { describe, it, expect } from "vitest";
import { GameModes, REPORTED_QUEUE_MODES, ServerClasses } from "./const";

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
