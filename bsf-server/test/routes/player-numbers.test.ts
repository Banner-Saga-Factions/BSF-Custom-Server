import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { sign } from "jsonwebtoken";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { ServerClasses } from "../../src/const";
import { getAccountByUserId, upsertAccount } from "../../src/db/account";
import { getBusyHourDays } from "../../src/db/activity";
import { busyHoursSince, resetArrivalLineClock } from "../../src/services/playerNumbers";
import { flushEndgame, loginPlayer } from "../helpers";

// Who gets the player-numbers chat lines after a sign-in (#337), and when. The wording and the
// busy-hours arithmetic are tested in src/services/playerNumbers.test.ts, and the four-week
// query against a real database in src/db/activity.integration.test.ts. Here the query is a
// stand-in that returns whatever history a test gives it.
vi.mock("../../src/db/activity", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/db/activity")>()),
    getBusyHourDays: vi.fn(),
}));

vi.mock("../../src/db/account", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/db/account")>()),
    upsertAccount: vi.fn(),
    getAccountByUserId: vi.fn(),
}));

const ACCOUNT = {
    user_id: 123,
    username: "testplayer",
    renown: 100,
    daily_login_streak: 1,
    login_count: 5,
    completed_tutorial: true,
    roster_rows: 2,
    roster_json: [],
    party_ids_json: [],
};

beforeEach(() => {
    vi.mocked(upsertAccount).mockReset().mockResolvedValue(ACCOUNT);
    vi.mocked(getAccountByUserId).mockReset().mockResolvedValue(null);
    vi.mocked(getBusyHourDays)
        .mockReset()
        .mockResolvedValue([{ utc_hour: 19, days: 5 }]);
    resetArrivalLineClock();
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
});

const sessionFor = (key: string) => sessionHandler.getSession("session_key", key)!;

/** The text of every server chat line waiting in a session's outbox. */
const serverLines = (key: string): string[] =>
    sessionFor(key)
        .data.filter((d: any) => d?.class === ServerClasses.CHAT_MESSAGE && d.username === "[server]")
        .map((d: any) => d.msg);

// The lines are sent after the sign-in reply, without waiting, so let them land first.
async function signIn(steam_id: string) {
    const player = await loginPlayer(steam_id);
    await flushEndgame();
    return player;
}

describe("the player numbers in chat after a sign-in (#337)", () => {
    it("tells the player signing in how many are online and when it is busy", async () => {
        const before = busyHoursSince(Date.now());
        const a = await signIn("9001");
        const after = busyHoursSince(Date.now());

        expect(serverLines(a.session_key)).toEqual(["1 player online. Busiest hours: 19:00 to 20:00 UTC."]);
        // The history asked for starts 28 days back, to the hour. Both ends are taken in case the
        // hour changed while the sign-in ran.
        expect(getBusyHourDays).toHaveBeenCalledTimes(1);
        expect([before, after]).toContain(vi.mocked(getBusyHourDays).mock.calls[0][0]);
    });

    it("names the three busiest hours, in clock order", async () => {
        vi.mocked(getBusyHourDays).mockResolvedValue([
            { utc_hour: 21, days: 3 },
            { utc_hour: 19, days: 9 },
            { utc_hour: 3, days: 1 },
            { utc_hour: 20, days: 7 },
        ]);

        const a = await signIn("9001");

        expect(serverLines(a.session_key)).toEqual(["1 player online. Busiest hours: 19:00 to 22:00 UTC."]);
    });

    it("tells everyone else the new count, including a player in a battle", async () => {
        const a = await signIn("9001");
        const b = await signIn("9002");
        // Gone into a battle before the next player arrives.
        sessionFor(b.session_key).battle_id = "battle-337";
        // As though a minute has passed since B's arrival was announced.
        resetArrivalLineClock();

        await signIn("9003");

        expect(serverLines(b.session_key)).toContain("3 players online now.");
        expect(serverLines(a.session_key)).toContain("3 players online now.");
    });

    it("tells the second player's arrival to the first, although the first sign-in found nobody to tell", async () => {
        // Measured in the game on 2026-10-14: a first sign-in with nobody else online used up the
        // minute, so the arrival that mattered, ten seconds later, was held back.
        const a = await signIn("9001");
        await signIn("9002");

        expect(serverLines(a.session_key)).toContain("2 players online now.");
    });

    it("does not count a game that has crashed as somebody to tell", async () => {
        // A's game stopped asking for messages ten minutes ago. Its session is still on the
        // server's list, which is cleared only after 30 minutes, but nobody is there to read a line.
        const a = await signIn("9001");
        sessionFor(a.session_key).lastPollAt = Date.now() - 10 * 60 * 1000;
        const b = await signIn("9002");
        await signIn("9003");

        // B's sign-in found nobody to tell, so it did not use up the minute: C's arrival reaches B.
        expect(serverLines(b.session_key)).toContain("2 players online now.");
        // And the crashed game was sent nothing after its own sign-in line.
        expect(serverLines(a.session_key)).toEqual(["1 player online. Busiest hours: 19:00 to 20:00 UTC."]);
    });

    it("sends no second line to everyone else within the minute, but still greets the newcomer", async () => {
        const a = await signIn("9001");
        await signIn("9002");
        const c = await signIn("9003");

        expect(serverLines(a.session_key).filter((line) => line.endsWith("online now."))).toEqual([
            "2 players online now.",
        ]);
        expect(serverLines(c.session_key)).toEqual(["3 players online. Busiest hours: 19:00 to 20:00 UTC."]);
    });

    it("never names anyone", async () => {
        const a = await signIn("9001");
        await signIn("9002");

        // Two lines to look at: A's own, and the new count.
        expect(serverLines(a.session_key)).toHaveLength(2);
        for (const line of serverLines(a.session_key)) expect(line).not.toContain("testplayer");
    });

    it("still signs the player in, and still sends the count, when the busy hours cannot be read", async () => {
        vi.mocked(getBusyHourDays).mockRejectedValueOnce(new Error("database is locked"));

        const res = await request(app).post("/services/auth/login/11").send({ steam_id: "9001" });
        await flushEndgame();

        expect(res.status).toBe(200);
        expect(serverLines(res.body.session_key)).toEqual(["1 player online."]);
    });

    it("does the same after a Discord sign-in", async () => {
        const token = sign({ discord_id: "1122976027140956221" }, process.env.JWT_SECRET as string, {
            expiresIn: "1h",
        });

        const res = await request(app).post("/login/discord/session").set("Authorization", `Bearer ${token}`);
        await flushEndgame();

        expect(res.status).toBe(200);
        expect(serverLines(res.body.session_key)).toEqual(["1 player online. Busiest hours: 19:00 to 20:00 UTC."]);
    });
});
