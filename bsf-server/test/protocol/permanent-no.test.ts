import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { gameQueue } from "../../src/services/queue";
import { battleHandler } from "../../src/services/battle/Battle";
import { _resetLobbiesForTest } from "../../src/services/lobby";
import { loginPlayer } from "../helpers";
import { listRoutes, routeName } from "./routeTable";

// THE RULE: a refusal that a second attempt cannot change must never be answered with 404 or
// with 500-and-above.
//
// The game re-sends a failed request by itself, every one to two seconds, with no limit on the
// number of attempts, whenever the answer is "no answer", 404, or 500 and above -- for each kind
// of request that asks to be re-sent. Thirty routes ask. So a refusal that can never turn into a
// yes, answered with one of those codes, is repeated for as long as the game stays open (#164).
// Why, and what to answer instead: docs/client-contract.md -> R10.
//
// This file sends each of those thirty routes the refusals a retry cannot change -- nothing in
// the body, the wrong kind of value in every field, ids that do not exist, a battle or a lobby
// the player is not part of -- and checks the code that comes back.
//
// NOT covered, on purpose:
//   - A database failure. The handlers answer 500 for that and it is right: trying again may work.
//   - Rename and stat reset. They answer 404 for an unknown unit, and the game never re-sends them.

// upsertAccount gives each player their own account, from the id they sign in with.
vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockImplementation(async (steam_id: string) => ({
        user_id: Number(steam_id),
        username: `player_${steam_id}`,
        renown: 1000,
        daily_login_streak: 1,
        login_count: 5,
        completed_tutorial: true,
        roster_rows: 2,
        roster_json: [
            { id: "unit1", entityClass: "archer", name: "Iver", stats: [{ stat: "RANK", value: 1 }] },
            { id: "unit2", entityClass: "warrior", name: "Rook", stats: [{ stat: "RANK", value: 2 }] },
        ],
        party_ids_json: ["unit1", "unit2"],
    })),
    addRenown: vi.fn().mockResolvedValue(undefined),
    saveParty: vi.fn().mockResolvedValue(undefined),
    saveRoster: vi.fn().mockResolvedValue(undefined),
    saveRosterAndSpendRenown: vi.fn().mockResolvedValue(undefined),
    saveRosterAndParty: vi.fn().mockResolvedValue(undefined),
    saveRosterAndAddRenown: vi.fn().mockResolvedValue(undefined),
    expandBarracks: vi.fn().mockResolvedValue(true),
    getAccountByUserId: vi.fn().mockResolvedValue(null),
    getAccountById: vi.fn().mockResolvedValue(null),
    parseRow: vi.fn(),
    MAX_ROSTER_ROWS: 8,
    UNITS_PER_ROW: 9,
}));

beforeEach(() => {
    sessionHandler.getSessions().forEach((s) => sessionHandler.removeSession(s.session_key));
    gameQueue.length = 0;
    battleHandler.getBattles().forEach((b) => battleHandler.removeBattle(b.battle_id));
    _resetLobbiesForTest();
});

// ---------------------------------------------------------------------------------------------
// Every /services route, and whether the game re-sends it. `true` rows are the thirty, read from
// the game itself: each request class that sets `resendOnFail = true`, and the addresses those
// classes are built with (bsf-client/docs/mod-bridge.md -> "The HTTP tap" has the list).
//
// A new route fails the first test below until it has a row here. That is the point: whoever adds
// it has to find out whether the game re-sends it, and cannot skip the question by not knowing
// it exists.
// ---------------------------------------------------------------------------------------------
const RESENT_BY_THE_GAME = new Map<string, boolean>([
    ["POST /services/auth/login/:httpVersion", false],
    ["POST /services/auth/logout/:session_key", false],
    // Chat has a re-send of its own that ignores the code; the route answers 200 on its first line.
    ["POST /services/chat/:room/:session_key", false],
    ["POST /services/game/leaderboards/:session_key", true],
    ["GET /services/game/:session_key", false],
    ["POST /services/game/location/:session_key", true],
    ["POST /services/vs/start/:session_key", true],
    ["POST /services/vs/cancel/:session_key", false],
    ["POST /services/battle/ready/:session_key", true],
    ["POST /services/battle/deploy/:session_key", true],
    ["POST /services/battle/sync/:session_key", true],
    ["POST /services/battle/query/:session_key", true],
    ["POST /services/battle/move/:session_key", true],
    ["POST /services/battle/action/:session_key", true],
    ["POST /services/battle/killed/:session_key", true],
    ["POST /services/battle/exit/:session_key", true],
    ["POST /services/battle/surrender/:session_key", true],
    ["GET /services/download", false],
    ["GET /services/download/checksum", false],
    ["GET /services/account/info/:session_key?", false],
    ["POST /services/account/tutorial/:session_key", false],
    ["POST /services/roster/party/arrange/:session_key?", true],
    ["POST /services/roster/unit/promote/:session_key?", true],
    ["POST /services/roster/unit/rename/:session_key?", false],
    ["POST /services/roster/unit/retire/:session_key?", true],
    ["POST /services/roster/unit/hire/:session_key?", true],
    ["POST /services/roster/unit/stats/purchase/:session_key?", true],
    ["POST /services/roster/unit/stats/reset/:session_key?", false],
    ["POST /services/roster/unlock/:session_key?", true],
    ["POST /services/roster/unit/variation/:session_key/:unit_id/:variation/:lobby_id", true],
    ["POST /services/lobby/invite/:session_key", true],
    ["POST /services/lobby/uninvite/:session_key", true],
    ["POST /services/lobby/exit/:session_key", true],
    ["POST /services/lobby/join/:session_key", true],
    ["POST /services/lobby/decline/:session_key", true],
    ["POST /services/lobby/options/:session_key", true],
    ["POST /services/lobby/ready/:session_key", true],
    ["POST /services/lobby/unready/:session_key", true],
]);

// The game also re-sends three addresses that are not routes of ours: two we have not built, and
// the Steam overlay notice, which the session gate answers itself.
const RESENT_WITHOUT_A_ROUTE = 3;

// ---------------------------------------------------------------------------------------------
// The refusals. Each is something a second attempt cannot change.
// ---------------------------------------------------------------------------------------------

// The wrong kind of value in every field any of these routes reads.
const WRONG_KINDS = {
    battle_id: 12345,
    unit_id: 12345,
    name: 12345,
    class_id: 12345,
    party: "not-a-list",
    purchasable_unit_id: { no: "thing" },
    new_unit_id: ["not", "text"],
    new_unit_name: { no: "thing" },
    stats: "not-a-list",
    deltas: "not-a-list",
    vs_type: 7,
    forcematch: "nobody",
    scene: 5,
    timer: "soon",
    match_handle: "x",
    tourney_id: "x",
    board_ids: "not-a-list",
    entity: 5,
    turn: "x",
    ordinal: "x",
    killedparty: "x",
    killerparty: "x",
    killer: 5,
    tiles: "not-a-list",
    action: 5,
    target_ids: "not-a-list",
    hash: {},
    lobby_id: { no: "thing" },
    account_id: "nobody",
    msg: 5,
};

// The right kinds of value, naming things that do not exist.
const UNKNOWN_THINGS = {
    battle_id: "no-such-battle",
    unit_id: "no-such-unit",
    name: "Nobody",
    class_id: "no-such-class",
    party: ["no-such-unit"],
    purchasable_unit_id: "no-such-class",
    new_unit_id: "nothing_0",
    new_unit_name: "Nobody",
    stats: ["NO_SUCH_STAT"],
    deltas: [1],
    vs_type: "NO_SUCH_MODE",
    forcematch: 999999,
    entity: "999999+0+no-such-unit",
    turn: 99,
    ordinal: 99,
    killedparty: 999999,
    killerparty: 999999,
    killer: "no-such-unit",
    tiles: [],
    lobby_id: 999999,
    account_id: 999999,
};

interface Refusal {
    why: string;
    body: unknown;
    /** The game sends every lobby request as text; see the note above LobbyRouter in lobby.ts. */
    asText?: boolean;
}

const JSON_REFUSALS: Refusal[] = [
    { why: "nothing in the body", body: {} },
    { why: "the wrong kind of value in every field", body: WRONG_KINDS },
    { why: "ids that do not exist", body: UNKNOWN_THINGS },
];

const LOBBY_REFUSALS: Refusal[] = [
    { why: "an empty body", body: "", asText: true },
    { why: "a body that is not a number", body: "not-a-number", asText: true },
    { why: "a lobby that does not exist", body: "999999", asText: true },
    { why: "options for a lobby that does not exist", body: JSON.stringify(UNKNOWN_THINGS), asText: true },
    { why: "the wrong kind of value in every field", body: JSON.stringify(WRONG_KINDS), asText: true },
];

const resent = [...RESENT_BY_THE_GAME].filter(([, resends]) => resends).map(([name]) => name);

function refusalsFor(name: string): Refusal[] {
    return name.includes("/services/lobby/") ? LOBBY_REFUSALS : JSON_REFUSALS;
}

// One row per route per refusal.
const ROWS = resent.flatMap((name) => refusalsFor(name).map((refusal) => [name, refusal.why, refusal] as const));

function addressFor(name: string, sessionKey: string): string {
    return name
        .split(" ")[1]
        .replace(/\/:session_key\??/, `/${sessionKey}`)
        .replace(":unit_id", "no-such-unit")
        .replace(":variation", "99")
        .replace(":lobby_id", "999999");
}

function send(address: string, refusal: Refusal) {
    const req = request(app).post(address);
    return refusal.asText
        ? req.set("Content-Type", "text/plain").send(refusal.body as string)
        : req.send(refusal.body as object);
}

// What the rule comes down to. Written out as two separate checks so a failure names which half
// broke: "expected 404 not to be 404" reads differently from "expected 500 to be less than 500".
function expectNotResent(status: number): void {
    expect(status).not.toBe(404);
    expect(status).toBeLessThan(500);
}

// Two players paired into a real battle, the same way test/routes/battle.test.ts does it.
async function createMatch() {
    const a = await loginPlayer("501");
    const b = await loginPlayer("502");
    await request(app).post(`/services/vs/start/${a.session_key}`).send({ vs_type: "QUICK", match_handle: 1 });
    await request(app).post(`/services/vs/start/${b.session_key}`).send({ vs_type: "QUICK", match_handle: 1 });
    const battle = battleHandler.getBattles().find((held) => a.session_key in held.parties)!;
    return { a, b, battle };
}

describe("The table of routes the game re-sends", () => {
    it("has a row for every /services route, and no row for a route that is gone", () => {
        const served = listRoutes()
            .filter((r) => r.path.startsWith("/services/"))
            .map(routeName);
        expect([...RESENT_BY_THE_GAME.keys()].sort()).toEqual(served.sort());
    });

    it("counts thirty re-sent addresses, the number read from the game", () => {
        expect(resent.length + RESENT_WITHOUT_A_ROUTE).toBe(30);
    });
});

describe("A permanent no is never answered with a code the game re-sends", () => {
    it.each(ROWS)("%s -- %s", async (name, _why, refusal) => {
        const { session_key } = await loginPlayer("601");
        const res = await send(addressFor(name, session_key), refusal);
        expectNotResent(res.status);
    });
});

describe("Battle requests about a battle that is really being played", () => {
    const battleRoutes = resent.filter((name) => name.includes("/services/battle/"));

    it.each(battleRoutes)("%s from a player who is not in that battle", async (name) => {
        const { battle } = await createMatch();
        const outsider = await loginPlayer("503");
        const res = await send(addressFor(name, outsider.session_key), {
            why: "",
            body: { battle_id: battle.battle_id },
        });
        expectNotResent(res.status);
    });

    it.each(battleRoutes)("%s from a player in it, with nothing else in the body", async (name) => {
        const { a, battle } = await createMatch();
        const res = await send(addressFor(name, a.session_key), { why: "", body: { battle_id: battle.battle_id } });
        expectNotResent(res.status);
    });

    it.each(battleRoutes)("%s from a player in it, with the wrong kind of value in every field", async (name) => {
        const { a, battle } = await createMatch();
        const res = await send(addressFor(name, a.session_key), {
            why: "",
            body: { ...WRONG_KINDS, battle_id: battle.battle_id },
        });
        expectNotResent(res.status);
    });

    it.each(battleRoutes)("%s from a player in it, naming units that do not exist", async (name) => {
        const { a, battle } = await createMatch();
        const res = await send(addressFor(name, a.session_key), {
            why: "",
            body: { ...UNKNOWN_THINGS, battle_id: battle.battle_id },
        });
        expectNotResent(res.status);
    });

    it.each(battleRoutes)("%s after the other player's session has gone", async (name) => {
        const { a, b, battle } = await createMatch();
        // Forgotten directly, not signed out: signing out would end the battle as well.
        sessionHandler.removeSession(b.session_key);
        const res = await send(addressFor(name, a.session_key), { why: "", body: { battle_id: battle.battle_id } });
        expectNotResent(res.status);
    });
});

// Refusals that come from where the player stands, not from what they sent.
describe("A refusal that comes from the player's own state", () => {
    it("a new barracks row when the barracks is already full", async () => {
        const { session_key } = await loginPlayer("611");
        sessionHandler.getSession("session_key", session_key)!.accountData!.roster_rows = 8;
        const res = await request(app).post(`/services/roster/unlock/${session_key}`).send({});
        expect(res.status).toBe(400);
    });

    it("a new barracks row the player cannot pay for", async () => {
        const { session_key } = await loginPlayer("612");
        sessionHandler.getSession("session_key", session_key)!.accountData!.renown = 0;
        const res = await request(app).post(`/services/roster/unlock/${session_key}`).send({});
        expect(res.status).toBe(402);
    });

    it("a hire the player cannot pay for", async () => {
        const { session_key } = await loginPlayer("613");
        sessionHandler.getSession("session_key", session_key)!.accountData!.renown = 0;
        const res = await request(app)
            .post(`/services/roster/unit/hire/${session_key}`)
            .send({ purchasable_unit_id: "archer", new_unit_id: "archer_0", new_unit_name: "Gunnar" });
        expectNotResent(res.status);
        expect(res.status).not.toBe(200);
    });

    it("a second search while the first is still running", async () => {
        const { session_key } = await loginPlayer("614");
        const body = { vs_type: "QUICK", match_handle: 1 };
        await request(app).post(`/services/vs/start/${session_key}`).send(body);
        const res = await request(app).post(`/services/vs/start/${session_key}`).send(body);
        expect(res.status).toBe(409);
    });
});

describe("Addresses the game re-sends that are not routes of ours", () => {
    // Express's own answer for an address nothing serves is 404. The catch-all at the end of
    // /services in app.ts answers 400 instead.
    it.each(["/services/tourney/join", "/services/iap/info"])("%s, which we have not built", async (address) => {
        const { session_key } = await loginPlayer("602");
        const res = await request(app).post(`${address}/${session_key}`).send({});
        expectNotResent(res.status);
    });

    it("the Steam overlay notice", async () => {
        const { session_key } = await loginPlayer("603");
        const res = await request(app).post(`/services/session/steam/overlay/${session_key}/true`);
        expectNotResent(res.status);
    });
});
