import { describe, it, expect } from "vitest";
import { Battle } from "./Battle";
import { GameModes } from "../../const";
import { Session } from "../auth/auth";

// Build a minimal fake session with only the fields Battle constructor uses.
// Real Session extends EventEmitter and reads files — too heavy for a unit test.
// rosterIds populates the roster; partyIds (optional) populates party_ids_json
// independently so tests can verify party-order vs roster-order behavior.
// Defaulting partyIds to rosterIds keeps every existing test passing unchanged.
function fakeSession(account_id: number, session_key: string, rosterIds: string[], partyIds?: string[]): Session {
    const roster = rosterIds.map((id) => ({
        id,
        stats: [{ stat: "RANK", value: 1 }],
    }));
    return {
        account_id,
        session_key,
        user_id: account_id,
        display_name: `player_${account_id}`,
        match_handle: 0,
        battle_id: undefined,
        accountData: {
            roster_json: roster,
            party_ids_json: partyIds ?? rosterIds,
        },
        pushData: () => {},   // no-op — prevents EventEmitter errors
    } as unknown as Session;
}

describe("Battle constructor", () => {
    it("keys parties by session_key", () => {
        const s1 = fakeSession(1, "key-a", ["unit1", "unit2"]);
        const s2 = fakeSession(2, "key-b", ["unit3"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        expect(battle.parties).toHaveProperty("key-a");
        expect(battle.parties).toHaveProperty("key-b");
    });

    it("populates aliveUnits with unit IDs for both players", () => {
        const s1 = fakeSession(1, "key-a", ["unit1", "unit2"]);
        const s2 = fakeSession(2, "key-b", ["unit3"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        expect(battle.aliveUnits["1"]).toEqual(["unit1", "unit2"]);
        expect(battle.aliveUnits["2"]).toEqual(["unit3"]);
    });

    it("keys aliveUnits by String(account_id)", () => {
        const s1 = fakeSession(42, "key-a", ["u1"]);
        const s2 = fakeSession(99, "key-b", ["u2"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        // Must be string keys, not numbers — the /killed route compares with String()
        expect(Object.keys(battle.aliveUnits)).toContain("42");
        expect(Object.keys(battle.aliveUnits)).toContain("99");
    });

    it("sets session.battle_id to the new battle's ID", () => {
        const s1 = fakeSession(1, "key-a", ["u1"]);
        const s2 = fakeSession(2, "key-b", ["u2"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        expect(s1.battle_id).toBe(battle.battle_id);
        expect(s2.battle_id).toBe(battle.battle_id);
    });

    it("initializes endgameStarted to false", () => {
        const s1 = fakeSession(1, "key-a", ["u1"]);
        const s2 = fakeSession(2, "key-b", ["u2"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        expect(battle.endgameStarted).toBe(false);
    });
});

describe("setReliableMessageData()", () => {
    it("returns an object with reliable_msg_id, reliable_msg_target, and timestamp", () => {
        const s1 = fakeSession(1, "key-a", ["u1"]);
        const s2 = fakeSession(2, "key-b", ["u2"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        const msg = battle.setReliableMessageData("_create");
        expect(msg).toHaveProperty("reliable_msg_id");
        expect(msg).toHaveProperty("reliable_msg_target");
        expect(msg).toHaveProperty("timestamp");
        expect(typeof msg.timestamp).toBe("number");
        expect(msg.reliable_msg_id).toBe(`${battle.battle_id}_create`);
    });
});

describe("createBattlePartyData order (issue #71)", () => {
    it("defs[] follows party_ids order, not roster order", () => {
        // Roster grid is [A, B, C], player arranged party as [C, A, B].
        // Old bug: defs came back in roster order [A, B, C]. Fix: party order [C, A, B].
        const s1 = fakeSession(1, "key-a", ["A", "B", "C"], ["C", "A", "B"]);
        const s2 = fakeSession(2, "key-b", ["u1"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        const defs = (battle.parties["key-a"] as any).defs;
        expect(defs.map((d: any) => d.id)).toEqual(["C", "A", "B"]);
    });

    it("skips party ids that aren't in roster (defensive — no throw on stale party)", () => {
        const s1 = fakeSession(1, "key-a", ["A", "B"], ["A", "GHOST", "B"]);
        const s2 = fakeSession(2, "key-b", ["u1"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        const defs = (battle.parties["key-a"] as any).defs;
        expect(defs.map((d: any) => d.id)).toEqual(["A", "B"]);
    });

    it("dedupes duplicate party ids (preserves old roster.filter() behavior)", () => {
        const s1 = fakeSession(1, "key-a", ["A", "B"], ["A", "A", "B"]);
        const s2 = fakeSession(2, "key-b", ["u1"]);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        const defs = (battle.parties["key-a"] as any).defs;
        expect(defs.map((d: any) => d.id)).toEqual(["A", "B"]);
    });
});
