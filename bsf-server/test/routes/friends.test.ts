import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler, reapStaleSessions, SESSION_TTL_MS } from "../../src/services/auth/auth";
import { ServerClasses } from "../../src/const";
import { FRIEND_AVATAR } from "../../src/services/friends";
import { loginPlayer } from "../helpers";

// Same shape as the lobby suite's mock, and for the same reason: a fresh object per
// call so a test that mutates the account row cannot bleed into the next one.
vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockImplementation(async () => ({
        user_id: 123,
        username: "testplayer",
        renown: 100,
        daily_login_streak: 1,
        login_count: 5,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [],
        party_ids_json: [],
    })),
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

const sessionFor = (key: string) => sessionHandler.getSession("session_key", key)!;

/** Every friends-list message currently sitting in a session's outbox. */
const friendsMessages = (session: any) =>
    session.data.filter((d: any) => d?.class === ServerClasses.FRIENDS_DATA);

/** Every presence message currently sitting in a session's outbox. */
const presenceMessages = (session: any) =>
    session.data.filter((d: any) => d?.class === ServerClasses.FRIEND_ONLINE_DATA);

const locationMessages = (session: any) =>
    session.data.filter((d: any) => d?.class === ServerClasses.GAME_LOCATION_DATA);

function postLocation(session_key: string, body: string) {
    return request(app)
        .post(`/services/game/location/${session_key}`)
        .set("Content-Type", "text/plain")
        .send(body);
}

describe("friends list (#91)", () => {
    it("a lone player still gets a friends list, and it is empty", async () => {
        // An empty list is not the same as no list. The game shows "waiting for friend
        // list" until one arrives; the empty one is what releases that screen.
        const a = await loginPlayer("9001");
        const lists = friendsMessages(sessionFor(a.session_key));

        expect(lists).toHaveLength(1);
        expect(lists[0].friends).toEqual([]);
    });

    it("the second player to sign in starts with the first one on their list", async () => {
        const a = await loginPlayer("9001");
        const b = await loginPlayer("9002");

        const lists = friendsMessages(sessionFor(b.session_key));
        expect(lists).toHaveLength(1);
        expect(lists[0].friends).toHaveLength(1);
        // The id has to be the account_id, because the game hands this exact value back
        // as the target of /lobby/invite.
        expect(lists[0].friends[0].id).toBe(sessionFor(a.session_key).account_id);
        expect(lists[0].friends[0].online).toBe(true);
    });

    it("the player already signed in is told about the newcomer, twice over", async () => {
        const a = await loginPlayer("9001");
        const aSession = sessionFor(a.session_key);
        const bAccountId = (await loginPlayer("9002")) && sessionHandler
            .getSessions((s) => s.session_key !== a.session_key)[0].account_id;

        // The list is what puts the name in their copy; the presence message is what
        // repaints the row and prints "has logged in" in chat.
        const lists = friendsMessages(aSession);
        expect(lists).toHaveLength(2);
        expect(lists[1].friends.map((f: any) => f.id)).toEqual([bAccountId]);

        expect(presenceMessages(aSession)).toEqual([
            { class: ServerClasses.FRIEND_ONLINE_DATA, account_id: bAccountId, online: true },
        ]);
    });

    it("nobody ever appears on their own list", async () => {
        const a = await loginPlayer("9001");
        await loginPlayer("9002");
        await loginPlayer("9003");

        const aSession = sessionFor(a.session_key);
        const lists = friendsMessages(aSession);
        // Assert there is something to look through first. Without this the loop below
        // is vacuously true and the test passes with the whole feature deleted.
        expect(lists.length).toBeGreaterThan(0);
        expect(lists.some((l: any) => l.friends.length > 0)).toBe(true);
        for (const list of lists) {
            expect(list.friends.map((f: any) => f.id)).not.toContain(aSession.account_id);
        }
    });

    it("sends the list before the presence message, which is what makes chat announce it", async () => {
        // Order is load-bearing and nothing else guards it. The game prints "<name> has
        // logged in" only if the presence message names somebody already in its copy of
        // the list, so a refactor that swapped these two would silently kill the chat
        // line with every other test still green.
        const a = await loginPlayer("9001");
        const aSession = sessionFor(a.session_key);
        const before = aSession.data.length;
        await loginPlayer("9002");

        const classes = aSession.data
            .slice(before)
            .map((d: any) => d?.class)
            .filter((c: string) => c === ServerClasses.FRIENDS_DATA || c === ServerClasses.FRIEND_ONLINE_DATA);
        expect(classes).toEqual([ServerClasses.FRIENDS_DATA, ServerClasses.FRIEND_ONLINE_DATA]);
    });

    it("signing out greys the player out for everyone else", async () => {
        const a = await loginPlayer("9001");
        const b = await loginPlayer("9002");
        const aSession = sessionFor(a.session_key);
        const bAccountId = sessionFor(b.session_key).account_id;
        const before = presenceMessages(aSession).length;

        await request(app).post(`/services/auth/logout/${b.session_key}`).expect(200);

        expect(presenceMessages(aSession).slice(before)).toEqual([
            { class: ServerClasses.FRIEND_ONLINE_DATA, account_id: bAccountId, online: false },
        ]);
    });

    it("being timed out greys the player out too", async () => {
        // The reaper is the other way a player vanishes. If it did not announce, a
        // crashed client would sit on everyone's screen looking invitable for ever.
        const a = await loginPlayer("9001");
        const b = await loginPlayer("9002");
        const aSession = sessionFor(a.session_key);
        const bSession = sessionFor(b.session_key);
        const bAccountId = bSession.account_id;
        const before = presenceMessages(aSession).length;

        bSession.lastActivity = Date.now() - (SESSION_TTL_MS + 1000);
        reapStaleSessions(Date.now());

        expect(presenceMessages(aSession).slice(before)).toEqual([
            { class: ServerClasses.FRIEND_ONLINE_DATA, account_id: bAccountId, online: false },
        ]);
    });

    it("telling everyone somebody arrived does not keep their sessions alive", async () => {
        // The reaper reads each session's last-seen time, and pushing to a session used
        // to refresh it. Left alone, one sign-in would re-arm the idle timer for every
        // connected player, so a crashed client would never be reaped — and therefore
        // never announced offline, leaving it invitable on every list for ever.
        const a = await loginPlayer("9001");
        const aSession = sessionFor(a.session_key);
        const stale = Date.now() - (SESSION_TTL_MS + 1000);
        aSession.lastActivity = stale;

        await loginPlayer("9002");
        expect(aSession.lastActivity).toBe(stale);

        // And the same during a reaper sweep. Two players are stale (9001 and 9003) and
        // one is not (9002). Reaping the first pushes a departure to the other two — if
        // that counted as activity, 9003 would be skipped on this pass and survive
        // another full timeout. A roomful of dead clients would clear one per cycle.
        const c = await loginPlayer("9003");
        sessionFor(c.session_key).lastActivity = stale;

        reapStaleSessions(Date.now());

        const survivors = sessionHandler.getSessions().map((s) => s.user_id);
        expect(survivors).toEqual([9002]);
    });

    it("never sends an entry that would break the friends screen", async () => {
        // Two guards, and both failure modes are a blank or half-drawn screen with
        // nothing in any log: a missing name throws inside the game's sort, and an empty
        // avatar path throws inside its resource loader part-way down the list.
        const a = await loginPlayer("9001");
        sessionFor(a.session_key).display_name = "   ";
        const b = await loginPlayer("9002");

        const entry = friendsMessages(sessionFor(b.session_key))[0].friends[0];
        expect(entry.display_name).toBe(`Player ${sessionFor(a.session_key).account_id}`);
        // Non-empty is the actual requirement — the game's loader throws on an empty
        // path. Comparing to the constant would pass even if the constant were "".
        expect(entry.avatar64).toBeTruthy();
        expect(entry.avatar32).toBeTruthy();
        expect(entry.avatar64).toBe(FRIEND_AVATAR);
        expect(entry.id).toBeGreaterThan(0);
    });
});

describe("where a player is standing (#91)", () => {
    it("passes on a room the game actually has", async () => {
        const a = await loginPlayer("9001");
        const b = await loginPlayer("9002");
        const aSession = sessionFor(a.session_key);
        const bSession = sessionFor(b.session_key);

        await postLocation(b.session_key, "loc_great_hall").expect(200);

        expect(bSession.location).toBe("loc_great_hall");
        expect(locationMessages(aSession)).toEqual([
            {
                class: ServerClasses.GAME_LOCATION_DATA,
                account_id: bSession.account_id,
                location: "loc_great_hall",
            },
        ]);
    });

    it("accepts anything without complaint, but only forwards rooms it knows", async () => {
        // The game re-sends this request on failure with no attempt limit, so answering
        // anything but 200 would turn one bad request into a permanent loop.
        const a = await loginPlayer("9001");
        const b = await loginPlayer("9002");
        const aSession = sessionFor(a.session_key);

        await postLocation(b.session_key, "loc_somewhere_invented").expect(200);
        await postLocation(b.session_key, "").expect(200);
        await request(app)
            .post(`/services/game/location/${b.session_key}`)
            .set("Content-Type", "application/json")
            .send({ not: "a room" })
            .expect(200);

        expect(locationMessages(aSession)).toEqual([]);
        expect(sessionFor(b.session_key).location).toBe("");
    });

    it("survives a request that carries no session at all", async () => {
        // `/services/game/location/11` clears the gate on the login-bypass sentinel with
        // nothing attached. The handler replies first and inspects afterwards, so an
        // unguarded dereference here would throw after the response had already gone out
        // and take the connection with it.
        const a = await loginPlayer("9001");
        const aSession = sessionFor(a.session_key);

        await request(app)
            .post("/services/game/location/11")
            .set("Content-Type", "text/plain")
            .send("loc_great_hall")
            .expect(200);

        expect(locationMessages(aSession)).toEqual([]);
    });

    it("does not repeat itself when the player has not moved", async () => {
        const a = await loginPlayer("9001");
        const b = await loginPlayer("9002");
        const aSession = sessionFor(a.session_key);

        await postLocation(b.session_key, "loc_friend_lobby").expect(200);
        await postLocation(b.session_key, "loc_friend_lobby").expect(200);

        expect(locationMessages(aSession)).toHaveLength(1);
    });
});
