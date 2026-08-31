import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler, reapStaleSessions, SESSION_TTL_MS } from "../../src/services/auth/auth";
import { _resetLobbiesForTest, _getLobbyForTest } from "../../src/services/lobby";
import { loginPlayer } from "../helpers";

vi.mock("../../src/db/account", () => ({
    // Fresh object per call — mutations in one test must not bleed into the next.
    // (Pre-#71 this was mockResolvedValue, which returned a single shared object;
    // a test that mutated party_ids_json broke a later test asserting the default.)
    upsertAccount: vi.fn().mockImplementation(async () => ({
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
    _resetLobbiesForTest();
});

// Two test players: a (owner) and b (invitee). Their account_ids are
// derived from the Steam IDs we pass to loginPlayer. Login response returns
// the 32-bit account_id as user_id (server-side it's session.account_id).
async function loginTwo() {
    const a = await loginPlayer("9001");
    const b = await loginPlayer("9002");
    const aSession = sessionHandler.getSession("session_key", a.session_key)!;
    const bSession = sessionHandler.getSession("session_key", b.session_key)!;
    return { a, b, aSession, bSession };
}

// Wire-format helper. The AS3 client sends text/plain for any String body
// (HttpRequest.as:67-69), and LobbyTxn passes `arg.toString()` as the body
// — so production integer-body requests come in as text/plain with a
// stringified number. We mirror that here so the test exercises the same
// parse path the real client hits.
function postRaw(url: string, body: string) {
    return request(app)
        .post(url)
        .set("Content-Type", "text/plain")
        .send(body);
}

// Variant for object bodies that production also sends as text/plain
// (LobbyInviteTxn / LobbyOptionsTxn pass `JSON.stringify(options)` — a
// String, so HttpRequest.as still tags it as text/plain). The handler
// must JSON.parse this through readBody().
function postJsonAsText(url: string, body: any) {
    return request(app)
        .post(url)
        .set("Content-Type", "text/plain")
        .send(JSON.stringify(body));
}

function lastPushOfType(session: any, type: string): any | undefined {
    for (let i = session.data.length - 1; i >= 0; i--) {
        if (session.data[i]?.type === type) return session.data[i];
    }
    return undefined;
}

describe("POST /services/lobby/invite", () => {
    it("creates a lobby when the owner has none and pushes INVITE + PARTY to both", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        const res = await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({
                lobby_id: ownerId,
                account_id: bSession.account_id,
                account_display_name: bSession.display_name,
                display_name: "Test lobby",
                scene: "mead_house",
                timer: 45,
                msg: "hi",
            });

        expect(res.status).toBe(200);

        const lobby = _getLobbyForTest(ownerId);
        expect(lobby).toBeDefined();
        expect(lobby!.members.size).toBe(2);
        expect(lobby!.members.get(ownerId)?.joined).toBe(true);
        expect(lobby!.members.get(bSession.account_id)?.joined).toBe(false);
        expect(lobby!.display_name).toBe("Test lobby");
        expect(lobby!.timer).toBe(45);

        const aInvite = lastPushOfType(aSession, "INVITE");
        const bInvite = lastPushOfType(bSession, "INVITE");
        expect(aInvite).toBeDefined();
        expect(bInvite).toBeDefined();
        expect(aInvite.class).toBe("tbs.srv.data.LobbyOptionsData");
        expect(aInvite.lobby_id).toBe(ownerId);
        expect(aInvite.scene).toBe("mead_house");

        const aParty = lastPushOfType(aSession, "PARTY");
        const bParty = lastPushOfType(bSession, "PARTY");
        expect(aParty).toBeDefined();
        expect(bParty).toBeDefined();
        expect(aParty.class).toBe("tbs.srv.data.LobbyPartyData");
        // Party comes from the owner's roster filtered by their party_ids.
        expect(aParty.party.map((u: any) => u.id)).toEqual(["unit1", "unit2"]);
    });

    it("PARTY push preserves party_ids_json order, not roster order (issue #71)", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        // Roster is [unit1, unit2] but the player arranged the party in the
        // opposite order. Pre-fix, the PARTY push iterated the roster and
        // emitted [unit1, unit2] regardless of arrangement.
        aSession.accountData!.party_ids_json = ["unit2", "unit1"];

        const res = await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({
                lobby_id: ownerId,
                account_id: bSession.account_id,
                display_name: "L",
                scene: "s",
                timer: 30,
            });
        expect(res.status).toBe(200);

        const aParty = lastPushOfType(aSession, "PARTY");
        expect(aParty.party.map((u: any) => u.id)).toEqual(["unit2", "unit1"]);
    });

    it("silently drops a second invite (Java's 1-invitee-max rule)", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const c = await loginPlayer("9003");
        const cSession = sessionHandler.getSession("session_key", c.session_key)!;
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });

        const cDataBefore = cSession.data.length;
        const res = await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: cSession.account_id, display_name: "L", scene: "s", timer: 30 });

        expect(res.status).toBe(200);
        // Lobby still has only owner + first invitee, not c.
        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.members.has(cSession.account_id)).toBe(false);
        // The would-be second invitee got no INVITE push.
        expect(cSession.data.length).toBe(cDataBefore);
    });

    it("returns 400 for a body that is missing required fields", async () => {
        const { a } = await loginTwo();
        const res = await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({});
        expect(res.status).toBe(400);
    });

    it("returns 400 when the caller invites themselves", async () => {
        // Without this guard the owner's `members` entry gets overwritten
        // with `joined: false, ready: false` and they can no longer ready
        // up — small self-DoS. The 1-invitee cap doesn't catch this
        // because the owner is excluded from the cap's filter.
        const { a, aSession } = await loginTwo();
        const res = await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({
                lobby_id: aSession.account_id,
                account_id: aSession.account_id,           // self-invite
                display_name: "L", scene: "s", timer: 30,
            });
        expect(res.status).toBe(400);
        const owner = _getLobbyForTest(aSession.account_id)?.members.get(aSession.account_id);
        // If the lobby was created at all, the owner should still be joined.
        // (Current implementation no-ops before the lobby is touched.)
        if (owner) expect(owner.joined).toBe(true);
    });

    it("returns 403 when lobby_id is not the caller's own account_id", async () => {
        // Deliberate divergence from Java: the caller may only invite into
        // their OWN lobby. This blocks the "I'll claim victim's account_id
        // as my lobby_id" attack from a hostile/modified client.
        const { a, b, aSession, bSession } = await loginTwo();
        const res = await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({
                lobby_id: bSession.account_id,            // victim's id, not caller's
                account_id: aSession.account_id,
                display_name: "L", scene: "s", timer: 30,
            });
        expect(res.status).toBe(403);
        expect(_getLobbyForTest(bSession.account_id)).toBeUndefined();
    });

    it("accepts the production wire format (text/plain with a JSON-stringified body)", async () => {
        // AS3 LobbyInviteTxn sends JSON.stringify(options) as a String —
        // HttpRequest.as:67-69 stamps Content-Type: text/plain. Verify the
        // express.text middleware + readBody path produces the same result
        // as the application/json path the other invite tests use.
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        const res = await postJsonAsText(`/services/lobby/invite/${a.session_key}`, {
            lobby_id: ownerId,
            account_id: bSession.account_id,
            account_display_name: bSession.display_name,
            display_name: "L", scene: "s", timer: 30,
        });

        expect(res.status).toBe(200);
        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.members.size).toBe(2);
        expect(lobby.members.has(bSession.account_id)).toBe(true);
    });
});

describe("POST /services/lobby/join", () => {
    it("flips invitee to joined and pushes JOIN then PARTY to both members", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });

        const aLenBefore = aSession.data.length;
        const bLenBefore = bSession.data.length;

        const res = await postRaw(`/services/lobby/join/${b.session_key}`, String(ownerId));
        expect(res.status).toBe(200);

        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.members.get(bSession.account_id)?.joined).toBe(true);

        // Two new pushes per side: JOIN (party=null) then PARTY (party=defs).
        const aNew = aSession.data.slice(aLenBefore);
        const bNew = bSession.data.slice(bLenBefore);
        expect(aNew.map((d: any) => d.type)).toEqual(["JOIN", "PARTY"]);
        expect(bNew.map((d: any) => d.type)).toEqual(["JOIN", "PARTY"]);
        expect(aNew[0].party).toBeNull();
        expect(aNew[1].party.map((u: any) => u.id)).toEqual(["unit1", "unit2"]);
    });

    // The codes matter as much as the refusals. The game client re-sends a
    // 404 forever with no attempt cap, and every lobby route opts into
    // re-sending — so answering 404 here left clients hammering a room that
    // no longer exists. 403 and 409 are not re-sent. See docs/client-contract.md
    // -> R23 before changing either number.
    it("answers 409 (a code the client does not re-send) when the lobby does not exist", async () => {
        const { a } = await loginTwo();
        const res = await postRaw(`/services/lobby/join/${a.session_key}`, "99999999");
        expect(res.status).toBe(409);
    });

    it("answers 403 (a code the client does not re-send) when the caller was not invited", async () => {
        const { a, b, aSession } = await loginTwo();
        const c = await loginPlayer("9004");
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({
                lobby_id: ownerId,
                account_id: sessionHandler.getSession("session_key", b.session_key)!.account_id,
                display_name: "L", scene: "s", timer: 30,
            });

        const res = await postRaw(`/services/lobby/join/${c.session_key}`, String(ownerId));
        expect(res.status).toBe(403);
    });
});

describe("POST /services/lobby/decline", () => {
    it("removes the caller from the lobby and pushes DECLINE to the owner", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });

        const aLenBefore = aSession.data.length;
        const res = await postRaw(`/services/lobby/decline/${b.session_key}`, String(ownerId));
        expect(res.status).toBe(200);

        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.members.has(bSession.account_id)).toBe(false);

        const aNew = aSession.data.slice(aLenBefore);
        const decline = aNew.find((d: any) => d.type === "DECLINE");
        expect(decline).toBeDefined();
        expect(decline.account_id).toBe(bSession.account_id);
    });
});

describe("POST /services/lobby/uninvite", () => {
    it("removes the invitee but does NOT push to them (faithful to Java)", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });

        const bLenBefore = bSession.data.length;
        const aLenBefore = aSession.data.length;

        const res = await postRaw(`/services/lobby/uninvite/${a.session_key}`, String(bSession.account_id));
        expect(res.status).toBe(200);

        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.members.has(bSession.account_id)).toBe(false);

        // Owner gets UNINVITE; kicked invitee gets nothing new.
        const aNew = aSession.data.slice(aLenBefore);
        expect(aNew.some((d: any) => d.type === "UNINVITE")).toBe(true);
        expect(bSession.data.length).toBe(bLenBefore);
    });
});

describe("POST /services/lobby/exit", () => {
    it("as member: removes self and pushes EXIT to the owner", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });

        const aLenBefore = aSession.data.length;
        await postRaw(`/services/lobby/exit/${b.session_key}`, String(ownerId));

        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby).toBeDefined();
        expect(lobby.members.has(bSession.account_id)).toBe(false);

        const aNew = aSession.data.slice(aLenBefore);
        const exitMsg = aNew.find((d: any) => d.type === "EXIT");
        expect(exitMsg).toBeDefined();
        expect(exitMsg.account_id).toBe(bSession.account_id);
    });

    it("as owner: pushes TERMINATED to everyone and deletes the lobby", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });

        const bLenBefore = bSession.data.length;
        const aLenBefore = aSession.data.length;
        await postRaw(`/services/lobby/exit/${a.session_key}`, String(ownerId));

        expect(_getLobbyForTest(ownerId)).toBeUndefined();

        const aTerm = aSession.data.slice(aLenBefore).find((d: any) => d.type === "TERMINATED");
        const bTerm = bSession.data.slice(bLenBefore).find((d: any) => d.type === "TERMINATED");
        expect(aTerm).toBeDefined();
        expect(bTerm).toBeDefined();
        expect(aTerm.account_id).toBe(0);
        expect(aTerm.account_display_name).toBe(aSession.display_name);
    });
});

describe("POST /services/lobby/options", () => {
    it("updates lobby metadata and pushes OPTIONS to all members", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "Old", scene: "old", timer: 30 });

        const aLenBefore = aSession.data.length;
        const bLenBefore = bSession.data.length;

        const res = await request(app)
            .post(`/services/lobby/options/${a.session_key}`)
            .send({
                lobby_id: ownerId,
                account_id: ownerId,
                display_name: "New",
                scene: "new",
                timer: 60,
                msg: "updated",
            });
        expect(res.status).toBe(200);

        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.display_name).toBe("New");
        expect(lobby.scene).toBe("new");
        expect(lobby.timer).toBe(60);
        expect(lobby.msg).toBe("updated");

        const aOpts = aSession.data.slice(aLenBefore).find((d: any) => d.type === "OPTIONS");
        const bOpts = bSession.data.slice(bLenBefore).find((d: any) => d.type === "OPTIONS");
        expect(aOpts).toBeDefined();
        expect(bOpts).toBeDefined();
        expect(aOpts.timer).toBe(60);
    });

    // #213 — both players' screens offer the map and turn-length buttons, so the invited
    // player's clicks used to be refused and thrown away while their own screen applied
    // them anyway, leaving the two sides looking at different settings. The last person to
    // click now decides, and the other screen follows: the game replaces its copy of the
    // settings wholesale on this message and clears its own ready toggle.
    it("lets the invited player change the settings, and tells the owner", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "old", timer: 30 });
        await postRaw(`/services/lobby/join/${b.session_key}`, String(ownerId));

        const aLenBefore = aSession.data.length;

        const res = await request(app)
            .post(`/services/lobby/options/${b.session_key}`)          // the INVITED player
            .send({ lobby_id: ownerId, display_name: "L", scene: "new", timer: 0 });

        expect(res.status).toBe(200);
        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.timer).toBe(0);
        expect(lobby.scene).toBe("new");

        // The owner has to be told, or their screen keeps showing the old choice.
        const aOpts = aSession.data.slice(aLenBefore).find((d: any) => d.type === "OPTIONS");
        expect(aOpts).toBeDefined();
        expect(aOpts.timer).toBe(0);
    });

    // The narrowed half of a deliberate divergence from Java, which accepted this from
    // ANY session: a stranger must not be able to rewrite a room they are not in.
    it("returns 403 when somebody outside the lobby tries to change its settings", async () => {
        const { a, aSession, bSession } = await loginTwo();
        const outsider = await loginPlayer("9003");
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "Old", scene: "old", timer: 30 });

        const res = await request(app)
            .post(`/services/lobby/options/${outsider.session_key}`)
            .send({ lobby_id: ownerId, display_name: "Hijacked", scene: "evil", timer: 99 });

        expect(res.status).toBe(403);
        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.display_name).toBe("Old");
        expect(lobby.timer).toBe(30);
    });
});

describe("POST /services/lobby/ready and /unready", () => {
    it("ready flips the member flag and pushes READY", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });
        await postRaw(`/services/lobby/join/${b.session_key}`, String(ownerId));

        const aLenBefore = aSession.data.length;
        const bLenBefore = bSession.data.length;

        const res = await postRaw(`/services/lobby/ready/${b.session_key}`, String(ownerId));
        expect(res.status).toBe(200);

        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.members.get(bSession.account_id)?.ready).toBe(true);
        expect(aSession.data.slice(aLenBefore).find((d: any) => d.type === "READY")).toBeDefined();
        expect(bSession.data.slice(bLenBefore).find((d: any) => d.type === "READY")).toBeDefined();
    });

    it("unready flips the flag back and pushes UNREADY", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: bSession.account_id, display_name: "L", scene: "s", timer: 30 });
        await postRaw(`/services/lobby/join/${b.session_key}`, String(ownerId));
        await postRaw(`/services/lobby/ready/${b.session_key}`, String(ownerId));

        const res = await postRaw(`/services/lobby/unready/${b.session_key}`, String(ownerId));
        expect(res.status).toBe(200);

        const lobby = _getLobbyForTest(ownerId)!;
        expect(lobby.members.get(bSession.account_id)?.ready).toBe(false);
    });

    it("returns 400 for an unparseable body", async () => {
        const { a } = await loginTwo();
        const res = await postRaw(`/services/lobby/unready/${a.session_key}`, "not-a-number");
        expect(res.status).toBe(400);
    });
});

describe("Session lifecycle integration", () => {
    it("logging out the owner terminates the lobby and notifies the invitee", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;
        const inviteeId = bSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: inviteeId, display_name: "L", scene: "s", timer: 30 });

        const bLenBefore = bSession.data.length;
        await request(app).post(`/services/auth/logout/${a.session_key}`);

        expect(_getLobbyForTest(ownerId)).toBeUndefined();
        const bTerm = bSession.data.slice(bLenBefore).find((d: any) => d.type === "TERMINATED");
        expect(bTerm).toBeDefined();
        expect(bTerm.lobby_id).toBe(ownerId);
    });

    it("reaping a stale owner session terminates the lobby", async () => {
        const { a, b, aSession, bSession } = await loginTwo();
        const ownerId = aSession.account_id;
        const inviteeId = bSession.account_id;

        await request(app)
            .post(`/services/lobby/invite/${a.session_key}`)
            .send({ lobby_id: ownerId, account_id: inviteeId, display_name: "L", scene: "s", timer: 30 });

        // Force the owner past the TTL so the reaper evicts them.
        aSession.lastActivity = Date.now() - (SESSION_TTL_MS + 1000);
        const bLenBefore = bSession.data.length;
        reapStaleSessions(Date.now());

        expect(_getLobbyForTest(ownerId)).toBeUndefined();
        const bTerm = bSession.data.slice(bLenBefore).find((d: any) => d.type === "TERMINATED");
        expect(bTerm).toBeDefined();
    });
});
