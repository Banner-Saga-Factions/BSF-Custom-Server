import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { sign } from "jsonwebtoken";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { ServerClasses } from "../../src/const";
import { getAccountByUserId, upsertAccount } from "../../src/db/account";
import { getBusyHourDays } from "../../src/db/activity";
import { resetArrivalLineClock } from "../../src/services/playerNumbers";
import {
    NOTICE_SHOWN_MS,
    refreshMessage,
    resetMessageForTests,
    sendMessageOfTheDay,
    sendNotice,
} from "../../src/services/messageOfTheDay";
import { flushEndgame, loginPlayer, MOCK_ACCOUNT_ROW } from "../helpers";

// What a player is sent at sign-in when there is a message of the day (#269), and how the red
// notice is cleared. Reading GitHub and cleaning the text are tested in
// src/services/messageOfTheDay.test.ts; here GitHub is a stand-in that answers one post.
vi.mock("../../src/db/activity", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/db/activity")>()),
    getBusyHourDays: vi.fn(),
}));

vi.mock("../../src/db/account", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/db/account")>()),
    upsertAccount: vi.fn(),
    getAccountByUserId: vi.fn(),
}));

const MESSAGE = "Battle Hour is Saturday, 20:00 UTC";

// Loads MESSAGE as the message of the day, the way the server does every 10 minutes.
async function setMessage(title: string = MESSAGE) {
    const post = {
        title,
        created_at: "2026-10-14T00:00:00Z",
        state: "open",
        author_association: "OWNER",
        category: { slug: "in-game" },
    };
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify([post])))
    );
    await refreshMessage();
}

beforeEach(() => {
    vi.mocked(upsertAccount).mockReset().mockResolvedValue(MOCK_ACCOUNT_ROW);
    vi.mocked(getAccountByUserId).mockReset().mockResolvedValue(null);
    vi.mocked(getBusyHourDays).mockReset().mockResolvedValue([]);
    resetArrivalLineClock();
    resetMessageForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const sessionFor = (key: string) => sessionHandler.getSession("session_key", key)!;

// Every server chat line and red notice waiting for a player, in the order they will arrive.
const sent = (key: string): string[] =>
    sessionFor(key)
        .data.filter(
            (d: any) =>
                d?.class === ServerClasses.SYSTEM_MESSAGE ||
                (d?.class === ServerClasses.CHAT_MESSAGE && d.username === "[server]")
        )
        .map((d: any) => (d.class === ServerClasses.SYSTEM_MESSAGE ? `notice: ${d.msg}` : `chat: ${d.msg}`));

async function signIn(steam_id: string) {
    const player = await loginPlayer(steam_id);
    await flushEndgame();
    return player;
}

describe("the message of the day at sign-in (#269)", () => {
    it("sends it as a chat line and as the red notice, just before the player numbers", async () => {
        await setMessage();

        const a = await signIn("9001");

        expect(sent(a.session_key)).toEqual([`chat: ${MESSAGE}`, `notice: ${MESSAGE}`, "chat: 1 player online."]);
    });

    it("sends nothing extra when there is no message", async () => {
        const a = await signIn("9001");

        expect(sent(a.session_key)).toEqual(["chat: 1 player online."]);
    });

    it("does not wait on GitHub: a sign-in reads only the copy already held", async () => {
        await setMessage();
        // GitHub would now never answer, and must not be asked.
        const hanging = vi.fn(() => new Promise<Response>(() => {}));
        vi.stubGlobal("fetch", hanging);

        const res = await request(app).post("/services/auth/login/11").send({ steam_id: "9001" });
        await flushEndgame();

        expect(res.status).toBe(200);
        expect(hanging).not.toHaveBeenCalled();
        expect(sent(res.body.session_key)[0]).toBe(`chat: ${MESSAGE}`);
    });

    it("is not sent to players already signed in, when they are told someone arrived", async () => {
        await setMessage();
        const a = await signIn("9001");

        await signIn("9002");

        expect(sent(a.session_key)).toEqual([
            `chat: ${MESSAGE}`,
            `notice: ${MESSAGE}`,
            "chat: 1 player online.",
            "chat: 2 players online now.",
        ]);
    });

    it("does the same after a Discord sign-in", async () => {
        await setMessage();
        const token = sign({ discord_id: "1122976027140956221" }, process.env.JWT_SECRET as string, {
            expiresIn: "1h",
        });

        const res = await request(app).post("/login/discord/session").set("Authorization", `Bearer ${token}`);
        await flushEndgame();

        expect(res.status).toBe(200);
        expect(sent(res.body.session_key)).toEqual([
            `chat: ${MESSAGE}`,
            `notice: ${MESSAGE}`,
            "chat: 1 player online.",
        ]);
    });
});

describe("clearing the red notice (#269)", () => {
    // Driven directly, on a signed-in player's session, so the clock can be moved on.
    async function signedInWithMessage() {
        await setMessage();
        const { session_key } = await signIn("9001");
        const session = sessionFor(session_key);
        session.data = [];
        return session;
    }

    it("clears it after 30 seconds", async () => {
        const session = await signedInWithMessage();
        vi.useFakeTimers();

        sendMessageOfTheDay(session);
        vi.advanceTimersByTime(NOTICE_SHOWN_MS - 1);
        expect(sent(session.session_key)).toEqual([`chat: ${MESSAGE}`, `notice: ${MESSAGE}`]);
        vi.advanceTimersByTime(1);

        expect(sent(session.session_key)).toEqual([`chat: ${MESSAGE}`, `notice: ${MESSAGE}`, "notice: "]);
    });

    it("logs and carries on when the clear cannot be sent, instead of failing in the timer", async () => {
        const session = await signedInWithMessage();
        vi.useFakeTimers();
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});

        sendMessageOfTheDay(session);
        vi.spyOn(session, "pushData").mockImplementation(() => {
            throw new Error("socket closed");
        });

        expect(() => vi.advanceTimersByTime(NOTICE_SHOWN_MS)).not.toThrow();
        expect(logged).toHaveBeenCalledWith(expect.stringContaining("[MOTD] could not clear"), expect.any(Error));
    });

    it("leaves a newer notice alone, such as an urgent warning sent in the meantime", async () => {
        const session = await signedInWithMessage();
        vi.useFakeTimers();

        sendMessageOfTheDay(session);
        sendNotice(session, "The server restarts in 5 minutes");
        vi.advanceTimersByTime(NOTICE_SHOWN_MS);

        expect(sent(session.session_key)).toEqual([
            `chat: ${MESSAGE}`,
            `notice: ${MESSAGE}`,
            "notice: The server restarts in 5 minutes",
        ]);
    });
});
