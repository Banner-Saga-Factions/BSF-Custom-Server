import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { loginPlayer } from "../helpers";

// Only two of the fallback tests at the bottom sign in. The rest use the "11" sentinel and fail before
// the database is reached, so this mock changes nothing for them.
vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockResolvedValue({
        user_id: 123,
        username: "testplayer",
        renown: 100,
        daily_login_streak: 1,
        login_count: 1,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [],
        party_ids_json: [],
    }),
    addRenown: vi.fn().mockResolvedValue(undefined),
    saveParty: vi.fn().mockResolvedValue(undefined),
    saveRoster: vi.fn().mockResolvedValue(undefined),
    saveRosterAndSpendRenown: vi.fn().mockResolvedValue(undefined),
    saveRosterAndParty: vi.fn().mockResolvedValue(undefined),
    expandBarracks: vi.fn().mockResolvedValue(true),
    getAccountByUserId: vi.fn().mockResolvedValue(null),
    getAccountById: vi.fn().mockResolvedValue(null),
    parseRow: vi.fn(),
}));

// What the server sends when a handler FAILS -- a different question from what any one route
// does when it works. Until #176 the answer was often "nothing at all". Express 4 wraps a
// handler call in a try/catch, which catches a handler that fails immediately but never sees an
// async one reject, so no error handler ran and no reply was sent. The game has no request
// timeout of its own, so it waited for ever and showed the player nothing.
//
// Every test in the first block except the malformed-body one (which fails in the body parser,
// before any handler runs) reaches a real handler rather than a route added for testing. They all use
// the "11" login sentinel, which passes the session gate WITHOUT attaching a session -- so each
// handler dereferences an undefined session, and each does it in a different shape.

beforeEach(() => {
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
});

describe("A handler that fails still answers", () => {
    it("answers 409 when an async handler rejects, instead of never replying at all", async () => {
        // roster.ts reads session.accountData inside an `async` handler. That rejection is the
        // one Express 4 drops on the floor -- before #176 this request hung until the game was
        // closed, with no error shown and no retry.
        const res = await request(app).post("/services/roster/party/arrange/11").send({});
        expect(res.status).toBe(409);
    });

    it("answers 409, not a retryable 500, when a handler throws immediately", async () => {
        // game.ts touches the session on its first line and is NOT async, so Express did catch
        // this one -- and answered 500, which the game re-sends every 1-2 s for ever
        // (HttpAction.canRetry covers 0, 404 and anything >= 500).
        const res = await request(app).get("/services/game/11");
        expect(res.status).toBe(409);
    });

    it("leaves the reply alone when a handler throws AFTER replying", async () => {
        // chat.ts calls res.send() on its very first line and only then touches the session.
        //
        // HONEST LABEL: this passes with the fix, without it, and even with the headersSent guard
        // deliberately removed -- the reply is already flushed before the throw, so nothing
        // downstream can change what the client saw. Keep it as a statement of the contract (a
        // late failure must not alter a reply already given), not as evidence the fix works.
        const res = await request(app)
            .post("/services/chat/global/11")
            .set("Content-Type", "text/plain")
            .send("hello");
        expect(res.status).toBe(200);
    });

    it("still answers 400 for a malformed body, rather than flattening it to 409", async () => {
        // express.json() reports a bad body as an error carrying status 400.
        //
        // HONEST LABEL: this also passes without the middleware -- finalhandler already honours
        // err.status. It exists to catch a future change that flattens every error to one code.
        const res = await request(app)
            .post("/services/auth/login/11")
            .set("Content-Type", "application/json")
            .send("{nope");
        expect(res.status).toBe(400);
    });
});

// An address no router answers -- a route the game knows and we have not built -- used to get
// Express's default 404, which the game re-sends every 2 s for as long as it stays open (#164).
describe("An address no route answers", () => {
    it("answers 400, which the game does not re-send", async () => {
        const { session_key } = await loginPlayer("710");
        const res = await request(app).post(`/services/tourney/join/${session_key}`).send({});
        expect(res.status).toBe(400);
    });

    it("still turns away an unknown session key with 401 before it gets that far", async () => {
        const res = await request(app).post(`/services/tourney/join/${"0".repeat(32)}`).send({});
        expect(res.status).toBe(401);
    });

    // The unit-colour address carries the session key in the middle, and its route only
    // takes POST, so a GET to it lands here with the key still inside the path.
    it("keeps the session key out of the log wherever the address puts it", async () => {
        const { session_key } = await loginPlayer("711");
        // test/setup.ts silences console.warn for the whole file; clear that spy, never restore it.
        const warn = vi.spyOn(console, "warn");
        warn.mockClear();

        const res = await request(app).get(`/services/roster/unit/variation/${session_key}/unit1/1/0`);

        expect(res.status).toBe(400);
        const lines = warn.mock.calls.map((c) => String(c[0]));
        expect(lines.filter((l) => l.includes("no route"))).toHaveLength(1);
        expect(lines.some((l) => l.includes("/services/roster/unit/variation/<key>/unit1/1/0"))).toBe(true);
        expect(lines.some((l) => l.includes(session_key))).toBe(false);
    });

    it("writes nothing to the log for the login bypass, which has no signed-in player", async () => {
        const warn = vi.spyOn(console, "warn");
        warn.mockClear();

        const res = await request(app).post("/services/tourney/join/11").send({});

        expect(res.status).toBe(400);
        expect(warn.mock.calls.some((c) => String(c[0]).includes("no route"))).toBe(false);
    });
});
