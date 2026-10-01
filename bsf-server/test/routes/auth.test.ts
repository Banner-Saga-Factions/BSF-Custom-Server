import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { loginPlayer } from "../helpers";
import { upsertAccount } from "../../src/db/account";

// vi.mock is hoisted to the top of the file by vitest before any imports run.
// That means imported variables (like MOCK_ACCOUNT_ROW from helpers) don't exist yet.
// Solution: define all mock return values as inline object literals — no external references.
vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockResolvedValue({
        user_id: 123,
        username: "testplayer",
        renown: 100,
        daily_login_streak: 1,
        login_count: 5,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [
            { id: "unit1", entityClass: "Archer",  stats: [{ stat: "RANK", value: 1 }] },
            { id: "unit2", entityClass: "Warrior", stats: [{ stat: "RANK", value: 2 }] },
        ],
        party_ids_json: ["unit1", "unit2"],
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

beforeEach(() => {
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
});

describe("POST /services/auth/login/11", () => {
    it("returns session_key, user_id, display_name, build_number for a valid steam_id", async () => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({ steam_id: "123" });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("session_key");
        expect(res.body).toHaveProperty("user_id");
        expect(res.body).toHaveProperty("display_name");
        expect(res.body).toHaveProperty("build_number");
    });

    it("returns 400 for a non-numeric steam_id", async () => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({ steam_id: "not-a-number" });

        expect(res.status).toBe(400);
    });

    it("returns 400 when steam_id is missing", async () => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({});

        expect(res.status).toBe(400);
    });

    // #231: the same player must not get a second account, with its own starting renown, by
    // writing their id with a leading zero.
    it("signs a zero-padded id into the same account as the plain one", async () => {
        const first = await loginPlayer("76561198000000001");
        vi.mocked(upsertAccount).mockClear();

        const res = await request(app)
            .post("/services/auth/login/11")
            .send({ steam_id: "076561198000000001" });

        expect(res.status).toBe(200);
        expect(vi.mocked(upsertAccount).mock.calls[0][0]).toBe("76561198000000001");
        // The earlier session is replaced, exactly as when the same player signs in twice.
        expect(sessionHandler.getSession("session_key", first.session_key)).toBeUndefined();
        expect(sessionHandler.getSessions()).toHaveLength(1);
    });

    it.each([
        ["zero", "0"],
        ["zero written with padding", "000"],
        ["21 digits", "1".repeat(21)],
        ["one above the largest 64-bit id", "18446744073709551616"],
        ["a list", ["123"]],
    ])("returns 400 for %s", async (_label, steam_id) => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({ steam_id });

        expect(res.status).toBe(400);
    });

    // A Steam id sent as a JSON number is rounded when the body is read: this one arrives as
    // 76561198000000000, which is somebody else's id. The game sends text, so a number too
    // large to hold exactly is refused rather than signed into the wrong account.
    it("returns 400 for a JSON number too large to hold exactly", async () => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .set("Content-Type", "application/json")
            .send('{"steam_id":76561198000000001}');

        expect(res.status).toBe(400);
    });

    it.each([
        ["the largest 64-bit id", "18446744073709551615"],
        ["a plain JSON number", 123],
    ])("accepts %s", async (_label, steam_id) => {
        const res = await request(app)
            .post("/services/auth/login/11")
            .send({ steam_id });

        expect(res.status).toBe(200);
    });
});

describe("POST /services/auth/logout/:session_key", () => {
    it("removes the session -- subsequent requests are told to log in again", async () => {
        const { session_key } = await loginPlayer("456");

        const logout = await request(app).post(`/services/auth/logout/${session_key}`);
        expect(logout.status).toBe(200);

        const after = await request(app).get(`/services/account/info/${session_key}`);
        expect(after.status).toBe(401);
    });

    // #224: a sign-out outside a battle used to leave no trace in the log. This line is how
    // we learned the game really does sign out when it closes (GameFsm.cleanup in the client):
    // it appeared when the game was closed outside a battle (2026-10-01).
    it("logs the sign-out of a player who is not in a battle", async () => {
        const { session_key } = await loginPlayer("457");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const log = vi.spyOn(console, "log");
        try {
            await request(app).post(`/services/auth/logout/${session_key}`);

            expect(log).toHaveBeenCalledWith(`[SESSION] Signed out user_id=${session.user_id}`);
        } finally {
            log.mockRestore();
        }
    });
});

describe("Session middleware", () => {
    it("answers 401 for a session key we do not recognise, so the game can recover", async () => {
        const res = await request(app).get(`/services/account/info/${"a".repeat(32)}`);
        expect(res.status).toBe(401);
    });

    it("passes through for a valid session key", async () => {
        const { session_key } = await loginPlayer("789");
        const res = await request(app).get(`/services/account/info/${session_key}`);
        expect(res.status).toBe(200);
    });

    it("returns 200 for the captured steam overlay shape without any session key", async () => {
        const res = await request(app).get("/services/session/steam/overlay/abc123/true");
        expect(res.status).toBe(200);
    });

    it("returns 403 for non-overlay paths under /steam/overlay/ (Issue #55, no prefix bypass)", async () => {
        const res = await request(app).get("/services/session/steam/overlay/anything");
        expect(res.status).toBe(403);
    });

    it("does not answer 500 for a malformed Bearer token", async () => {
        // "bad-token" is not key-shaped, so the 403 here comes from the shape branch, not the JWT
        // check. What this still pins is that a token which fails to verify is caught rather than
        // thrown. The next test covers the JWT path proper.
        const res = await request(app)
            .post("/services/vs/start/bad-token")
            .set("Authorization", "Bearer this.is.not.a.valid.jwt");
        expect(res.status).toBe(403);
    });

    it("answers 401 when a malformed Bearer token arrives on a key-shaped path", async () => {
        const res = await request(app)
            .post(`/services/vs/start/${"d".repeat(32)}`)
            .set("Authorization", "Bearer this.is.not.a.valid.jwt");
        expect(res.status).toBe(401);
    });

    it("answers 403, not 401, when the last path segment was never a session key", async () => {
        const res = await request(app).get("/services/account/info/12345");
        expect(res.status).toBe(403);
    });

    it("turns away a /11 address that is not sign-in, before any route runs (#193)", async () => {
        // "11" is the game's protocol version on the sign-in address, not a session key. It used
        // to get through the gate on every route, reach the handler with no session, and answer
        // 409 with an [UNCAUGHT] line in the log.
        // test/setup.ts silences console.error for the whole file; clear that spy, never restore it.
        const error = vi.spyOn(console, "error");
        error.mockClear();

        const res = await request(app).post("/services/roster/unit/promote/11").send({});

        expect(res.status).toBe(403);
        expect(error.mock.calls.some((c) => String(c[0]).includes("[UNCAUGHT]"))).toBe(false);
    });

    it("lets any sign-in version through the gate, not only 11 (#167)", async () => {
        const res = await request(app).post("/services/auth/login/12").send({ steam_id: "790" });
        expect(res.status).toBe(200);
    });

    it("exempts only the sign-in address itself, not one that merely ends like it", async () => {
        const res = await request(app).post("/services/roster/auth/login/11").send({});
        expect(res.status).toBe(403);
    });

    it("finds the session key on a route that has parts after it, and keeps the player signed in (#188 / R5)", async () => {
        // This route puts a lobby id in the LAST segment. The gate used to read that as the key,
        // find no session and refuse a perfectly healthy player -- which is what R5 describes.
        // It now reads the key from its real position, so the request reaches the route.
        //
        // This file's mock hands back the SAME account object on every login, so set the class
        // explicitly here rather than relying on whatever an earlier test left behind.
        const { session_key } = await loginPlayer("901");
        const session = sessionHandler.getSession("session_key", session_key)!;
        const unit = session.accountData!.roster_json.find((u: any) => u.id === "unit1")!;
        unit.entityClass = "siegearcher"; // one of the twelve classes that has three colours
        unit.appearance_index = 0;

        const res = await request(app)
            .post(`/services/roster/unit/variation/${session_key}/unit1/1/0`);
        expect(res.status).toBe(200);

        // The point of this test: the player is still signed in afterwards. A 401 anywhere on
        // this path would abandon the request, mark the game offline and put them through its
        // disconnect-and-sign-in-again path -- for recolouring a unit.
        const after = await request(app).get(`/services/account/info/${session_key}`);
        expect(after.status).toBe(200);
    });

    it("still refuses a recolour whose session key is not one we know", async () => {
        // The gate reads the key from the right place now, so an unknown-but-key-shaped one must
        // still be turned away -- reading it correctly must not mean trusting it.
        const res = await request(app)
            .post(`/services/roster/unit/variation/${"c".repeat(32)}/unit1/1/0`);
        expect(res.status).toBe(401);

        // And a value that was never key-shaped keeps the gentler answer, so a malformed address
        // cannot sign anybody out.
        const notAKey = await request(app)
            .post(`/services/roster/unit/variation/not-a-session-key/unit1/1/0`);
        expect(notAKey.status).toBe(403);
    });

    it("answers 401 on the long poll for a dead session, so polling stops", async () => {
        // This is the path recovery actually rides. Fifteen transaction classes mark their
        // response consumed before the client's dispatcher sees it, so their 401s are discarded;
        // the long poll does not, which is why it is the one that gets the player signed back in.
        const res = await request(app).get(`/services/game/${"b".repeat(32)}`);
        expect(res.status).toBe(401);
    });
});
