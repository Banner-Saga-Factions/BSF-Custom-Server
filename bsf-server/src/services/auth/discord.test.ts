import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../../app";
import { sessionHandler } from "./auth";
import { sign } from "jsonwebtoken";

const JWT_SECRET = "test-secret-do-not-use-in-prod";

vi.mock("../../db/account", () => ({
    upsertAccount: vi.fn().mockResolvedValue({
        user_id: 12345,
        username: "discorduser",
        renown: 0,
        daily_login_streak: 1,
        login_count: 1,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [],
        party_ids_json: [],
    }),
    getAccountByUserId: vi.fn().mockResolvedValue(null),
    getAccountById: vi.fn().mockResolvedValue(null),
    addRenown: vi.fn(),
    saveParty: vi.fn(),
    saveRoster: vi.fn(),
    saveRosterAndSpendRenown: vi.fn(),
    saveRosterAndParty: vi.fn(),
    expandBarracks: vi.fn(),
    parseRow: vi.fn(),
}));

beforeEach(() => {
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
    vi.unstubAllGlobals();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// Helper: walk the GET /login/discord/ redirect to seed pendingStates and capture
// both the cookie and the matching state value, so callback tests can present a
// valid (state, cookie) pair.
async function startFlow(): Promise<{ cookie: string; state: string }> {
    const res = await request(app).get("/login/discord/");
    const setCookie = res.headers["set-cookie"][0];
    const state = setCookie.match(/bsf_oauth_state=([^;]+)/)?.[1] ?? "";
    return { cookie: `bsf_oauth_state=${state}`, state };
}

// ──────────────────────────────────────────────
// getDiscordOAuthURL via GET /login/discord/
// ──────────────────────────────────────────────
describe("GET /login/discord/", () => {
    it("redirects to the Discord OAuth authorization URL with state and HttpOnly cookie", async () => {
        const res = await request(app).get("/login/discord/");
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("client_id=");
        expect(res.headers.location).toContain("redirect_uri=");
        expect(res.headers.location).toContain("scope=identify");
        expect(res.headers.location).toMatch(/state=[a-f0-9]+/);
        const setCookie = res.headers["set-cookie"][0];
        expect(setCookie).toMatch(/bsf_oauth_state=[a-f0-9]+/);
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Lax");
    });
});

// ──────────────────────────────────────────────
// OAuth callback error cases
// ──────────────────────────────────────────────
describe("GET /login/discord/oauth-callback (error cases)", () => {
    it("redirects with access_denied when Discord returns access_denied", async () => {
        const { cookie, state } = await startFlow();
        const res = await request(app)
            .get(`/login/discord/oauth-callback?error=access_denied&state=${state}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=access_denied");
    });

    it("redirects with oauth_error for unknown error codes (XSS guard)", async () => {
        const { cookie, state } = await startFlow();
        const res = await request(app)
            .get(`/login/discord/oauth-callback?error=${encodeURIComponent("<script>alert(1)</script>")}&state=${state}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=oauth_error");
        expect(res.headers.location).not.toContain("<script>");
    });

    it("redirects with missing_access_code when code is absent", async () => {
        const { cookie, state } = await startFlow();
        const res = await request(app)
            .get(`/login/discord/oauth-callback?state=${state}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=missing_access_code");
    });

    it("redirects with an error when the token fetch fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            status: 401,
            statusText: "Unauthorized",
            json: async () => ({}),
        }));

        const { cookie, state } = await startFlow();
        const res = await request(app)
            .get(`/login/discord/oauth-callback?code=bad_code&state=${state}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=");
    });

    it("redirects with unsupported_account_id for a Snowflake ID that loses precision", async () => {
        // Discord ID that exceeds Number.MAX_SAFE_INTEGER — parseInt rounds it
        const oversizedId = "99999999999999999"; // 17 digits, rounds in float
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({ access_token: "tok", token_type: "Bearer" }),
            })
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({ id: oversizedId, username: "biguser" }),
            })
        );

        const { cookie, state } = await startFlow();
        const res = await request(app)
            .get(`/login/discord/oauth-callback?code=valid_code&state=${state}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=unsupported_account_id");
    });
});

// ──────────────────────────────────────────────
// OAuth state validation (CSRF mitigation, Issue #54)
// ──────────────────────────────────────────────
describe("GET /login/discord/oauth-callback (state validation)", () => {
    it("redirects with invalid_state when no state cookie is present", async () => {
        const res = await request(app).get("/login/discord/oauth-callback?code=fake&state=anything");
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("bsf://auth?error=invalid_state");
    });

    it("redirects with invalid_state when query state and cookie state don't match", async () => {
        const { cookie } = await startFlow();
        const res = await request(app)
            .get("/login/discord/oauth-callback?code=fake&state=wrong-state")
            .set("Cookie", cookie);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("bsf://auth?error=invalid_state");
    });

    it("rejects state replay (one-shot deletion)", async () => {
        // First call consumes the state. Mock fetch so the call doesn't hit Discord's API.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            status: 401,
            statusText: "Unauthorized",
            json: async () => ({}),
        }));

        const { cookie, state } = await startFlow();
        await request(app)
            .get(`/login/discord/oauth-callback?code=fake&state=${state}`)
            .set("Cookie", cookie);
        // Replay with the same (state, cookie) pair must now fail — entry was deleted.
        const res = await request(app)
            .get(`/login/discord/oauth-callback?code=fake&state=${state}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("bsf://auth?error=invalid_state");
    });
});

// ──────────────────────────────────────────────
// POST /login/discord/session — JWT exchange
// ──────────────────────────────────────────────
describe("POST /login/discord/session", () => {
    it("returns 401 when Authorization header is missing", async () => {
        const res = await request(app).post("/login/discord/session");
        expect(res.status).toBe(401);
    });

    it("returns 401 for a tampered / invalid JWT", async () => {
        const res = await request(app)
            .post("/login/discord/session")
            .set("Authorization", "Bearer notavalidtoken");
        expect(res.status).toBe(401);
    });

    it("creates a session and returns session data for a valid JWT", async () => {
        // Sign a valid token using the test secret
        const token = sign({ discord_id: "12345" }, JWT_SECRET, { expiresIn: "1h" });

        const res = await request(app)
            .post("/login/discord/session")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("session_key");
        expect(res.body).toHaveProperty("user_id");
    });
});
