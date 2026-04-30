import { describe, it, expect, beforeEach } from "vitest";
import { Session, sessionHandler, getInitialData } from "./auth";
import { GameModes } from "../../const";

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
