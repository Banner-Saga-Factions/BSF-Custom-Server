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

// ──────────────────────────────────────────────
// getDiscordOAuthURL via GET /login/discord/
// ──────────────────────────────────────────────
describe("GET /login/discord/", () => {
    it("redirects to the Discord OAuth authorization URL", async () => {
        const res = await request(app).get("/login/discord/");
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("client_id=");
        expect(res.headers.location).toContain("redirect_uri=");
        expect(res.headers.location).toContain("scope=identify");
    });
});

// ──────────────────────────────────────────────
// OAuth callback error cases
// ──────────────────────────────────────────────
describe("GET /login/discord/oauth-callback (error cases)", () => {
    it("redirects with access_denied when Discord returns access_denied", async () => {
        const res = await request(app).get("/login/discord/oauth-callback?error=access_denied");
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=access_denied");
    });

    it("redirects with oauth_error for unknown error codes (XSS guard)", async () => {
        const res = await request(app).get(
            "/login/discord/oauth-callback?error=<script>alert(1)</script>"
        );
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=oauth_error");
        expect(res.headers.location).not.toContain("<script>");
    });

    it("redirects with missing_access_code when code is absent", async () => {
        const res = await request(app).get("/login/discord/oauth-callback");
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=missing_access_code");
    });

    it("redirects with an error when the token fetch fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            status: 401,
            statusText: "Unauthorized",
            json: async () => ({}),
        }));

        const res = await request(app).get("/login/discord/oauth-callback?code=bad_code");
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

        const res = await request(app).get("/login/discord/oauth-callback?code=valid_code");
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("error=unsupported_account_id");
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
