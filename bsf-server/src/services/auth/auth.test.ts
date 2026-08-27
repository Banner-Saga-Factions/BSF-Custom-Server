import { describe, it, expect, beforeEach } from "vitest";
import { Session, sessionHandler, getInitialData, reapStaleSessions, SESSION_TTL_MS, MAX_SESSION_BUFFER } from "./auth";
import { GameModes, REPORTED_QUEUE_MODES, ServerClasses } from "../../const";
import { battleHandler } from "../battle/Battle";

// Reset session store between tests so each test starts with a clean slate.
// sessionHandler stores sessions in a module-level object — without cleanup,
// sessions added in one test bleed into the next.
beforeEach(() => {
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
});

describe("Session.asJson()", () => {
    it("returns the expected shape for the login response", () => {
        const session = new Session(123);
        const json = session.asJson();
        expect(json).toHaveProperty("session_key");
        expect(json).toHaveProperty("user_id", 123);
        expect(json).toHaveProperty("build_number");
        expect(json).toHaveProperty("display_name");
    });
});

describe("getInitialData()", () => {
    it("includes one queue entry per reported mode", () => {
        const data = getInitialData();
        for (const mode of REPORTED_QUEUE_MODES) {
            const entry = data.find((d: any) => d.type === mode);
            expect(entry, `missing queue entry for GameMode.${mode}`).toBeDefined();
        }
    });

    // #205: a friend match is arranged between two named people, so there is no
    // "how many are waiting" worth telling anyone, and the game shows no counter for
    // it. Signing in must not advertise one. Asserted on the mode itself rather than
    // on REPORTED_QUEUE_MODES, so adding FRIEND to that list would fail here.
    it("does not advertise a queue for friend matches", () => {
        const data = getInitialData();
        expect(data.find((d: any) => d.type === GameModes.FRIEND)).toBeUndefined();
    });

    it("includes first.json data (concat regression)", () => {
        // getInitialData() must return MORE items than just the queue entries. The
        // original bug returned only queue entries when .concat() was wrong. Name the
        // entry we expect rather than counting items: the old length-only check passed
        // just as happily when first.json contributed nothing at all.
        const data = getInitialData();
        expect(data.some((d: any) => d?.class === "tbs.srv.util.CurrencyData")).toBe(true);
    });

    it("carries no friends list of its own", () => {
        // #91: the friends list is built per player from who is signed in, and is sent
        // separately once sign-in finishes. Keeping a second, always-empty copy here
        // would give one list two sources — the trap being that the client merges lists
        // rather than replacing them, so the two would not visibly conflict and whoever
        // edited the wrong one would get no feedback at all.
        const data = getInitialData();
        expect(data.some((d: any) => d?.class === ServerClasses.FRIENDS_DATA)).toBe(false);
    });
});

describe("sessionHandler", () => {
    it("addSession creates a session findable by session_key", () => {
        const session = sessionHandler.addSession(1001, "1001");
        const found = sessionHandler.getSession("session_key", session.session_key);
        expect(found).toBe(session);
    });

    it("getSession('user_id', id) finds the correct session", () => {
        const session = sessionHandler.addSession(2002, "2002");
        const found = sessionHandler.getSession("user_id", 2002);
        expect(found).toBe(session);
    });

    it("removeSession deletes the session from the store", () => {
        const session = sessionHandler.addSession(3003, "3003");
        sessionHandler.removeSession(session.session_key);
        const found = sessionHandler.getSession("session_key", session.session_key);
        expect(found).toBeUndefined();
    });

    it("addSession evicts the previous session when the same player logs in again", () => {
        const first = sessionHandler.addSession(4004, "4004");
        const second = sessionHandler.addSession(4004, "4004");
        // first session should be gone
        expect(sessionHandler.getSession("session_key", first.session_key)).toBeUndefined();
        // second session should be present
        expect(sessionHandler.getSession("session_key", second.session_key)).toBe(second);
    });

    it("addSession evicts an existing session with the same external id string", () => {
        // The same person logging in again (same full provider id) — the old login closes.
        const first = sessionHandler.addSession(4004, "9007199254740993");
        const second = sessionHandler.addSession(4004, "9007199254740993");
        expect(sessionHandler.getSession("session_key", first.session_key)).toBeUndefined();
        expect(sessionHandler.getSession("session_key", second.session_key)).toBe(second);
    });

    it("addSession does NOT evict when player numbers match but the full ids differ (#140)", () => {
        // Two strangers whose provider ids share a derived 32-bit id — e.g. two
        // Snowflakes with the same low 30 bits. Neither may knock the other offline.
        const a = sessionHandler.addSession(12345, "1099511640121"); // 2^40 + 12345
        const b = sessionHandler.addSession(12345, "2199023267897"); // 2^41 + 12345
        expect(a.account_id).toBe(b.account_id); // proves the derived ids really collide
        expect(sessionHandler.getSession("session_key", a.session_key)).toBe(a);
        expect(sessionHandler.getSession("session_key", b.session_key)).toBe(b);
        // Each session keeps its own exact provider id for DB writes.
        expect(a.external_id_str).toBe("1099511640121");
        expect(b.external_id_str).toBe("2199023267897");
    });
});

describe("reapStaleSessions", () => {
    beforeEach(() => {
        // Battles persist in their own module-level map; clear them so battles created
        // by an earlier test do not leak into this one.
        battleHandler.getBattles().forEach((b) => battleHandler.removeBattle(b.battle_id));
    });

    function attachAccountData(s: Session, unitId: string) {
        s.accountData = {
            roster_json: [{ id: unitId, stats: [{ stat: "RANK", value: 1 }] }],
            party_ids_json: [unitId],
        } as any;
    }

    it("removes the battle and surrenders to the opponent when a mid-battle session goes stale", () => {
        const stale = sessionHandler.addSession(7000, "7000");
        const alive = sessionHandler.addSession(8000, "8000");
        attachAccountData(stale, "unit_stale");
        attachAccountData(alive, "unit_alive");

        const battle = battleHandler.addBattle([stale, alive], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);
        const battleId = battle.battle_id;

        // Drain any sync messages pushed by Battle constructor (BATTLE_CREATE_DATA, etc.)
        // so we can isolate what the reaper itself buffers.
        alive.data = [];

        stale.lastActivity = Date.now() - SESSION_TTL_MS - 1000;
        reapStaleSessions();

        expect(sessionHandler.getSession("session_key", stale.session_key)).toBeUndefined();
        expect(battleHandler.getBattle(battleId)).toBeUndefined();
        expect(alive.battle_id).toBeUndefined();

        const surrenderMsg = alive.data.find((d: any) => d?.class === ServerClasses.BATTLE_SURRENDER_DATA);
        expect(surrenderMsg).toBeDefined();
        expect(surrenderMsg.battle_id).toBe(battleId);
        expect(surrenderMsg.user_id).toBe(stale.account_id);
    });

    it("removes the battle without notifications when the opponent is already gone", () => {
        const stale = sessionHandler.addSession(9000, "9000");
        const ghost = sessionHandler.addSession(9001, "9001");
        attachAccountData(stale, "unit_stale");
        attachAccountData(ghost, "unit_ghost");

        const battle = battleHandler.addBattle([stale, ghost], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);
        const battleId = battle.battle_id;

        // Simulate the opponent already having been evicted by a prior reaper pass.
        sessionHandler.removeSession(ghost.session_key);

        stale.lastActivity = Date.now() - SESSION_TTL_MS - 1000;
        reapStaleSessions();

        expect(sessionHandler.getSession("session_key", stale.session_key)).toBeUndefined();
        expect(battleHandler.getBattle(battleId)).toBeUndefined();
    });

    it("does not touch fresh sessions or their battles", () => {
        const a = sessionHandler.addSession(1100, "1100");
        const b = sessionHandler.addSession(1101, "1101");
        attachAccountData(a, "unit_a");
        attachAccountData(b, "unit_b");

        const battle = battleHandler.addBattle([a, b], GameModes.QUICK, [{ power: 0, elo: 0 }, { power: 0, elo: 0 }]);
        const battleId = battle.battle_id;

        reapStaleSessions();

        expect(sessionHandler.getSession("session_key", a.session_key)).toBe(a);
        expect(sessionHandler.getSession("session_key", b.session_key)).toBe(b);
        expect(battleHandler.getBattle(battleId)).toBe(battle);
    });
});

describe("Session.pushData buffer cap (#39)", () => {
    it("caps data at MAX_SESSION_BUFFER, drops the oldest, and still emits 'data'", () => {
        const session = new Session(5000);
        // Clear the getInitialData() prefill so we only count our own pushes.
        session.data = [];

        let emitted = 0;
        session.on("data", () => { emitted++; });

        const overflow = 5;
        const total = MAX_SESSION_BUFFER + overflow;
        for (let i = 0; i < total; i++) {
            session.pushData({ seq: i });
        }

        // Buffer is bounded to the cap.
        expect(session.data.length).toBe(MAX_SESSION_BUFFER);
        // The oldest `overflow` items were dropped — first survivor is seq=overflow,
        // last is the most recent push.
        expect(session.data[0].seq).toBe(overflow);
        expect(session.data[session.data.length - 1].seq).toBe(total - 1);
        // 'data' still fires on every push so an active poll flushes immediately.
        expect(emitted).toBe(total);
    });
});
