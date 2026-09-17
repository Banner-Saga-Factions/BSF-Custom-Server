import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { sign } from "jsonwebtoken";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { battleHandler } from "../../src/services/battle/Battle";
import { expireStaleSearches, gameQueue } from "../../src/services/queue";
import { getAccountByUserId, upsertAccount } from "../../src/db/account";
import {
    recordQueueJoin,
    recordSearchesMatched,
    recordSearchTimeout,
    recordSignIn,
} from "../../src/services/activityStats";
import { loginPlayer } from "../helpers";

// What the sign-in and queue code REPORTS to the activity counters (#267), and when. How the
// counting works is tested in src/services/activityStats.test.ts, and against a real database in
// src/db/activity.integration.test.ts, so here the four recorders are stand-ins that remember
// their calls.
vi.mock("../../src/services/activityStats", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/services/activityStats")>()),
    recordSignIn: vi.fn().mockResolvedValue(undefined),
    recordQueueJoin: vi.fn().mockResolvedValue(undefined),
    recordSearchesMatched: vi.fn().mockResolvedValue(undefined),
    recordSearchTimeout: vi.fn().mockResolvedValue(undefined),
}));

// Only the two account reads sign-in makes are replaced, and the rest of the module stays real, so
// a function added to db/account later cannot go missing from this file the way it would from a
// hand-written list.
vi.mock("../../src/db/account", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/db/account")>()),
    upsertAccount: vi.fn(),
    getAccountByUserId: vi.fn(),
}));

// Every player gets the same party, so any two of them are an even match for the matchmaker.
const ACCOUNT = {
    user_id: 123,
    username: "testplayer",
    renown: 100,
    daily_login_streak: 1,
    login_count: 5,
    completed_tutorial: true,
    roster_rows: 2,
    roster_json: [
        { id: "unit1", entityClass: "Archer", stats: [{ stat: "RANK", value: 1 }] },
        { id: "unit2", entityClass: "Warrior", stats: [{ stat: "RANK", value: 2 }] },
    ],
    party_ids_json: ["unit1", "unit2"],
};

beforeEach(() => {
    vi.mocked(upsertAccount).mockReset().mockResolvedValue(ACCOUNT);
    vi.mocked(getAccountByUserId).mockReset().mockResolvedValue(null);
    vi.mocked(recordSignIn).mockClear();
    vi.mocked(recordQueueJoin).mockClear();
    vi.mocked(recordSearchesMatched).mockClear();
    vi.mocked(recordSearchTimeout).mockClear();
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
    battleHandler.getBattles().forEach((b) => battleHandler.removeBattle(b.battle_id));
    gameQueue.length = 0;
});

function startSearch(session_key: string, body: object) {
    return request(app).post(`/services/vs/start/${session_key}`).send({ match_handle: 1, ...body });
}

function discordToken(discord_id: string): string {
    return sign({ discord_id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
}

describe("counting sign-ins", () => {
    it("counts a Steam sign-in once, under the exact provider id string", async () => {
        // Above 2^53, where the number form of the id has already lost its last digits.
        const res = await request(app).post("/services/auth/login/11").send({ steam_id: "76561197960265999" });

        expect(res.status).toBe(200);
        expect(recordSignIn).toHaveBeenCalledTimes(1);
        expect(recordSignIn).toHaveBeenCalledWith("76561197960265999");
    });

    it("counts nothing when a Steam sign-in cannot save the account", async () => {
        vi.mocked(upsertAccount).mockRejectedValueOnce(new Error("database is locked"));

        const res = await request(app).post("/services/auth/login/11").send({ steam_id: "731" });

        expect(res.status).toBe(500);
        expect(recordSignIn).not.toHaveBeenCalled();
    });

    it("counts a Discord sign-in once, under the exact Snowflake string", async () => {
        const snowflake = "1122976027140956221";

        const res = await request(app)
            .post("/login/discord/session")
            .set("Authorization", `Bearer ${discordToken(snowflake)}`);

        expect(res.status).toBe(200);
        expect(recordSignIn).toHaveBeenCalledTimes(1);
        expect(recordSignIn).toHaveBeenCalledWith(snowflake);
    });

    it("counts nothing when a Discord sign-in cannot read the account", async () => {
        vi.mocked(getAccountByUserId).mockRejectedValueOnce(new Error("database is locked"));

        const res = await request(app)
            .post("/login/discord/session")
            .set("Authorization", `Bearer ${discordToken("1122976027140956221")}`);

        expect(res.status).toBe(500);
        expect(recordSignIn).not.toHaveBeenCalled();
    });
});

describe("counting searches that join the queue", () => {
    it("reports a Find Match search as one that named no opponent", async () => {
        const { session_key } = await loginPlayer("701");

        const res = await startSearch(session_key, { vs_type: "QUICK" });

        expect(res.status).toBe(200);
        expect(recordQueueJoin).toHaveBeenCalledTimes(1);
        expect(recordQueueJoin).toHaveBeenCalledWith(false);
    });

    it("reports a friend challenge as one that named an opponent", async () => {
        const { session_key } = await loginPlayer("702");

        const res = await startSearch(session_key, { vs_type: "FRIEND", forcematch: 999 });

        expect(res.status).toBe(200);
        expect(recordQueueJoin).toHaveBeenCalledTimes(1);
        expect(recordQueueJoin).toHaveBeenCalledWith(true);
    });

    it("counts nothing for a search the queue turns away", async () => {
        const waiting = await loginPlayer("703");
        expect((await startSearch(waiting.session_key, { vs_type: "QUICK" })).status).toBe(200);
        vi.mocked(recordQueueJoin).mockClear();

        const duplicate = await startSearch(waiting.session_key, { vs_type: "QUICK" });
        const unknownMode = await startSearch((await loginPlayer("704")).session_key, { vs_type: "NOT_A_MODE" });
        const self = await loginPlayer("705");
        const playYourself = await startSearch(self.session_key, { vs_type: "FRIEND", forcematch: self.user_id });

        expect([duplicate.status, unknownMode.status, playYourself.status]).toEqual([409, 400, 400]);
        expect(recordQueueJoin).not.toHaveBeenCalled();
    });
});

describe("counting searches that become a battle", () => {
    it("reports two Find Match searches that become a battle exactly once, and a lone search never", async () => {
        const first = await loginPlayer("711");
        const second = await loginPlayer("712");

        await startSearch(first.session_key, { vs_type: "QUICK" });
        expect(recordSearchesMatched).not.toHaveBeenCalled();

        await startSearch(second.session_key, { vs_type: "QUICK" });

        expect(gameQueue).toHaveLength(0); // a battle really was made
        expect(recordSearchesMatched).toHaveBeenCalledTimes(1);
        expect(recordSearchesMatched).toHaveBeenCalledWith([false, false]);
    });

    it("reports a friend pair who named each other as two challenges", async () => {
        const first = await loginPlayer("713");
        const second = await loginPlayer("714");

        await startSearch(first.session_key, { vs_type: "FRIEND", forcematch: second.user_id });
        await startSearch(second.session_key, { vs_type: "FRIEND", forcematch: first.user_id });

        expect(gameQueue).toHaveLength(0);
        expect(recordSearchesMatched).toHaveBeenCalledTimes(1);
        expect(recordSearchesMatched).toHaveBeenCalledWith([true, true]);
    });

    it("files each side by its own search when a challenger is paired with someone in the open queue", async () => {
        // The queue honours a named opponent even when that opponent named nobody (#208), so one
        // battle can join a challenge to a Find Match search.
        const searching = await loginPlayer("715");
        const challenger = await loginPlayer("716");

        await startSearch(searching.session_key, { vs_type: "QUICK" });
        await startSearch(challenger.session_key, { vs_type: "QUICK", forcematch: searching.user_id });

        expect(gameQueue).toHaveLength(0);
        expect(recordSearchesMatched).toHaveBeenCalledTimes(1);
        const [sides] = vi.mocked(recordSearchesMatched).mock.calls[0];
        expect([...sides].sort()).toEqual([false, true]);
    });

    it("reports a battle made by the fallback matchmaker the same way", async () => {
        process.env.BSF_MATCHMAKER_LEGACY = "true";
        try {
            const first = await loginPlayer("717");
            const second = await loginPlayer("718");

            await startSearch(first.session_key, { vs_type: "QUICK" });
            await startSearch(second.session_key, { vs_type: "QUICK" });

            expect(gameQueue).toHaveLength(0);
            expect(recordSearchesMatched).toHaveBeenCalledTimes(1);
            expect(recordSearchesMatched).toHaveBeenCalledWith([false, false]);
        } finally {
            delete process.env.BSF_MATCHMAKER_LEGACY;
        }
    });
});

describe("counting searches the queue drops", () => {
    it("counts each search the five-minute timeout drops, once, and none that it keeps", async () => {
        const stale = await loginPlayer("721");
        const fresh = await loginPlayer("722");
        // Each names an account that is not signed in, so the two can never be paired with each other.
        await startSearch(stale.session_key, { vs_type: "FRIEND", forcematch: 998 });
        await startSearch(fresh.session_key, { vs_type: "FRIEND", forcematch: 999 });
        expect(gameQueue).toHaveLength(2);

        const now = Date.now();
        gameQueue.find((item) => item.session_key === stale.session_key)!.queuedAt = new Date(now - 5 * 60 * 1000 - 1);

        expireStaleSearches(now);

        expect(gameQueue.map((item) => item.session_key)).toEqual([fresh.session_key]);
        expect(recordSearchTimeout).toHaveBeenCalledTimes(1);
        expect(recordSearchTimeout).toHaveBeenCalledWith(now);
    });
});
