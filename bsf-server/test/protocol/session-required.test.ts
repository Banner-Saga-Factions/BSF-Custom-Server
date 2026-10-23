import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { listRoutes, routeName, ListedRoute } from "./routeTable";

// THE RULE: under /services, signing in is the only address that reaches a route without a
// session. Everything else is turned away at the gate in app.ts before any route code runs.
//
// This used to be a paragraph in the guides. It is a test because the way the rule breaks is by
// somebody ADDING something -- a route mounted above the gate, a second exemption that matches more
// than it meant to -- and a paragraph is not consulted at that moment. The routes are read from the
// running server (routeTable.ts), so a new one is covered the day it is added.
//
// Nobody is signed in anywhere in this file. That is the point: every request below is a stranger's.

const routes = listRoutes();
const SERVICES = routes.filter((r) => r.path.startsWith("/services/"));
const OUTSIDE = routes.filter((r) => !r.path.startsWith("/services/"));

// The one exemption. "11" in the game's own sign-in address is its protocol version (#193).
const SIGN_IN = "POST /services/auth/login/:httpVersion";

// A key of the right shape -- 32 hex characters -- that no session holds.
const UNKNOWN_KEY = "0123456789abcdef0123456789abcdef";

// Turn a registered address into one that can be sent: `key` goes where the session key goes
// (or nowhere, when it is null), and every other parameter becomes "1" -- a value that fits them
// all, including the two numbers the unit-colour address ends with.
function addressFor(route: ListedRoute, key: string | null): string {
    return route.path.replace(/\/:session_key\??/, key === null ? "" : `/${key}`).replace(/:\w+\??/g, "1");
}

// Sent with the route's own method, so a route registered for PUT or DELETE is really reached.
function send(route: ListedRoute, address: string) {
    const method = route.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
    const req = request(app)[method](address);
    return route.method === "GET" ? req : req.send({});
}

describe("The route list this file works from", () => {
    // Without this, every check below could pass by checking nothing: if the walk came back
    // empty, `it.each` would simply run no tests. One known route from each kind of place.
    it("holds the routes we know exist, so the checks below cannot pass by finding none", () => {
        const names = routes.map(routeName);
        expect(names).toEqual(
            expect.arrayContaining([
                SIGN_IN,
                "GET /services/game/:session_key",
                "POST /services/battle/move/:session_key",
                "POST /services/lobby/join/:session_key",
                "POST /services/roster/party/arrange/:session_key?",
                "POST /services/roster/unit/variation/:session_key/:unit_id/:variation/:lobby_id",
                "GET /health",
            ])
        );
    });
});

describe("Every /services route except sign-in needs a session", () => {
    const gated = SERVICES.filter((r) => routeName(r) !== SIGN_IN);
    const withKey = gated.filter((r) => r.path.includes(":session_key"));
    const keyOptional = gated.filter((r) => r.path.includes(":session_key?"));
    const withoutKey = gated.filter((r) => !r.path.includes(":session_key"));

    // 401 is the game's "you are signed out" -- right for a key we no longer hold, and what gets a
    // player signed back in after a restart.
    it.each(withKey.map((r) => [routeName(r), r] as const))(
        "%s answers 401 to a key nobody holds",
        async (_name, route) => {
            const res = await send(route, addressFor(route, UNKNOWN_KEY));
            expect(res.status).toBe(401);
        }
    );

    // The old back door (#193): "11" once got through the gate on every route, not only sign-in.
    // 403 rather than 401, because "11" was never a session key and must not sign anybody out.
    it.each(withKey.map((r) => [routeName(r), r] as const))(
        "%s answers 403 to the sign-in version number in the key's place",
        async (_name, route) => {
            const res = await send(route, addressFor(route, "11"));
            expect(res.status).toBe(403);
        }
    );

    // Some routes are registered with the key marked optional. Leaving it off must not get in.
    it.each(keyOptional.map((r) => [routeName(r), r] as const))(
        "%s answers 403 when the key is left off altogether",
        async (_name, route) => {
            const res = await send(route, addressFor(route, null));
            expect(res.status).toBe(403);
        }
    );

    // Routes whose address has no place for a key at all still sit behind the gate.
    it.each(withoutKey.map((r) => [routeName(r), r] as const))(
        "%s, which has no place for a key, answers 403",
        async (_name, route) => {
            const res = await send(route, addressFor(route, null));
            expect(res.status).toBe(403);
        }
    );
});

describe("Addresses outside /services", () => {
    // These are not behind the session gate, each for a reason: a health check for the host, the
    // steps of signing in through Discord (#251), and the developer switches, which are not
    // registered at all in production. The list is pinned so that a new address outside the gate
    // is a decision somebody wrote down here, not an accident.
    it("are exactly the ones listed here", () => {
        expect(OUTSIDE.map(routeName).sort()).toEqual([
            "GET /health",
            "GET /login/discord",
            "GET /login/discord/oauth-callback",
            "POST /debug/fast-timer",
            "POST /debug/match-delay",
            "POST /debug/party-limit",
            "POST /debug/renown",
            "POST /login/discord/handoff",
            "POST /login/discord/handoff/poll",
            "POST /login/discord/start",
        ]);
    });
});
