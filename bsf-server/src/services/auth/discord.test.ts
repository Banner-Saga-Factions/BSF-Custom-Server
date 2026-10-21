import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import { inspect } from "util";
import app from "../../app";
import { sessionHandler } from "./auth";
import { upsertAccount } from "../../db/account";
import { accountNumberFor } from "../../db/accountNumbers";
import { clearHandoffsForTest, readyHandoffForTest, HANDOFF_TTL_MS } from "./discordHandoff";

vi.mock("../../db/account", () => ({
    upsertAccount: vi.fn(async (user_id: string, username: string) => ({
        user_id,
        username,
        renown: 0,
        daily_login_streak: 1,
        login_count: 1,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [],
        party_ids_json: [],
    })),
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
    clearHandoffsForTest();
    vi.unstubAllGlobals();
    vi.mocked(upsertAccount).mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

type Handoff = { code: string; key: string; url: string; expires_in: number };

// The game's first step: ask for a hand-off.
async function newHandoff(): Promise<Handoff> {
    const res = await request(app).post("/login/discord/handoff");
    expect(res.status).toBe(200);
    return res.body as Handoff;
}

async function poll(key: unknown) {
    return request(app).post("/login/discord/handoff/poll").send({ key });
}

async function signIn(key: string) {
    return request(app)
        .post("/services/auth/login/11")
        .send({ username: "x", password: `discord:${key}` });
}

// The browser's steps: open the page, press Continue. Returns what the callback tests need.
async function startFlow(handoff?: Handoff) {
    const h = handoff ?? (await newHandoff());
    const page = await request(app).get(`/login/discord/?code=${h.code}`);
    expect(page.status).toBe(200);
    const confirmCookie = page.headers["set-cookie"][0].match(/bsf_confirm=([a-f0-9]+)/)?.[1] ?? "";
    const confirm = page.text.match(/name="confirm" value="([a-f0-9]+)"/)?.[1] ?? "";
    const start = await request(app)
        .post("/login/discord/start")
        .type("form")
        .set("Cookie", `bsf_confirm=${confirmCookie}`)
        .send({ code: h.code, confirm });
    expect(start.status).toBe(303);
    const state = start.headers["set-cookie"][0].match(/bsf_oauth_state=([a-f0-9]+)/)?.[1] ?? "";
    return { ...h, state, cookie: `bsf_oauth_state=${state}`, location: start.headers.location as string };
}

// Discord's two answers: the token swap, then who the player is.
function stubDiscord(id: string, username: string) {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValueOnce({ status: 200, json: async () => ({ access_token: "tok", token_type: "Bearer" }) })
            .mockResolvedValueOnce({ status: 200, json: async () => ({ id, username }) })
    );
}

async function callback(flow: { state: string; cookie: string }, query = "code=valid_code") {
    return request(app).get(`/login/discord/oauth-callback?${query}&state=${flow.state}`).set("Cookie", flow.cookie);
}

// ──────────────────────────────────────────────
// The game's side: asking for a hand-off, asking whether it has finished
// ──────────────────────────────────────────────
describe("POST /login/discord/handoff", () => {
    it("gives the game a readable code, a long key and the page to open", async () => {
        const h = await newHandoff();
        expect(h.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
        expect(h.key).toMatch(/^[a-f0-9]{32}$/);
        expect(h.url).toMatch(new RegExp(`/login/discord/\\?code=${h.code}$`));
        expect(h.expires_in).toBe(300);
    });

    it("stores nothing more once 10,000 hand-offs are waiting, and answers 429", async () => {
        // A fresh copy of the server, so the hand-offs made here never reach the other tests.
        vi.resetModules();
        const { default: freshApp } = await import("../../app");
        const fresh = await import("./discordHandoff");
        for (let i = 0; i < 10_000; i++) fresh.createHandoff();

        const res = await request(freshApp).post("/login/discord/handoff");

        expect(res.status).toBe(429);
        expect(fresh.handoffCount()).toBe(10_000);
    });
});

describe("POST /login/discord/handoff/poll", () => {
    it("answers pending while the player is still in the browser", async () => {
        const h = await newHandoff();
        const res = await poll(h.key);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "pending" });
    });

    it("answers 200 expired, never 404, for a key it does not know", async () => {
        for (const key of ["0".repeat(32), "constructor", 42, undefined]) {
            const res = await poll(key);
            expect(res.status).toBe(200);
            expect(res.body.status).toBe("expired");
            expect(res.body.message).toMatch(/start again/i);
        }
    });

    it("answers expired after five minutes", async () => {
        const h = await newHandoff();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + HANDOFF_TTL_MS + 1000);
        const res = await poll(h.key);
        expect(res.body.status).toBe("expired");
    });
});

// ──────────────────────────────────────────────
// The browser's side: the page, Continue, Discord's return
// ──────────────────────────────────────────────
describe("GET /login/discord/ (the page the game opens)", () => {
    it("shows the code and asks the player to check it, and cannot be framed", async () => {
        const h = await newHandoff();
        const res = await request(app).get(`/login/discord/?code=${h.code}`);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toContain("text/html");
        expect(res.text).toContain(h.code);
        expect(res.text).toContain("Is this the code shown in your game?");
        expect(res.headers["x-frame-options"]).toBe("DENY");
        expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
        const setCookie = res.headers["set-cookie"][0];
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Lax");
    });

    it("says the sign-in has expired for a code it does not know, and shows nothing it was sent", async () => {
        const res = await request(app).get(`/login/discord/?code=${encodeURIComponent("<script>alert(1)</script>")}`);
        expect(res.status).toBe(410);
        expect(res.text).toMatch(/expired/i);
        expect(res.text).not.toContain("<script>");
    });

    it("works again while the hand-off waits, so the game's Retry can reopen it", async () => {
        const h = await newHandoff();
        expect((await request(app).get(`/login/discord/?code=${h.code}`)).status).toBe(200);
        expect((await request(app).get(`/login/discord/?code=${h.code}`)).status).toBe(200);
    });
});

describe("POST /login/discord/start (Continue)", () => {
    it("sends the player to Discord, always asking them to press Authorize", async () => {
        const flow = await startFlow();
        expect(flow.location).toContain("discord.com");
        expect(flow.location).toContain("scope=identify");
        expect(flow.location).toContain("prompt=consent");
        expect(flow.location).toContain(`state=${flow.state}`);
    });

    it("refuses a Continue the page did not send: no cookie, or a different value", async () => {
        const h = await newHandoff();
        const noCookie = await request(app)
            .post("/login/discord/start")
            .type("form")
            .send({ code: h.code, confirm: "a".repeat(32) });
        expect(noCookie.status).toBe(400);
        expect(noCookie.headers.location).toBeUndefined();

        const mismatch = await request(app)
            .post("/login/discord/start")
            .type("form")
            .set("Cookie", `bsf_confirm=${"b".repeat(32)}`)
            .send({ code: h.code, confirm: "a".repeat(32) });
        expect(mismatch.status).toBe(400);

        // An empty value with no cookie: the two are equal, and still refused.
        const empty = await request(app).post("/login/discord/start").type("form").send({ code: h.code, confirm: "" });
        expect(empty.status).toBe(400);
        expect(empty.headers.location).toBeUndefined();
    });

    it("stores nothing more once 10,000 states are waiting, and answers 429 (#301)", async () => {
        vi.resetModules();
        const { default: freshApp } = await import("../../app");
        const fresh = await import("./discord");
        const h = (await request(freshApp).post("/login/discord/handoff")).body as Handoff;
        const page = await request(freshApp).get(`/login/discord/?code=${h.code}`);
        const confirm = page.text.match(/name="confirm" value="([a-f0-9]+)"/)?.[1] ?? "";
        for (let i = 0; i < 10_000; i++) fresh.getDiscordOAuthURL();

        const res = await request(freshApp)
            .post("/login/discord/start")
            .type("form")
            .set("Cookie", `bsf_confirm=${confirm}`)
            .send({ code: h.code, confirm });

        expect(res.status).toBe(429);
        expect(fresh.pendingStateCount()).toBe(10_000);
    });
});

describe("GET /login/discord/oauth-callback", () => {
    it("marks the hand-off ready and tells the player to go back; the account is saved only at sign-in", async () => {
        // #25: a Snowflake far above 2^53 is carried as text, never rounded.
        const bigSnowflake = "1122976027140956221";
        stubDiscord(bigSnowflake, "biguser");
        const flow = await startFlow();

        const res = await callback(flow);

        expect(res.status).toBe(200);
        expect(res.text).toContain("Signed in as <strong>biguser</strong>");
        expect((await poll(flow.key)).body).toEqual({ status: "ready" });
        expect(vi.mocked(upsertAccount)).not.toHaveBeenCalled();

        const signed = await signIn(flow.key);
        expect(signed.status).toBe(200);
        expect(vi.mocked(upsertAccount)).toHaveBeenCalledWith(bigSnowflake, "biguser");
    });

    it("shows a Discord name as text, never as part of the page", async () => {
        stubDiscord("1122976027140956221", "<script>alert(1)</script>");
        const res = await callback(await startFlow());
        expect(res.text).not.toContain("<script>");
        expect(res.text).toContain("&lt;script&gt;");
    });

    it("keeps the hand-off waiting when the player says no at Discord, without showing Discord's text", async () => {
        const flow = await startFlow();
        const res = await callback(flow, `error=${encodeURIComponent("<b>anything</b>")}`);
        expect(res.status).toBe(400);
        expect(res.text).not.toContain("<b>anything</b>");
        expect((await poll(flow.key)).body).toEqual({ status: "pending" });

        const denied = await callback(await startFlow(), "error=access_denied");
        expect(denied.text).toContain("You chose not to sign in with Discord.");
    });

    it("answers a page, not a crash, for an error named like a built-in or sent as an object (#311)", async () => {
        // The last two arrive as objects, not text: error[toString]=x is { toString: "x" }.
        const queries = [
            "error=constructor",
            "error=__proto__",
            "error=toString",
            "error[toString]=x",
            "error[][toString]=x&error[]=a",
        ];
        for (const query of queries) {
            const flow = await startFlow();
            const res = await callback(flow, query);
            expect(res.status).toBe(400);
            expect(res.text).toContain("Discord did not finish signing you in.");
            expect((await poll(flow.key)).body).toEqual({ status: "pending" });
        }
    });

    it("finishes only the hand-off its page was opened for", async () => {
        const a = await newHandoff();
        const b = await newHandoff();
        stubDiscord("1122976027140956221", "playerA");

        await callback(await startFlow(a));

        expect((await poll(a.key)).body).toEqual({ status: "ready" });
        expect((await poll(b.key)).body).toEqual({ status: "pending" });
    });

    it("keeps the first Discord account when a second finishes for the same code", async () => {
        const h = await newHandoff();
        const first = await startFlow(h);
        const second = await startFlow(h);
        stubDiscord("1122976027140956221", "first");
        expect((await callback(first)).status).toBe(200);

        stubDiscord("41771983423143936", "second");
        expect((await callback(second)).status).toBe(410);

        expect((await signIn(h.key)).status).toBe(200);
        expect(vi.mocked(upsertAccount)).toHaveBeenCalledWith("1122976027140956221", "first");
        expect(vi.mocked(upsertAccount)).not.toHaveBeenCalledWith("41771983423143936", expect.any(String));
    });

    it("keeps the hand-off waiting when Discord cannot be reached", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ status: 401, statusText: "Unauthorized", json: async () => ({}) })
        );
        const flow = await startFlow();
        const res = await callback(flow);
        expect(res.text).toContain("We could not reach Discord.");
        expect((await poll(flow.key)).body).toEqual({ status: "pending" });
    });

    it("fails the hand-off for an id a Steam player holds, and the game is told why (#375)", async () => {
        vi.mocked(accountNumberFor).mockResolvedValueOnce({ ownedBy: "steam" });
        stubDiscord("41771983423143936", "early");
        const flow = await startFlow();

        const res = await callback(flow);

        expect(res.status).toBe(400);
        const answer = (await poll(flow.key)).body;
        expect(answer.status).toBe("failed");
        expect(answer.message).toMatch(/already used by another player/);
        expect(vi.mocked(upsertAccount)).not.toHaveBeenCalled();
    });

    it('fails the hand-off for a Discord id of "0" (#140)', async () => {
        stubDiscord("0", "zerouser");
        const flow = await startFlow();
        await callback(flow);
        expect((await poll(flow.key)).body.status).toBe("failed");
    });

    it("says expired without a matching state cookie, or for a replayed state (#54)", async () => {
        const noCookie = await request(app).get("/login/discord/oauth-callback?code=fake&state=anything");
        expect(noCookie.status).toBe(410);

        const flow = await startFlow();
        const wrong = await request(app)
            .get("/login/discord/oauth-callback?code=fake&state=wrong-state")
            .set("Cookie", flow.cookie);
        expect(wrong.status).toBe(410);

        await callback(flow, "error=access_denied");
        const replay = await callback(flow);
        expect(replay.status).toBe(410);
    });
});

// ──────────────────────────────────────────────
// Signing in with the hand-off's key (auth.ts)
// ──────────────────────────────────────────────
describe("POST /services/auth/login/11 with a Discord hand-off", () => {
    it("signs in once with the player's stored number (#140); the same key again is refused", async () => {
        vi.mocked(accountNumberFor).mockResolvedValueOnce({ account_id: 7 });
        const key = readyHandoffForTest("1122976027140956221", "discorduser");

        const first = await signIn(key);
        expect(first.status).toBe(200);
        expect(first.body.user_id).toBe(7);
        expect(first.body).toHaveProperty("session_key");
        expect(first.body.display_name).toBe("discorduser");

        const again = await signIn(key);
        expect(again.status).toBe(401);
        expect(again.headers["content-type"]).toContain("text/plain");
        expect(again.text).toMatch(/expired/i);
    });

    it("refuses a key whose Discord step has not finished, and keeps it usable", async () => {
        const h = await newHandoff();
        const res = await signIn(h.key);
        expect(res.status).toBe(401);
        expect(res.text).toMatch(/not finished/i);
        expect((await poll(h.key)).body).toEqual({ status: "pending" });
    });

    it("refuses with 400 a key whose Discord step was refused for good, and says why", async () => {
        stubDiscord("0", "zerouser");
        const flow = await startFlow();
        await callback(flow);

        const res = await signIn(flow.key);

        expect(res.status).toBe(400);
        expect(res.text).toMatch(/cannot be used to sign in/);
        expect(vi.mocked(upsertAccount)).not.toHaveBeenCalled();
    });

    it("refuses a key it never gave out, and one that has expired", async () => {
        expect((await signIn("f".repeat(32))).status).toBe(401);

        const key = readyHandoffForTest("1122976027140956221", "discorduser");
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + HANDOFF_TTL_MS + 1000);
        expect((await signIn(key)).status).toBe(401);
    });

    it("refuses with 400 when a Steam player took the id meanwhile, leaving their session alone (#375)", async () => {
        const holder = sessionHandler.addSession(41771983423143936, "41771983423143936", 777);
        const key = readyHandoffForTest("41771983423143936", "early");
        vi.mocked(accountNumberFor).mockResolvedValueOnce({ ownedBy: "steam" });

        const res = await signIn(key);

        expect(res.status).toBe(400);
        expect(res.text).toMatch(/already used by another player/);
        expect(sessionHandler.getSession("session_key", holder.session_key)).toBe(holder);
    });

    it("leaves a password that is not a hand-off to the Steam route", async () => {
        const res = await request(app).post("/services/auth/login/11").send({ steam_id: "123", password: "kiosk" });
        expect(res.status).toBe(200);
        expect(vi.mocked(upsertAccount)).toHaveBeenCalledWith("123", expect.any(String));
    });

    it("keeps two Snowflakes that round to one Number apart, both signed in at once (#25, #140)", async () => {
        const idA = "9007199254740992"; // 2^53
        const idB = "9007199254740993"; // 2^53 + 1 -- the same Number as idA
        expect(Number(idA)).toBe(Number(idB));

        for (const id of [idA, idB]) expect((await signIn(readyHandoffForTest(id, `p${id}`))).status).toBe(200);

        expect(vi.mocked(upsertAccount)).toHaveBeenCalledWith(idA, expect.any(String));
        expect(vi.mocked(upsertAccount)).toHaveBeenCalledWith(idB, expect.any(String));
        const both = sessionHandler.getSessions((s) => [idA, idB].includes(s.external_id_str));
        expect(both.length).toBe(2);
    });
});

// ──────────────────────────────────────────────
// Neither secret reaches the server's log
// ──────────────────────────────────────────────
describe("logging", () => {
    const methods = ["log", "info", "warn", "error", "debug"] as const;

    // Every line written to the console from here on, objects and errors printed in full.
    function captureLog(): string[] {
        const lines: string[] = [];
        for (const m of methods) {
            vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
                lines.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" "));
            });
        }
        return lines;
    }

    afterEach(() => {
        // test/setup.ts silences these two for the whole run; keep them silent.
        for (const m of methods) vi.mocked(console[m]).mockImplementation(() => {});
    });

    it("never writes the key or the code, through a whole sign-in and its refusals", async () => {
        const lines = captureLog();
        stubDiscord("1122976027140956221", "loguser");
        const flow = await startFlow();
        await callback(flow);
        await poll(flow.key);
        await signIn(flow.key);
        await signIn(flow.key); // refused: already used
        const other = await newHandoff();
        await signIn(other.key); // refused: not finished

        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            for (const secret of [flow.key, flow.code, other.key, other.code]) {
                expect(line).not.toContain(secret);
            }
        }
    });

    it("never writes any part of the key or the code for a body it cannot read", async () => {
        const lines = captureLog();
        const h = await newHandoff();
        // Not JSON: the value has no quotes. Node's message quotes the start of a bad body.
        const broken = `{"key":z${h.key}}`;
        const asJson = { "Content-Type": "application/json" };
        await request(app).post("/login/discord/handoff/poll").set(asJson).send(broken);
        await request(app).get(`/login/discord/?code=${h.code}`).set(asJson).send(broken);

        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            expect(line).not.toContain(h.key.slice(0, 8));
            expect(line).not.toContain(h.code);
        }
    });
});
