import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import app from "../../src/app";
import { sessionHandler } from "../../src/services/auth/auth";
import { gameQueue } from "../../src/services/queue";
import { battleHandler } from "../../src/services/battle/Battle";
import { loginPlayer } from "../helpers";
import { shapeDifferences } from "./shape";

// Sends our server what the real game sent Stoic's server in 2022, and compares the answers.
//
// Each file under captures/ is one request and its reply, copied out of the `factionsTrimmed`
// recording (docs/Development.md -> "Official Fiddler Captures") with the session key, the
// players' names and ids, the Steam ticket and the chat text replaced. `message` in each file is
// the message number in that recording, so the original can be looked up.
//
// Every test asks two things. Is the recorded request ACCEPTED -- the same status the 2013
// server gave? And does our reply have the same SHAPE -- the same field names holding the same
// kinds of value (shape.ts)? Values are not compared. Where we differ on purpose, the difference
// is written out below with its reason, and the list is exact: a new difference fails, and so
// does a listed one that has quietly stopped being true.
//
// Only routes with a recording are here. None of the three recordings holds a lobby request, a
// hire, a retire or a promotion.

interface Sample {
    recording: string;
    message: string;
    method: "GET" | "POST";
    address: string;
    contentType: string | null;
    request: unknown;
    status: number;
    reply: unknown;
}

function load(name: string): Sample {
    // vitest runs from bsf-server/, as matchmaker0058.test.ts also relies on.
    return JSON.parse(readFileSync(resolve(process.cwd(), "test/protocol/captures", `${name}.json`), "utf-8"));
}

// The recorded player's own roster and party, so the units the recorded requests name exist.
vi.mock("../../src/db/account", () => ({
    upsertAccount: vi.fn().mockImplementation(async (steam_id: string) => {
        const fs = await import("node:fs");
        const recorded = JSON.parse(fs.readFileSync("test/protocol/captures/account-info.json", "utf-8")).reply;
        return {
            user_id: Number(steam_id),
            username: `player_${steam_id}`,
            renown: 100,
            daily_login_streak: 1,
            login_count: 5,
            completed_tutorial: true,
            roster_rows: 2,
            roster_json: recorded.roster.defs,
            party_ids_json: recorded.party.ids,
        };
    }),
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
});

// The two things in a recording that cannot be the same on our server: the session key the
// player was given, and the id of the battle they were put in. Everything else is sent as recorded.
function replay(sample: Sample, sessionKey = "", battleId = "") {
    const fill = (text: string) => text.replace(/<session_key>/g, sessionKey).replace(/<battle_id>/g, battleId);
    const address = fill(sample.address);
    if (sample.method === "GET") return request(app).get(address);
    const req = request(app).post(address);
    if (sample.request === null) return req;
    if (typeof sample.request === "string") {
        return req.set("Content-Type", sample.contentType ?? "text/plain").send(fill(sample.request));
    }
    return req.send(JSON.parse(fill(JSON.stringify(sample.request))));
}

// What we answered, in the form the samples keep a reply in: nothing at all is `null`.
function replyOf(res: { text: string; body: unknown }): unknown {
    return res.text === "" ? null : res.body;
}

// The recorded player signs in as 1001 and their opponent as 1002 -- the two ids the samples use.
const ME = "1001";
const THEM = "1002";

describe("Recorded requests outside a battle", () => {
    it("sign-in", async () => {
        const sample = load("auth-login");
        const res = await replay(sample);
        expect(res.status).toBe(sample.status);
        expect(shapeDifferences(sample.reply, replyOf(res))).toEqual([]);
    });

    it("account info", async () => {
        const sample = load("account-info");
        const { session_key } = await loginPlayer(ME);
        const res = await replay(sample, session_key);
        expect(res.status).toBe(sample.status);
        expect(shapeDifferences(sample.reply, replyOf(res))).toEqual([]);
    });

    it("leaderboards", async () => {
        const sample = load("game-leaderboards");
        const { session_key } = await loginPlayer(ME);
        const res = await replay(sample, session_key);
        expect(res.status).toBe(sample.status);
        expect(shapeDifferences(sample.reply, replyOf(res))).toEqual([]);
    });

    it("the first request for messages after signing in", async () => {
        const sample = load("game-poll");
        // Somebody else is signed in first, so the friends list we send has an entry to compare.
        await loginPlayer(THEM);
        const { session_key } = await loginPlayer(ME);
        const res = await replay(sample, session_key);
        expect(res.status).toBe(sample.status);
        expect(shapeDifferences(sample.reply, replyOf(res))).toEqual([
            // We run no tournaments, so we send none of the three tournament messages.
            "reply: no tbs.srv.util.Tourney, which the recording has",
            "reply: no tbs.srv.util.TourneyProgressData, which the recording has",
            "reply: no tbs.srv.util.TourneyWinnerData, which the recording has",
            // Three differences in each friend's entry. The game reads eleven named fields from
            // an entry (FriendData.parseJson) and neither `class` nor `steam_id_str` is one of
            // them. `steam_id` it does read, and we leave it blank on purpose: it would name a
            // person outside the game to everybody signed in (friends.ts -> FriendEntry).
            "reply<tbs.srv.data.FriendsData>.friends[].class: missing",
            "reply<tbs.srv.data.FriendsData>.friends[].steam_id: string, where the recording has number",
            "reply<tbs.srv.data.FriendsData>.friends[].steam_id_str: missing",
        ]);
    });

    it("a stat purchase that takes points out of some stats and puts them in others", async () => {
        // The amounts in this recording are why a negative amount must be accepted (#118).
        const sample = load("roster-stats-purchase");
        const { session_key } = await loginPlayer(ME);
        const res = await replay(sample, session_key);
        expect(res.status).toBe(sample.status);
        expect(shapeDifferences(sample.reply, replyOf(res))).toEqual([
            // The 2013 server sent the request straight back. We send nothing. The game's request
            // class reads nothing from this reply: PurchaseStatsTxn only marks it as dealt with.
            "reply: null, where the recording has object",
        ]);
    });

    it.each(["game-location", "steam-overlay", "auth-logout"])("%s, which is answered with nothing", async (name) => {
        const sample = load(name);
        const { session_key } = await loginPlayer(ME);
        const res = await replay(sample, session_key);
        expect(res.status).toBe(sample.status);
        expect(sample.reply).toBeNull();
        expect(replyOf(res)).toBeNull();
    });
});

describe("Recorded requests from one battle, in the order the game sent them", () => {
    it("match start, then ready, deploy, sync, query, move, action, kill and exit", async () => {
        const me = await loginPlayer(ME);
        const them = await loginPlayer(THEM);

        // Both players send the recorded search. The second one pairs them.
        const start = load("vs-start");
        const first = await replay(start, me.session_key);
        expect(first.status).toBe(start.status);
        expect(shapeDifferences(start.reply, replyOf(first))).toEqual([]);
        expect((await replay(start, them.session_key)).status).toBe(start.status);

        const battle = battleHandler.getBattles().find((held) => me.session_key in held.parties);
        expect(battle).toBeDefined();

        // One line per request: its status, and every way its reply differs from the recorded one.
        const answers: string[] = [];
        for (const name of ["ready", "deploy", "sync", "query", "move", "action", "killed", "exit"]) {
            const sample = load(`battle-${name}`);
            const res = await replay(sample, me.session_key, battle!.battle_id);
            const differences = shapeDifferences(sample.reply, replyOf(res));
            // shape.ts lets anything match a recorded nothing. Here nothing was the whole reply,
            // so a body from us is a difference.
            if (sample.reply === null && replyOf(res) !== null) {
                differences.push("reply: a body, where the recording has nothing");
            }
            answers.push([`${name} ${res.status}`, ...differences].join(" | "));
        }
        expect(answers).toEqual([
            "ready 200",
            "deploy 200",
            "sync 200",
            "query 200",
            "move 200",
            "action 200",
            "killed 200",
            // The 2013 server answered an exit with the messages waiting for the player (one chat
            // line, in this recording). We answer with a small object of our own. This test found
            // the difference; nobody is known to have chosen it.
            "exit 200 | reply: object, where the recording has list",
        ]);
    });
});
