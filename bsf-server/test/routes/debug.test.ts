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
        const weakUnits  = await request(app).post("/debug/weak-units").send({ enabled: true });
        const renown     = await request(app).post("/debug/renown").send({ amount: 100 });

        expect(partyLimit.status).toBe(404);
        expect(weakUnits.status).toBe(404);
        expect(renown.status).toBe(404);
    });

    it("are reachable when NODE_ENV is not production", async () => {
        vi.resetModules();
        process.env.NODE_ENV = "test";
        const { default: app } = await import("../../src/app");

        const res = await request(app).post("/debug/party-limit").send({ limit: 1 });
        expect(res.status).toBe(200);
    });
});
