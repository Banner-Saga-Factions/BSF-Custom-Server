import { describe, it, expect, beforeEach } from "vitest";
import { Session, sessionHandler, getInitialData, reapStaleSessions, SESSION_TTL_MS, MAX_SESSION_BUFFER } from "./auth";
import { GameModes, ServerClasses } from "../../const";
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
    it("includes one queue entry per GameMode", () => {
        const data = getInitialData();
        const modes = Object.values(GameModes);
        for (const mode of modes) {
            const entry = data.find((d: any) => d.type === mode);
            expect(entry, `missing queue entry for GameMode.${mode}`).toBeDefined();
        }
    });

    it("includes first.json data (concat regression)", () => {
        // getInitialData() must return MORE items than just the queue entries.
        // The original bug returned only queue entries when .concat() was wrong.
        const data = getInitialData();
        const modes = Object.values(GameModes);
        // If first.json loaded, data length > number of GameModes
        // If first.json was empty, length === modes.length (still passes — no crash)
        expect(data.length).toBeGreaterThanOrEqual(modes.length);
    });
});

describe("sessionHandler", () => {
    it("addSession creates a session findable by session_key", () => {
        const session = sessionHandler.addSession(1001);
        const found = sessionHandler.getSession("session_key", session.session_key);
        expect(found).toBe(session);
    });

    it("getSession('user_id', id) finds the correct session", () => {
        const session = sessionHandler.addSession(2002);
        const found = sessionHandler.getSession("user_id", 2002);
        expect(found).toBe(session);
    });

    it("removeSession deletes the session from the store", () => {
        const session = sessionHandler.addSession(3003);
        sessionHandler.removeSession(session.session_key);
        const found = sessionHandler.getSession("session_key", session.session_key);
        expect(found).toBeUndefined();
    });

    it("addSession evicts an existing session for the same user_id", () => {
        const first = sessionHandler.addSession(4004);
        const second = sessionHandler.addSession(4004);
        // first session should be gone
        expect(sessionHandler.getSession("session_key", first.session_key)).toBeUndefined();
        // second session should be present
        expect(sessionHandler.getSession("session_key", second.session_key)).toBe(second);
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
        const stale = sessionHandler.addSession(7000);
        const alive = sessionHandler.addSession(8000);
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
        const stale = sessionHandler.addSession(9000);
        const ghost = sessionHandler.addSession(9001);
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
        const a = sessionHandler.addSession(1100);
        const b = sessionHandler.addSession(1101);
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
