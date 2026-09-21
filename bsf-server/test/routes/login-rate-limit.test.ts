import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

// #284. The sign-in cap counts by network address. Behind our Caddy web server every
// request arrives carrying Caddy's address, so unless the server is told there is a
// proxy in front, one cap is shared by everybody: a restart signs every player out at
// once, and the sixth one back is refused.
//
// Nothing here can run against the app the other route tests import. The cap switches
// itself off entirely when NODE_ENV is "test" -- deliberately, because the suite would
// otherwise exhaust it -- so each case rebuilds the app under a different environment,
// the way test/routes/debug.test.ts does. "development" rather than "production"
// because it flips the cap and nothing else; production would also unmount the debug
// routes and change the battle timer, for no benefit here.
//
// Rebuilding also hands each case its own empty counter, so neither can see the other's.

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;

afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
    vi.resetModules();
});

async function appWithTrustProxy(setting: string): Promise<Express> {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.TRUST_PROXY = setting;
    const { default: app } = await import("../../src/app");
    return app;
}

// The addresses come from 203.0.113.0/24, the range set aside for documentation, so
// nothing in this file resembles a real player. They have to be addresses the server
// can parse: the rate-limit library rejects anything that is not one, swallows the
// complaint, and would then quietly count every request under the same junk -- a test
// that passes for the wrong reason.
//
// The body is empty on purpose. The cap counts a request before the sign-in handler
// ever runs, so an empty body is refused for bad input with a 400 and still fills the
// bucket. That keeps this test clear of the account database, the session store, and
// everything else that would have to be pretended into existence to reach a real 200.
async function attemptSignInFrom(app: Express, address: string): Promise<number> {
    const res = await request(app)
        .post("/services/auth/login/11")
        .set("X-Forwarded-For", address)
        .send({});
    return res.status;
}

describe("the sign-in cap of five a minute (#284)", () => {
    it("counts every player together when the server is not told about its proxy", async () => {
        const app = await appWithTrustProxy("false");

        const statuses: number[] = [];
        for (let i = 1; i <= 6; i++) {
            statuses.push(await attemptSignInFrom(app, `203.0.113.${i}`));
        }

        // Six different people, six different addresses, and the sixth is still turned
        // away. This is what the live server does today.
        expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    });

    it("gives each player their own cap once the server is told about its proxy", async () => {
        const app = await appWithTrustProxy("true");

        const first: number[] = [];
        for (let i = 0; i < 5; i++) {
            first.push(await attemptSignInFrom(app, "203.0.113.1"));
        }
        expect(first).toEqual([400, 400, 400, 400, 400]);

        // A second player, arriving after the first has used the whole cap, is not
        // affected by them at all. This is the case that cannot even be written until
        // the setting exists.
        expect(await attemptSignInFrom(app, "203.0.113.2")).toBe(400);

        // And the first player is still capped, so the cap has not simply stopped
        // working -- it has started counting the right thing.
        expect(await attemptSignInFrom(app, "203.0.113.1")).toBe(429);
    });

    it("says what it is refusing, so a refusal cannot be confused with the long-poll one", async () => {
        const app = await appWithTrustProxy("true");

        for (let i = 0; i < 5; i++) {
            await attemptSignInFrom(app, "203.0.113.3");
        }
        const res = await request(app)
            .post("/services/auth/login/11")
            .set("X-Forwarded-For", "203.0.113.3")
            .send({});

        expect(res.status).toBe(429);
        expect(res.body).toHaveProperty("error");
        expect(res.body.error).toMatch(/login/i);
    });
});
