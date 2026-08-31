import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Battle, endgame, applyKillsToRoster, BATTLE_SCENES, isKnownScene, setDebugFastTimer } from "./Battle";
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

describe("applyKillReport (#18/#19/#52)", () => {
    // s1 is party_index 0, s2 is party_index 1 (constructor assigns by array order).
    function twoSideBattle(aUnits: string[], bUnits: string[]) {
        const s1 = fakeSession(1, "key-a", aUnits);
        const s2 = fakeSession(2, "key-b", bUnits);
        const battle = new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);
        return { s1, s2, battle };
    }

    it("requires BOTH players to report a death before the unit is removed (#18)", () => {
        const { battle } = twoSideBattle(["a1", "a2"], ["b1", "b2"]);

        // Only the killer's client (party 0) has reported b1 so far.
        let r = battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        expect(r).toEqual({ confirmed: false, finished: false });
        expect(battle.aliveUnits["2"]).toEqual(["b1", "b2"]); // untouched

        // The victim's own client (party 1) now reports the same death → confirmed.
        r = battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 1 });
        expect(r).toEqual({ confirmed: true, finished: false });
        expect(battle.aliveUnits["2"]).toEqual(["b2"]); // b1 removed exactly once
    });

    it("derives the winner as the non-emptied party even when the loser reports its own final death (#19)", () => {
        const { battle } = twoSideBattle(["a1"], ["b1"]);

        let r = battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        expect(r).toEqual({ confirmed: false, finished: false });

        // The final confirming report comes from the LOSER's own client (party 1).
        r = battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 1 });
        expect(r).toEqual({ confirmed: true, finished: true });
        expect(battle.aliveUnits["2"]).toEqual([]);
        expect(battle.winner).toBe(1); // the opponent, NOT the reporter
    });

    it("ignores a spoofed killerparty — the winner stays server-derived (#19)", () => {
        const { battle } = twoSideBattle(["a1"], ["b1"]);
        // Both clients report b1 dead, but the body lies that killerparty is 999.
        battle.applyKillReport({ killedparty: 2, killerparty: 999, entity: "b1", killer: "x", reporterPartyIndex: 0 });
        const r = battle.applyKillReport({ killedparty: 2, killerparty: 999, entity: "b1", killer: "x", reporterPartyIndex: 1 });
        expect(r.finished).toBe(true);
        expect(battle.winner).toBe(1); // from aliveUnits, not the bogus killerparty
    });

    it("treats a redundant third report as a no-op", () => {
        const { battle } = twoSideBattle(["a1"], ["b1", "b2"]);
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 1 });
        expect(battle.aliveUnits["2"]).toEqual(["b2"]);

        // A late duplicate must not remove a second unit or flip any state.
        const r = battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        expect(r).toEqual({ confirmed: false, finished: false });
        expect(battle.aliveUnits["2"]).toEqual(["b2"]);
    });

    // #99: per-unit kill tally (feeds the persistent KILLS stat at endgame).
    it("tallies a kill to the killer unit only once BOTH players confirm it (#99)", () => {
        const { battle } = twoSideBattle(["a1", "a2"], ["b1", "b2"]);

        // First (unconfirmed) report must not credit anything yet.
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        expect(battle.unitKillCounts["1"]?.["a1"]).toBeUndefined();

        // Second report confirms → a1 (party 1's unit) is credited with 1 kill.
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 1 });
        expect(battle.unitKillCounts["1"]["a1"]).toBe(1);
    });

    it("does not double-count a kill on a redundant report (#99)", () => {
        const { battle } = twoSideBattle(["a1"], ["b1", "b2"]);
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 1 });
        expect(battle.unitKillCounts["1"]["a1"]).toBe(1);

        // A late duplicate of an already-confirmed kill must not bump the tally again.
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        expect(battle.unitKillCounts["1"]["a1"]).toBe(1);
    });

    it("does not credit a self-kill (killerparty === killedparty) (#99)", () => {
        const { battle } = twoSideBattle(["a1"], ["b1", "b2"]);
        // A unit dying to its own/allied effect: both clients report it, killerparty == killedparty.
        battle.applyKillReport({ killedparty: 2, killerparty: 2, entity: "b1", killer: "b1", reporterPartyIndex: 0 });
        battle.applyKillReport({ killedparty: 2, killerparty: 2, entity: "b1", killer: "b1", reporterPartyIndex: 1 });
        // b1 still leaves the alive list, but no unit earns a kill for it.
        expect(battle.aliveUnits["2"]).toEqual(["b2"]);
        expect(battle.unitKillCounts["2"]).toBeUndefined();
    });

    it("tallies once on a single report when BSF_KILL_CONFIRM_SINGLE=true (#99 rollback path)", () => {
        const prev = process.env.BSF_KILL_CONFIRM_SINGLE;
        process.env.BSF_KILL_CONFIRM_SINGLE = "true";
        try {
            const { battle } = twoSideBattle(["a1"], ["b1", "b2"]);
            // A single report confirms (no second client to agree with) → trust it and credit once.
            battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
            expect(battle.unitKillCounts["1"]["a1"]).toBe(1);
        } finally {
            if (prev === undefined) delete process.env.BSF_KILL_CONFIRM_SINGLE;
            else process.env.BSF_KILL_CONFIRM_SINGLE = prev;
        }
    });

    it("confirms the death but skips the credit when the two clients disagree on the killer (#99)", () => {
        const { battle } = twoSideBattle(["a1", "a2"], ["b1"]);
        // Each client names a DIFFERENT killer for the same death (a lone client trying to
        // funnel the kill onto a favored unit). The death is keyed on the entity, so it still
        // confirms and ends the battle — but no unit is credited, since we can't trust either id.
        battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
        const r = battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a2", reporterPartyIndex: 1 });

        expect(r).toEqual({ confirmed: true, finished: true }); // death still confirmed
        expect(battle.aliveUnits["2"]).toEqual([]);
        expect(battle.winner).toBe(1);
        expect(battle.unitKillCounts["1"]).toBeUndefined(); // neither a1 nor a2 credited
    });

    it("confirms on the first report when BSF_KILL_CONFIRM_SINGLE=true (rollback flag)", () => {
        const prev = process.env.BSF_KILL_CONFIRM_SINGLE;
        process.env.BSF_KILL_CONFIRM_SINGLE = "true";
        try {
            const { battle } = twoSideBattle(["a1"], ["b1"]);
            const r = battle.applyKillReport({ killedparty: 2, killerparty: 1, entity: "b1", killer: "a1", reporterPartyIndex: 0 });
            expect(r).toEqual({ confirmed: true, finished: true });
            expect(battle.aliveUnits["2"]).toEqual([]);
            expect(battle.winner).toBe(1);
        } finally {
            if (prev === undefined) delete process.env.BSF_KILL_CONFIRM_SINGLE;
            else process.env.BSF_KILL_CONFIRM_SINGLE = prev;
        }
    });

    it("endgame() bails without throwing when a party object is missing (#52)", async () => {
        const { s1, s2, battle } = twoSideBattle(["a1"], ["b1"]);
        battle.winner = s1.account_id;
        delete battle.parties[s1.session_key]; // simulate an /exit cleanup racing endgame
        await expect(
            endgame({ session: s1, opponent: s2, battle })
        ).resolves.toBeUndefined();
    });
});

describe("applyKillsToRoster (#99)", () => {
    const roster = () => [
        { id: "u1", stats: [{ class: "tbs.srv.data.Stat", stat: "RANK", value: 1 }, { class: "tbs.srv.data.Stat", stat: "KILLS", value: 5 }] },
        { id: "u2", stats: [{ class: "tbs.srv.data.Stat", stat: "RANK", value: 1 }] }, // no KILLS entry
    ];
    const killsOf = (r: any[] | null, id: string) =>
        r?.find((u) => u.id === id)?.stats.find((s: any) => s.stat === "KILLS")?.value;

    it("adds the tally onto an existing KILLS value", () => {
        const updated = applyKillsToRoster(roster(), { u1: 2 });
        expect(killsOf(updated, "u1")).toBe(7); // 5 + 2
    });

    it("creates a KILLS entry for a unit that has none", () => {
        const updated = applyKillsToRoster(roster(), { u2: 3 });
        expect(killsOf(updated, "u2")).toBe(3);
    });

    it("skips a killer id that isn't in the roster and returns null when nothing changed", () => {
        expect(applyKillsToRoster(roster(), { ghost: 4 })).toBeNull();
    });

    it("returns null for empty/absent inputs", () => {
        expect(applyKillsToRoster(roster(), undefined)).toBeNull();
        expect(applyKillsToRoster(undefined, { u1: 1 })).toBeNull();
    });

    it("does not mutate the input roster", () => {
        const original = roster();
        applyKillsToRoster(original, { u1: 2, u2: 3 });
        expect(killsOf(original, "u1")).toBe(5); // unchanged
        expect(killsOf(original, "u2")).toBeUndefined();
    });
});


// ---------------------------------------------------------------------------
// #205 — what the two players are told about a friend match, and which map it
// lands on. The message that leaves here is the only thing either game reads.
// ---------------------------------------------------------------------------

describe("friend matches (#205)", () => {
    // The message pushed to a session when the battle is created.
    function created(session: Session): any {
        return (session.pushData as any).mock.calls.flat()
            .find((m: any) => m?.class === "tbs.srv.battle.data.BattleCreateData");
    }

    function twoPlayers() {
        const s1 = fakeSession(1, "key-a", ["u1"]);
        const s2 = fakeSession(2, "key-b", ["u2"]);
        (s1 as any).pushData = vi.fn();
        (s2 as any).pushData = vi.fn();
        return { s1, s2 };
    }

    const perSide = [{ power: 0, elo: 0 }, { power: 0, elo: 0 }];

    it("tells both games the battle is friendly", () => {
        const { s1, s2 } = twoPlayers();
        new Battle([s1, s2], GameModes.FRIEND, perSide, { friendly: true, scene: "beach" });

        expect(created(s1).friendly).toBe(true);
        expect(created(s2).friendly).toBe(true);
    });

    it("leaves an ordinary battle unfriendly, as before", () => {
        const { s1, s2 } = twoPlayers();
        new Battle([s1, s2], GameModes.QUICK, perSide);

        expect(created(s1).friendly).toBe(false);
    });

    it("uses the map the players picked", () => {
        const { s1, s2 } = twoPlayers();
        const battle = new Battle([s1, s2], GameModes.FRIEND, perSide, { friendly: true, scene: "mead_house" });

        expect(battle.scene).toBe("mead_house");
        expect(created(s1).scene).toBe("mead_house");
    });

    // A map name the game cannot find makes it abandon the whole match, so an
    // unrecognised one costs that player their choice rather than the battle.
    it("falls back to a map we know when the name is not one of ours", () => {
        const { s1, s2 } = twoPlayers();
        const battle = new Battle([s1, s2], GameModes.FRIEND, perSide, { friendly: true, scene: "somewhere_else" });

        expect(BATTLE_SCENES).toContain(battle.scene);
        expect(battle.scene).not.toBe("somewhere_else");
    });

    it("still picks a map when none was asked for", () => {
        const { s1, s2 } = twoPlayers();
        const battle = new Battle([s1, s2], GameModes.QUICK, perSide);

        expect(BATTLE_SCENES).toContain(battle.scene);
    });

    // Ladder 0 is the one the queue reads ratings from and the leaderboard shows.
    // A friend match counts for rating, so it has to land there and not on ladder 1.
    it("puts a friend match on the same ladder as quick play", () => {
        const { s1, s2 } = twoPlayers();
        const friendly = new Battle([s1, s2], GameModes.FRIEND, perSide, { friendly: true });
        const quick = new Battle([s1, s2], GameModes.QUICK, perSide);

        expect(friendly.tourney_id).toBe(0);
        expect(quick.tourney_id).toBe(0);
    });

    it("recognises exactly the maps we vouch for", () => {
        expect(isKnownScene("wall")).toBe(true);
        expect(isKnownScene("not_a_map")).toBe(false);
        expect(isKnownScene(undefined)).toBe(false);
        expect(isKnownScene("")).toBe(false);
    });
});


// ---------------------------------------------------------------------------
// #213 — how long each player gets per turn. The number in this message is the
// only thing either game counts down, and a zero means it counts down nothing.
// ---------------------------------------------------------------------------

describe("turn length on the wire (#213)", () => {
    function created(session: Session): any {
        return (session.pushData as any).mock.calls.flat()
            .find((m: any) => m?.class === "tbs.srv.battle.data.BattleCreateData");
    }

    function twoPlayers() {
        const s1 = fakeSession(1, "key-a", ["u1"]);
        const s2 = fakeSession(2, "key-b", ["u2"]);
        (s1 as any).pushData = vi.fn();
        (s2 as any).pushData = vi.fn();
        return { s1, s2 };
    }

    const partyOf = (session: Session, idx: number) => created(session).parties[idx];

    // NODE_ENV is "test" (vitest.config.ts), so the fast-timer switch is ON by default
    // in every run. Anything asserting real values has to turn it off first.
    beforeEach(() => setDebugFastTimer(false));
    afterEach(() => setDebugFastTimer(true));

    it("gives each player the length they asked for, even when the two differ", () => {
        const { s1, s2 } = twoPlayers();
        new Battle([s1, s2], GameModes.FRIEND, [
            { power: 0, elo: 0, timer: 0 },
            { power: 0, elo: 0, timer: 60 },
        ], { friendly: true });

        expect(partyOf(s1, 0).timer).toBe(0);
        expect(partyOf(s1, 1).timer).toBe(60);
        // Both games are sent the same message, so the opponent's clock is on it too —
        // that is what lets each screen count down whoever is acting.
        expect(partyOf(s2, 0).timer).toBe(0);
        expect(partyOf(s2, 1).timer).toBe(60);
    });

    // The regression this issue is about: the value used to be invented from the seat,
    // 30 for the first player and 45 for the second, so two players who both asked for
    // the same thing were given different clocks.
    it("no longer derives the length from which seat a player is in", () => {
        const { s1, s2 } = twoPlayers();
        new Battle([s1, s2], GameModes.QUICK, [
            { power: 0, elo: 0, timer: 45 },
            { power: 0, elo: 0, timer: 45 },
        ]);

        expect(partyOf(s1, 0).timer).toBe(45);
        expect(partyOf(s1, 1).timer).toBe(45);
    });

    it("falls back to the game's own everyday value when no length is named", () => {
        const { s1, s2 } = twoPlayers();
        new Battle([s1, s2], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);

        expect(partyOf(s1, 0).timer).toBe(45);
        expect(partyOf(s1, 1).timer).toBe(45);
    });

    it("shortens a real clock for testing but leaves no-clock alone", () => {
        setDebugFastTimer(true);
        const { s1, s2 } = twoPlayers();
        new Battle([s1, s2], GameModes.FRIEND, [
            { power: 0, elo: 0, timer: 60 },
            { power: 0, elo: 0, timer: 0 },
        ], { friendly: true });

        expect(partyOf(s1, 0).timer).toBe(15);
        // The whole point: a developer machine must still be able to reproduce #213.
        expect(partyOf(s1, 1).timer).toBe(0);
    });
});
