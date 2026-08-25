import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";

// What the server sends when a handler FAILS -- a different question from what any one route
// does when it works. Until #176 the answer was often "nothing at all". Express 4 wraps a
// handler call in a try/catch, which catches a handler that fails immediately but never sees an
// async one reject, so no error handler ran and no reply was sent. The game has no request
// timeout of its own, so it waited for ever and showed the player nothing.
//
// Every test below reaches a real handler rather than a route added for testing. They all use
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
