import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    vi.resetModules();
});

describe("/debug/* routes", () => {
    it("return 404 when NODE_ENV=production", async () => {
        vi.resetModules();
        process.env.NODE_ENV = "production";
        const { default: app } = await import("../../src/app");

        const partyLimit = await request(app).post("/debug/party-limit").send({ limit: 1 });
        const fastTimer  = await request(app).post("/debug/fast-timer").send({ enabled: true });
        const renown     = await request(app).post("/debug/renown").send({ amount: 100 });
        const matchDelay = await request(app).post("/debug/match-delay").send({ ms: 10000 });

        expect(partyLimit.status).toBe(404);
        expect(fastTimer.status).toBe(404);
        expect(renown.status).toBe(404);
        expect(matchDelay.status).toBe(404);
    });

    it("are reachable when NODE_ENV is not production", async () => {
        vi.resetModules();
        process.env.NODE_ENV = "test";
        const { default: app } = await import("../../src/app");

        const res = await request(app).post("/debug/party-limit").send({ limit: 1 });
        expect(res.status).toBe(200);

        // Set it and clear it again, so this test leaves no delay behind on the queue
        // module it just imported.
        const delayOn = await request(app).post("/debug/match-delay").send({ ms: 10000 });
        const delayOff = await request(app).post("/debug/match-delay").send({});
        expect(delayOn.status).toBe(200);
        expect(delayOff.status).toBe(200);
    });

    it("treats a match delay that is not a number as 'off', and caps one that is too long", async () => {
        vi.resetModules();
        process.env.NODE_ENV = "test";
        const { default: app } = await import("../../src/app");

        // The server log is the only place the applied value is visible from outside, so read it
        // there. Both cases are quiet failures worth pinning: a hand-typed body that QUOTES the
        // number switches the hold OFF rather than on, and a very long hold is silently capped —
        // in each case the reply on its own looks exactly like plain success.
        const logged: string[] = [];
        const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
            logged.push(args.join(" "));
        });
        try {
            const quoted = await request(app).post("/debug/match-delay").send({ ms: "10000" });
            expect(quoted.status).toBe(200);
            expect(logged).toContain("[DEBUG] match delay off");

            logged.length = 0;
            const tooLong = await request(app).post("/debug/match-delay").send({ ms: 10 * 60_000 });
            expect(tooLong.status).toBe(200);
            expect(logged).toContain("[DEBUG] match delay 60000ms");
        } finally {
            spy.mockRestore();
            // Leave no delay behind on the queue module this test imported.
            await request(app).post("/debug/match-delay").send({});
        }
    });
});
