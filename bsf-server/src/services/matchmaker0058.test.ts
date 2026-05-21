import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Battle } from "./battle/Battle";
import { GameModes } from "../const";
import { Session } from "./auth/auth";

// ============================================================================
// Fiddler shape parity — capture 0058_s.txt is a /vs/start response captured
// from the original 2013 Stoic Java server. Both parties were at power=5,
// QUICK mode. We re-drive a Battle construction with mock sessions and assert
// the field set on the produced BattleCreateData / BattlePartyData matches.
//
// Value parity is NOT asserted — random IDs, timestamps, scene names, defs
// contents will differ. The point is to confirm we haven't drifted from the
// 2013 wire shape.
// ============================================================================

function loadCapture() {
    // vitest runs from the bsf-server/ project root, so paths are relative
    // to that. __dirname is unreliable across CJS/ESM configs; cwd is stable.
    const path = resolve(process.cwd(), "data/game_captures/extracted/raw/0058_s.txt");
    const raw = readFileSync(path, "utf-8");
    // Capture files are HTTP/1.1 responses. Headers end at the first blank
    // line; the body starts with '[' (a JSON array).
    const bodyStart = raw.indexOf("[");
    return JSON.parse(raw.substring(bodyStart));
}

function fakeSession(account_id: number, session_key: string, displayName: string): Session {
    return {
        account_id,
        session_key,
        user_id: account_id,
        display_name: displayName,
        match_handle: 1,
        battle_id: undefined,
        accountData: {
            roster_json: [
                { id: `${account_id}_u1`, entityClass: "axeman", stats: [{ stat: "RANK", value: 1 }] },
                { id: `${account_id}_u2`, entityClass: "bowmaster", stats: [{ stat: "RANK", value: 2 }] },
            ],
            party_ids_json: [`${account_id}_u1`, `${account_id}_u2`],
        },
        pushData: () => {},
    } as unknown as Session;
}

describe("BattleCreateData shape parity vs Fiddler capture 0058_s.txt", () => {
    const captured = loadCapture();
    const capturedCreate = captured[0];
    const capturedParty = capturedCreate.parties[0];

    // Fields whose values are intentionally per-construction (random, time-based)
    // and not subject to shape parity assertions on values.
    const valueDriftKeys = new Set(["reliable_msg_id", "battle_id", "timestamp", "scene"]);

    function buildGeneratedBattle() {
        const pushed: any[] = [];
        const s1 = fakeSession(343275, "key-stef", "Stef");
        const s2 = fakeSession(293850, "key-bjorn", "Bjorn");
        (s1 as any).pushData = (d: any) => pushed.push(d);
        (s2 as any).pushData = (d: any) => pushed.push(d);

        new Battle([s1, s2], GameModes.QUICK, [
            { power: 5, elo: 0 },
            { power: 5, elo: 0 },
        ]);

        // Battle constructor pushes one BattleCreateData per session. Both are
        // structurally identical; assert against the first.
        return pushed[0];
    }

    it("BattleCreateData has the same keys as the 2013 capture", () => {
        const generated = buildGeneratedBattle();
        expect(new Set(Object.keys(generated))).toEqual(new Set(Object.keys(capturedCreate)));
    });

    it("BattleCreateData class string is the 2013 fully-qualified Java name", () => {
        const generated = buildGeneratedBattle();
        expect(generated.class).toBe(capturedCreate.class);
        expect(generated.class).toBe("tbs.srv.battle.data.BattleCreateData");
    });

    it("BattleCreateData scalar shapes (non-value-drifting) match the capture", () => {
        const generated = buildGeneratedBattle();
        for (const key of Object.keys(capturedCreate)) {
            if (valueDriftKeys.has(key)) continue;
            if (key === "parties") continue; // checked below
            // Allow nulls (reliable_msg_target is null in both)
            if (capturedCreate[key] === null) {
                expect(generated[key]).toBeNull();
            } else {
                expect(typeof generated[key]).toBe(typeof capturedCreate[key]);
            }
        }
    });

    it("parties array has two entries with matching BattlePartyData keys", () => {
        const generated = buildGeneratedBattle();
        expect(generated.parties).toHaveLength(2);

        const genParty0 = generated.parties[0];
        expect(new Set(Object.keys(genParty0))).toEqual(new Set(Object.keys(capturedParty)));
        expect(genParty0.class).toBe(capturedParty.class);
        expect(genParty0.class).toBe("tbs.srv.battle.data.BattlePartyData");
    });

    it("BattlePartyData per-side power and elo flow from the perSide array, not hardcoded constants", () => {
        // Pre-M2 elo was hardcoded to 0 for QUICK and 1000 for RANKED. M2 lets
        // the matchmaker hand fresh values through. This test pins the new
        // behavior: a RANKED battle with two distinct elos should emit them
        // verbatim on each party_index.
        const pushed: any[] = [];
        const s1 = fakeSession(101, "k1", "Alice");
        const s2 = fakeSession(102, "k2", "Bob");
        (s1 as any).pushData = (d: any) => pushed.push(d);
        (s2 as any).pushData = (d: any) => pushed.push(d);

        new Battle([s1, s2], GameModes.RANKED, [
            { power: 3, elo: 1250 },
            { power: 6, elo: 980 },
        ]);

        const created = pushed[0];
        expect(created.parties[0].elo).toBe(1250);
        expect(created.parties[0].power).toBe(3);
        expect(created.parties[1].elo).toBe(980);
        expect(created.parties[1].power).toBe(6);
    });
});
