import { describe, it, expect } from "vitest";
import { GameModes, ServerClasses } from "./const";

describe("GameModes", () => {
    it("contains QUICK, RANKED, and TOURNEY", () => {
        expect(GameModes.QUICK).toBe("QUICK");
        expect(GameModes.RANKED).toBe("RANKED");
        expect(GameModes.TOURNEY).toBe("TOURNEY");
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
