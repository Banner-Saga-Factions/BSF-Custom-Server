import crypto from "crypto";
import { readFileSync } from "fs";
import { EventEmitter } from "events";
import { getQueue, dequeuePlayer } from "../queue";
import { REPORTED_QUEUE_MODES } from "../../const";
import { asyncRouter } from "../../http/asyncRouter";
import rateLimit from "express-rate-limit";
import { config } from "dotenv";
import { AccountRow, upsertAccount } from "../../db/account";
// Import cycle: Battle.ts imports { Session, sessionHandler } from this file.
// Safe because battleHandler and finalizeSurrender are only used inside
// finishBattleForLeaver(), which runs only when the reaper, addSession or /logout runs
// (#224), never at module top level.
import { battleHandler, finalizeSurrender } from "../battle/Battle";
import { exitAllLobbies } from "../lobby";
// #91: same deferred-access import cycle as lobby above - friends.ts reads the session
// map from this file, and nothing here is touched until a request or the reaper runs.
import { announceOffline, announceOnline } from "../friends";
// #146: the login-id → 32-bit account_id math lives in one shared module.
import { steamRouteIdKind } from "./accountId";
// #140: every player's stored in-game number.
import { accountNumberFor } from "../../db/accountNumbers";
// #326: asking Steam whether a sign-in's proof is genuine. Imports nothing from this file.
import { checkSteamTicket } from "./steamTicket";
import { steamWebApiKey } from "../../const";
// #267: counting sign-ins. activityStats imports nothing from this file, so there is no cycle here.
import { recordSignIn } from "../activityStats";
// #337: the chat lines with the player numbers. Neither file imports this one, so there is no cycle.
import {
    arrivalLine,
    busyHoursSince,
    claimArrivalLine,
    pickBusiestHours,
    serverChatLine,
    signInLine,
} from "../playerNumbers";
import { getBusyHourDays } from "../../db/activity";
// #269: the message of the day. That file imports only a type from this one, so there is no cycle.
import { sendMessageOfTheDay } from "../messageOfTheDay";
// #251: signing in with a finished Discord hand-off. That file imports nothing from this one.
import { claimHandoff } from "./discordHandoff";
import type { Response } from "express";

config();

const build_number = readFileSync("./data/build-number", "utf-8");

export const AuthRouter = asyncRouter();

// Fix #19: var → const
// Issue #53: 16 bytes (128 bits) of entropy — UUIDv4-equivalent. 8 bytes (64 bits) was
// brute-forceable over long session lifetimes.
const generateKey = () => {
    return crypto.randomBytes(16).toString("hex");
};

// LOW-1/LOW-2: cache static files at module load instead of re-reading per request
let _firstJsonData: any[] = [];
try {
    _firstJsonData = JSON.parse(readFileSync("./data/first.json", "utf-8"));
} catch (err) {
    console.error("[AUTH] Failed to load data/first.json:", err);
}

let _accountsData: any[] = [];
try {
    _accountsData = JSON.parse(readFileSync("./data/accounts.json", "utf-8"));
} catch (err) {
    console.error("[AUTH] Failed to load data/accounts.json:", err);
}

export const getInitialData = (): any[] => {
    let initialData: any[] = [];
    // Only the match kinds we report on — signing in should not advertise a friend
    // queue, which is a private arrangement with no counter in the game (#205).
    for (const type of REPORTED_QUEUE_MODES) {
        initialData.push(getQueue(type, 0));
    }
    return initialData.concat(_firstJsonData);
};

// Fix #1/#4: return a safe fallback instead of crashing for unknown user_ids
const getUser = (user_id: number): { username: string } => {
    return _accountsData.find((acc) => acc.user_id === user_id) ?? { username: `player_${user_id}` };
};

// #39: hard cap on a session's pending-message buffer. Generous enough that an
// actively-polling client (drains fully every poll) never trips it — only a hung
// or disconnected session that keeps receiving pushes does.
export const MAX_SESSION_BUFFER = 200;

export class Session extends EventEmitter {
    display_name: string;
    user_id: number;
    external_id_str: string; // Exact provider id string (Steam ID or Discord Snowflake); user_id (Number) may lose precision above 2^53
    // 32-bit account ID used for all in-game data (party.user, entity prefixes, aliveUnits keys).
    // Matches the format the original BSF server used and what the game client expects.
    account_id: number;
    session_key: string;
    accountData: AccountRow | null = null;

    data: any[];
    // #91: which room of the game the player is standing in ("loc_great_hall" and so
    // on), reported by the client and shown beside their name on other players' friends
    // screens. Empty until they first tell us.
    location: string = "";
    battle_id?: string;
    match_handle: number = 0;
    pollingActive: boolean = false;
    pollStartTime?: number; // Timestamp when this poll began (for latency measurement)
    // When this player's own game last asked for messages -- the one sign that it is still running.
    // Only the polling route moves this, never a message the server sends: one queue update goes to
    // every player not in a battle, so a time that sending refreshed kept a crashed game looking
    // alive for as long as other people kept searching (#246). It starts at sign-in time, since
    // signing in proves the game is running too. The session reaper, the online count (#267) and
    // both battle checks (#224) all read this.
    lastPollAt: number = Date.now();
    // The ids of the units this sign-in hired and has not retired since, so a re-sent hire whose first reply was lost can be
    // told from a clash with an older unit. See the hire route in roster.ts.
    hiredIds: Set<string> = new Set();
    // The last red notice sent to this player (#269), so a notice due to be cleared is cleared only
    // while nothing newer has replaced it. Kept here so it goes when the session does.
    lastNotice: { class: string; msg: string } | null = null;

    constructor(user_id: number, account_id: number) {
        super();
        this.display_name = getUser(user_id).username;
        this.user_id = user_id;
        // Set to the exact provider id string by addSession right after construction;
        // initialise empty rather than deriving from the possibly-imprecise number (#34).
        this.external_id_str = "";
        // The player's stored number, read by the sign-in route before the session is made
        // (#140). Never worked out from user_id here: two players can share a computed one.
        this.account_id = account_id;
        this.session_key = generateKey();
        this.data = getInitialData();
    }

    asJson() {
        return {
            display_name: this.display_name,
            build_number: build_number,
            user_id: this.user_id,
            vbb_name: this.display_name,
            session_key: this.session_key,
        };
    }

    pushData(...data: any) {
        this.data.push(...data);
        // #39: bound the buffer. A crashed game is still sent messages until the reaper
        // clears its session, up to about 35 minutes later, and without a cap its buffer would
        // keep growing until then. Drop the oldest beyond the cap.
        if (this.data.length > MAX_SESSION_BUFFER) {
            this.data.splice(0, this.data.length - MAX_SESSION_BUFFER);
        }
        this.emit("data");
    }
}

// No prototype (#311): a plain `{}` would find built-in names
// such as "constructor" as entries.
const sessions: { [key: string]: Session } = Object.create(null);
// Production value:
export const SESSION_TTL_MS = 30 * 60 * 1000;
// Test value: 30 * 1000 = 30 seconds
//export const SESSION_TTL_MS = 30 * 1 * 1000;

// A player counts as online while their game has asked for messages within this long (#267). The
// game normally waits only a few seconds between requests (docs/client-contract.md, R7). Measured
// once, on 2026-09-17 UTC: the longest gap was 24.5 s, on the battle loading screen, so a 20-second
// window could count players as offline while a battle loads; a minimised window kept asking every
// 6 s or so (docs/observability.md). The count is sampled once a minute, so a crashed game stays in
// it for about one sample at most.
export const ONLINE_WINDOW_MS = 60 * 1000;

// Finish the battle a departing player is in, as their surrender: the player still there is
// told they won and the battle is freed. Every way a session ends uses this -- the reaper,
// a second sign-in that replaces the session, and /logout -- because the player left behind
// cannot tell those apart, and otherwise waits for a move or a result that never comes.
// Before #224 only the reaper did this; the other two dropped the session and left the
// battle to be swept later without telling anyone. `why` starts each log line.
//
// Does nothing for a player who is not in a battle; the caller logs that case if it wants to.
function finishBattleForLeaver(session: Session, why: string): void {
    const battleId = session.battle_id;
    if (!battleId) return;
    const battle = battleHandler.getBattle(battleId);
    if (!battle) {
        console.log(`[SESSION] ${why} user_id=${session.user_id} (battle=${battleId} already gone)`);
        return;
    }
    const opponent = sessionHandler.getSessions(
        (s) => s.battle_id === battleId && s.session_key !== session.session_key
    )[0];
    if (battle.endgameStarted) {
        // Already won, lost or surrendered: a player who closes the game from the results
        // screen, or whose game surrendered on its own before this arrived. Nothing to finish.
        console.log(`[SESSION] ${why} user_id=${session.user_id} (battle=${battleId} already over)`);
    } else if (opponent) {
        // pushData inside finalizeSurrender is synchronous, so the survivor
        // gets BATTLE_SURRENDER_DATA buffered before this returns. The async
        // tail (DB writes + BattleFinishedData) captures local refs and
        // completes after we removeBattle / delete the departing session.
        finalizeSurrender({ session, opponent, battle }).catch((err) =>
            console.error(`[SESSION] finalizeSurrender failed (${why}):`, err)
        );
        console.log(
            `[SESSION] ${why} user_id=${session.user_id} mid-battle; surrendered to user_id=${opponent.user_id}`
        );
    } else {
        console.log(`[SESSION] ${why} user_id=${session.user_id} (battle=${battleId}, opponent already gone)`);
    }
    // Always remove the battle here, even when it had already ended or no opponent
    // was left. This also clears battle_id on both players' sessions (#164).
    battleHandler.removeBattle(battleId);
}

// Exported so tests can drive the reaper deterministically without timer mocking.
// Closes the orphan-battle leak from the 2026-05-11 perf audit (findings 1 + 2):
// when a session is evicted mid-battle, the battle was previously left in the
// registry forever. Now we run the same surrender flow as /exit so the survivor
// gets BATTLE_SURRENDER_DATA + BattleFinishedData and the battle is removed.
export function reapStaleSessions(now: number = Date.now()): void {
    // A session goes once its game has not asked for messages for SESSION_TTL_MS (#246); a
    // running game asks every few seconds. Messages sent to it do not count, so when both
    // players in one battle have gone, the first one visited surrenders to the second and
    // both are cleared in this same pass. A missing lastPollAt fails the `<=` and counts as gone.
    for (const [key, session] of Object.entries(sessions)) {
        if (now - session.lastPollAt <= SESSION_TTL_MS) continue;

        if (session.battle_id) {
            finishBattleForLeaver(session, "Evicted stale session");
        } else {
            console.log(`[SESSION] Evicted stale session for user_id=${session.user_id}`);
        }

        session.removeAllListeners();
        dequeuePlayer(key);
        // Clear any lobby ownership / invites this user held. Mirrors the
        // queue + battle cleanup above so a reaped owner doesn't leave a
        // ghost lobby that other players keep showing in their UI.
        exitAllLobbies(session.account_id, session.display_name);
        // #91: grey this player out on everyone else's friends screen. The game cannot
        // remove a name from a list it has been sent, so marking them offline is the
        // only way to stop other people trying to invite someone who has gone.
        announceOffline(session.account_id);
        delete sessions[key];
    }
}

setInterval(reapStaleSessions, 5 * 60 * 1000).unref();

export const sessionHandler = {
    getSessions: (filterFunc: (s: Session, index: number, array: Session[]) => boolean = () => true): Session[] => {
        return (Object.values(sessions) as Session[]).filter(filterFunc);
    },
    addSession: (user_id: number, external_id_str: string, account_id: number): Session => {
        // HIGH-8: evict any existing session for this player to prevent stale sessions.
        // #140: match on the exact provider-id string, which no two players share (user_id
        // does not: Steam ids within one float rounding step become one Number). A real
        // re-login by the same player still evicts the old session.
        const existing = Object.values(sessions).find((s) => s.external_id_str === external_id_str);
        if (existing) {
            // #224: signing in again is the usual move after a crash, and to the opponent the
            // old session has left the battle. Finish it now, while that session is still at
            // hand to finish it with; once it is deleted, nothing can tell them they won.
            finishBattleForLeaver(existing, "Replaced session (signed in again)");
            dequeuePlayer(existing.session_key);
            delete sessions[existing.session_key];
        }
        const session = new Session(user_id, account_id);
        // addSession owns this field so it is never left blank — every DB write for the
        // player is keyed on it. external_id_str is REQUIRED (not defaulted): the caller
        // must pass the exact provider string, because String(user_id) would re-introduce
        // float rounding for ids above 2^53 and silently mis-key every DB write for that
        // player. The two real callers are the Steam and Discord login routes.
        session.external_id_str = external_id_str;
        sessions[session.session_key] = session;
        return session;
    },
    getSession: (key: string, value: any): Session | undefined => {
        if (key === "session_key") return sessions[value];
        return Object.values(sessions).find((session) => (session as any)[key] === value) as Session;
    },
    removeSession: (session_key: string) => {
        delete sessions[session_key];
    },
};

// How many players' games have asked for messages within the last ONLINE_WINDOW_MS. See
// Session.lastPollAt.
export function countOnlinePlayers(now: number = Date.now()): number {
    return sessionHandler.getSessions((s) => now - s.lastPollAt <= ONLINE_WINDOW_MS).length;
}

// #337: after a sign-in, tell the newcomer in chat how many players are online and when the game
// is usually busy, and tell everyone else, including players in a battle, the new count. The
// newcomer is in the count: their session was made a moment ago. Both sign-in routes call this
// once their reply has gone, without waiting, and it never fails -- a chat line must not undo a
// sign-in. The text is built in src/services/playerNumbers.ts.
export async function sendPlayerNumbers(session: Session, now: number = Date.now()): Promise<void> {
    try {
        const online = countOnlinePlayers(now);
        // Checked for anyone to tell first: a sign-in with nobody else online must not use up the
        // minute, or the next player to arrive, the one worth announcing, would be held back. A game
        // that crashed and is still waiting to be cleared away is nobody to tell, so only sessions
        // that count as online are. The newcomer is told apart by the provider id, the key a second
        // sign-in evicts by: when two sign-ins by one player overlap, the first one's session is
        // already gone, and the player's live session must not be told about itself.
        const others = sessionHandler.getSessions(
            (s) => s.external_id_str !== session.external_id_str && now - s.lastPollAt <= ONLINE_WINDOW_MS
        );
        if (others.length > 0 && claimArrivalLine(now)) {
            const line = serverChatLine(arrivalLine(online));
            for (const other of others) other.pushData(line);
        }
        // Without the history the newcomer still gets the count.
        let busyHours: number[] = [];
        try {
            busyHours = pickBusiestHours(await getBusyHourDays(busyHoursSince(now)));
        } catch (err) {
            console.error("[CHAT] could not read the busy hours:", err);
        }
        session.pushData(serverChatLine(signInLine(online, busyHours)));
    } catch (err) {
        console.error("[CHAT] could not send the player numbers:", err);
    }
}

// Issue #56: cap login attempts at 5/min/IP. State is per-process and in-memory —
// fine for the single-host deployment; would need a shared store for multi-host scale-out.
// Skipped under NODE_ENV=test because the suite shares one source IP and would exhaust
// the cap; rate-limit behavior itself is verified by a manual probe (see plan).
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again in a minute." },
    skip: () => process.env.NODE_ENV === "test",
});

// #326: the status to refuse a Steam-route sign-in with, or undefined to let it through.
// `idStr` is the exact decimal text of `id`; `proof` is whatever the request sent, unchecked.
async function steamSignInRefusal(id: bigint, idStr: string, proof: unknown): Promise<400 | 401 | undefined> {
    const idKind = steamRouteIdKind(id);
    // Above every Steam number, so not one.
    if (idKind === "too-big") return 400;
    // Made-up small numbers carry no proof and are let through unchecked, and with no key
    // nothing can be checked at all (index.ts says so at start-up).
    const steamKey = steamWebApiKey();
    if (idKind !== "steam" || !steamKey) return undefined;
    const verdict = await checkSteamTicket(idStr, proof, steamKey);
    if (verdict === "ok") return undefined;
    // The number and the reason only. Never the proof.
    console.warn(`[AUTH] Steam sign-in refused for ${idStr}: ${verdict}`);
    return 401;
}

// The end of every sign-in, once the session exists: save the account, reply, then the extras.
// `tag` starts the log line if the database fails.
async function finishSignIn(session: Session, res: Response, tag: string): Promise<void> {
    // Fix #2: wrap DB call in try/catch; clean up session on failure
    try {
        session.accountData = await upsertAccount(session.external_id_str, session.display_name);
        // LOW-2: use the DB-stored username as the canonical display name
        session.display_name = session.accountData.username;
        // #91: only now is the display name the real one - it comes from the database
        // row read just above. Announcing any earlier would broadcast the placeholder
        // name to everyone else's friends screen.
        announceOnline(session);
        // Send account_id (32-bit) as user_id — matches original server format and avoids
        // entity naming divergence caused by 64-bit Steam IDs in the game client
        res.json({ ...session.asJson(), user_id: session.account_id });
        // #267: counted only now, once the account is saved and the reply has gone. Not awaited,
        // and it never fails -- see src/services/activityStats.ts.
        void recordSignIn(session.external_id_str);
        // #269: the message of the day, from memory, so it never waits on GitHub. It never fails.
        sendMessageOfTheDay(session);
        // #337: the player numbers in chat. Not awaited, and it never fails.
        void sendPlayerNumbers(session);
    } catch (err) {
        sessionHandler.removeSession(session.session_key);
        // #91: signing in evicted this player's previous session without telling anyone.
        // Now the new one is gone too, so nothing will ever reap it and announce the
        // departure — without this, everyone else keeps that name lit and invitable for
        // the life of their client. Harmless if they were never listed: the game ignores
        // a presence message for an id it does not hold.
        announceOffline(session.account_id);
        console.error(`${tag} DB error during upsertAccount:`, err);
        res.sendStatus(500);
    }
}

// #251: a password starting with this is the key of a Discord hand-off (discordHandoff.ts), not
// a password. The stock game sends "kiosk" or nothing, so it never starts with it.
const DISCORD_PASSWORD_PREFIX = "discord:";

// The hand-off key a sign-in carries, or undefined when it is not a Discord sign-in.
function discordKeyFrom(body: any): string | undefined {
    const password = body?.password;
    if (typeof password !== "string" || !password.startsWith(DISCORD_PASSWORD_PREFIX)) return undefined;
    return password.slice(DISCORD_PASSWORD_PREFIX.length);
}

// #251: signing in with a finished Discord hand-off. Refusals are plain text, for the game to
// show as they are.
async function discordSignIn(key: string, res: Response): Promise<void> {
    // Used up here, before anything else, so one key signs in once.
    const claim = claimHandoff(key);
    if ("refused" in claim) {
        // The reason only. Never the key.
        console.warn(`[AUTH] Discord sign-in refused: ${claim.refused}`);
        res.status(claim.refused === "failed" ? 400 : 401)
            .type("text/plain")
            .send(claim.message);
        return;
    }
    // #140 and #375, before addSession for the same reason as on the Steam route below. The
    // Discord page checked this already; a Steam player may have taken the id since.
    const number = await accountNumberFor("discord", claim.discordId);
    if ("ownedBy" in number) {
        console.warn(
            `[AUTH] Discord sign-in refused for ${claim.discordId}: that id belongs to a ${number.ownedBy} player`
        );
        res.status(400)
            .type("text/plain")
            .send("This Discord account's number is already used by another player. Ask on the BSF Discord for help.");
        return;
    }
    // The full Snowflake is the session-dedup key and the key for every DB write.
    const session = sessionHandler.addSession(number.account_id, claim.discordId, number.account_id);
    session.display_name = claim.username;
    await finishSignIn(session, res, "[DISCORD]");
}

AuthRouter.post("/login/:httpVersion", loginLimiter, async (req, res) => {
    // #251: a Discord sign-in carries its proof in the password and may carry any steam_id, or
    // none, so it is told apart before anything below looks at steam_id.
    const discordKey = discordKeyFrom(req.body);
    if (discordKey !== undefined) {
        await discordSignIn(discordKey, res);
        return;
    }

    // A Steam id arrives as a string or a JSON number. Anything else is refused rather than
    // flattened by toString(), which would read ["123"] as "123".
    const received = req.body.steam_id;
    if (typeof received !== "string" && typeof received !== "number") {
        res.sendStatus(400);
        return;
    }
    // A number of 2^53 or more may already have been rounded when the body was read, and would
    // then sign into a neighbouring account. The game sends text, so such a number is refused.
    if (typeof received === "number" && !Number.isSafeInteger(received)) {
        res.sendStatus(400);
        return;
    }
    // Validate steam_id is a numeric string; keep a string for DB to avoid
    // precision loss — Steam IDs exceed Number.MAX_SAFE_INTEGER (2^53-1).
    if (!/^\d{1,20}$/.test(received.toString())) {
        res.sendStatus(400);
        return;
    }
    // #231: one spelling per player. Leading zeros are dropped, as the 2013 server's
    // Long.parseLong did, so "0765..." and "765..." are one account rather than two, each with
    // its own starting renown. "0" is refused: it becomes in-game number 0, which the game
    // cannot sign in with (docs/client-contract.md -> R1). So is anything above the largest
    // 64-bit id. BigInt(...) rather than 0n: the build targets ES2017, which has no BigInt literals.
    const asBig = BigInt(received.toString());
    if (asBig === BigInt(0) || asBig > BigInt("18446744073709551615")) {
        res.sendStatus(400);
        return;
    }
    const steamIdStr = asBig.toString();

    // #326: a real Steam number must come with proof that the player owns it. All of this
    // runs BEFORE addSession below, which replaces the player's current session and ends their
    // battle as a surrender -- a sign-in that is about to be refused must do neither.
    const refusal = await steamSignInRefusal(asBig, steamIdStr, req.body.steam_auth_ticket);
    if (refusal) {
        res.sendStatus(refusal);
        return;
    }

    // #140 and #375: the player's stored number, handed out on their first sign-in. Also before
    // addSession, for the same reason as the Steam check above: if this id belongs to a Discord
    // player, the refusal must not end that player's session or battle.
    const number = await accountNumberFor("steam", steamIdStr);
    if ("ownedBy" in number) {
        console.warn(`[AUTH] Steam sign-in refused for ${steamIdStr}: that id belongs to a ${number.ownedBy} player`);
        res.sendStatus(400);
        return;
    }

    // Session uses Number (may lose precision for very large IDs) but DB always
    // receives the string, so INSERT and SELECT stay in sync.
    const userId = Number(steamIdStr);
    if (String(userId) !== steamIdStr) {
        console.warn(
            `[AUTH] Steam ID precision loss: received "${steamIdStr}" stored as ${userId} (diff=${BigInt(steamIdStr) - BigInt(userId)})`
        );
    }

    // Pass the exact string — it is the session-dedup key and the key for every DB
    // write. String(userId) would re-introduce the rounding for ids above 2^53, so
    // the string must be handed through untouched.
    const session = sessionHandler.addSession(userId, steamIdStr, number.account_id);

    // Client sends its Steam display name in display_name — use it if present
    const clientDisplayName = req.body.display_name?.toString().trim();
    if (clientDisplayName) {
        session.display_name = clientDisplayName;
    }

    await finishSignIn(session, res, "[LOGIN]");
});

AuthRouter.post("/logout/:session_key", (req, res) => {
    const session = sessionHandler.getSession("session_key", req.params.session_key);
    dequeuePlayer(req.params.session_key);
    if (session) {
        // #224: a sign-out arriving mid-battle finishes that battle as a surrender. When the
        // game closes mid-battle it sends its own surrender, a leave-battle and a sign-out
        // (BattleFsm.cleanup, then GameFsm.cleanup in the client) without waiting between
        // them, so they can arrive in any order; whichever ends the battle first, the leaver
        // loses once. The game does send this sign-out when it closes: the line below
        // appeared when it was closed outside a battle (2026-10-01).
        if (session.battle_id) {
            finishBattleForLeaver(session, "Signed out");
        } else {
            console.log(`[SESSION] Signed out user_id=${session.user_id}`);
        }
        exitAllLobbies(session.account_id, session.display_name);
        announceOffline(session.account_id);
    }
    sessionHandler.removeSession(req.params.session_key);
    res.send();
});
