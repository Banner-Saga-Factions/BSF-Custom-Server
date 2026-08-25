import express from "express";
import { asyncRouter } from "../http/asyncRouter";
// Import cycle: auth/auth.ts imports `exitAllLobbies` from this module for
// its reaper + /logout hooks, and we import Session / sessionHandler from
// auth. Safe because both ends only touch the imported names inside
// function bodies (request handlers and reaper callbacks), never at module
// top level. Same shape as the existing Battle.ts ↔ auth.ts cycle
// documented at auth.ts:10-12.
import { Session, sessionHandler } from "./auth/auth";
import { ServerClasses } from "../const";
import { buildOrderedPartyDefs } from "./account";

// In-memory lobby state, ported from tbs/srv/util/LobbySystem.java.
//
// Java backed lobbies with three MySQL tables (account_info.lobby_id /
// lobby_ready, lobby, lobby_invite). bsf-server keeps the same semantics in
// a single Map — the M3b milestone explicitly accepts in-memory storage
// because lobbies are pre-match coordination rooms that don't need to
// outlive a server restart.
//
// Invariants:
// - lobby.id always equals the owner's 32-bit account_id (the client picks
//   the inviter's own account_id as the lobby id; doJoin in the Java does
//   `doJoin(config, data.lobby_id, data.lobby_id)`).
// - lobby.members always contains the owner with joined=true.
// - lobby.members.size <= 2. Java enforces "only 1 invite per room right
//   now" (LobbySystem.java:40-43); we keep the same cap so 2v2 stays a
//   separate, deliberate change later.

type LobbyEventType =
    | "INVITE"
    | "UNINVITE"
    | "JOIN"
    | "DECLINE"
    | "EXIT"
    | "READY"
    | "UNREADY"
    | "OPTIONS"
    | "PARTY"
    | "TERMINATED";

interface LobbyMember {
    account_id: number;
    display_name: string;
    joined: boolean;
    ready: boolean;
}

interface Lobby {
    id: number;
    display_name: string;
    scene: string;
    timer: number;
    msg: string | null;
    members: Map<number, LobbyMember>;
}

const lobbies = new Map<number, Lobby>();

// Exported for tests; resets all in-memory lobby state.
export function _resetLobbiesForTest(): void {
    lobbies.clear();
}

// Exported for tests so behavior can be inspected without hitting HTTP.
export function _getLobbyForTest(lobby_id: number): Lobby | undefined {
    return lobbies.get(lobby_id);
}

const sessionByAccountId = (account_id: number): Session | undefined =>
    sessionHandler.getSession("account_id", account_id);

// Pushes one event to every session listed in `recipients`. Offline targets
// are silently skipped — Java queued to RabbitMQ for later pickup, but
// bsf-server's long-poll has no persistent backlog and a player whose
// session is gone has no UI to update anyway.
function pushToAccounts(recipients: number[], event: any): void {
    const seen = new Set<number>();
    for (const id of recipients) {
        if (seen.has(id)) continue;
        seen.add(id);
        sessionByAccountId(id)?.pushData(event);
    }
}

function allLobbyAccountIds(lobby: Lobby): number[] {
    return Array.from(lobby.members.keys());
}

// Build EntityDef[] for a session's current party, matching the
// LobbyPartyData.party field. Same shape Battle.ts builds for
// BattlePartyData.defs — walk party_ids_json in the player's chosen
// arrangement order (issue #71; old code filtered the roster and lost
// the order).
function buildPartyDefs(session: Session): any[] {
    if (!session.accountData) return [];
    return buildOrderedPartyDefs(session.accountData.roster_json, session.accountData.party_ids_json);
}

function makeLobbyData(
    lobby_id: number,
    account_id: number,
    account_display_name: string | null,
    type: LobbyEventType
): any {
    return {
        class: ServerClasses.LOBBY_DATA,
        lobby_id,
        account_id,
        account_display_name,
        type,
    };
}

function makeLobbyOptionsData(
    lobby: Lobby,
    account_id: number,
    account_display_name: string | null,
    type: "INVITE" | "OPTIONS"
): any {
    return {
        class: ServerClasses.LOBBY_OPTIONS_DATA,
        lobby_id: lobby.id,
        account_id,
        account_display_name,
        type,
        display_name: lobby.display_name,
        scene: lobby.scene,
        timer: lobby.timer,
        msg: lobby.msg,
    };
}

function makeLobbyPartyData(
    lobby_id: number,
    account_id: number,
    party: any[] | null,
    type: "JOIN" | "PARTY"
): any {
    return {
        class: ServerClasses.LOBBY_PARTY_DATA,
        lobby_id,
        account_id,
        account_display_name: null,
        type,
        party,
    };
}

// Called from the session reaper and from /logout. Mirrors Java's
// LobbySystem.terminateSession: TERMINATE any lobby the user owns and
// EXIT every lobby the user is an invitee in. The owned lobby is removed
// from the map BEFORE the invitee scan, so there's no double-process.
export function exitAllLobbies(account_id: number, display_name: string): void {
    const owned = lobbies.get(account_id);
    if (owned) {
        const recipients = allLobbyAccountIds(owned);
        // Java pushes TERMINATED BEFORE clearing state (LobbySystem.java:69)
        // so the recipients list still includes all members when the push
        // fans out. We do the same.
        pushToAccounts(recipients, makeLobbyData(owned.id, 0, display_name, "TERMINATED"));
        lobbies.delete(account_id);
    }

    for (const lobby of lobbies.values()) {
        if (!lobby.members.has(account_id)) continue;
        lobby.members.delete(account_id);
        pushToAccounts(
            allLobbyAccountIds(lobby),
            makeLobbyData(lobby.id, account_id, display_name, "EXIT")
        );
    }
}

export const LobbyRouter = asyncRouter();

// The AS3 client sends every lobby request with Content-Type: text/plain
// because HttpRequest.as:67-69 stamps that on any String body — and all 8
// LobbyTxn variants pass a String to super() (six via `arg.toString()`,
// two via `JSON.stringify(options)`). Global `express.json()` at app.ts
// ignores text/plain bodies, so without this router-level `express.text()`
// every lobby route would land with req.body = undefined and reply 400.
// Body-parser is idempotent: if a test sends application/json and the
// global parser already populated req.body, this middleware skips.
LobbyRouter.use(express.text({ type: "text/plain" }));

// Normalize req.body into the shape the handler wants regardless of which
// Content-Type the request used:
// - text/plain (production wire format): req.body is a raw string;
//   JSON.parse covers both integer bodies ("12345" → 12345) and object
//   bodies (JSON.stringify(options) → parsed object). Falls back to the
//   raw string if it isn't valid JSON, which the integer routes then
//   reject as NaN via Number(...).
// - application/json (some tests): req.body is already a parsed JS value;
//   pass it through unchanged.
function readBody(req: any): any {
    if (typeof req.body === "string") {
        try {
            return JSON.parse(req.body);
        } catch {
            return req.body;
        }
    }
    return req.body;
}

function requireSession(req: any): Session | null {
    const session: Session | undefined = (req as any).session;
    return session ?? null;
}

// POST /lobby/invite/:session_key
// Body: LobbyOptionsData JSON (sent as text/plain per HttpRequest.as).
//   { lobby_id, account_id (target), account_display_name, display_name (lobby title),
//     scene, timer, msg }
// The lobby_id in the body is the INVITER's own account_id — we enforce
// that explicitly (see guard below). If no lobby exists for the inviter,
// we create one with them as owner. If the lobby already has an invitee,
// the request is silently dropped (Java's "only 1 invite per room right
// now" rule, LobbySystem.java:40-43).
LobbyRouter.post("/invite/:session_key", (req, res) => {
    const session = requireSession(req);
    if (!session) {
        res.sendStatus(401);
        return;
    }
    const data = readBody(req);
    if (!data || typeof data !== "object") {
        res.sendStatus(400);
        return;
    }
    const lobby_id = Number(data.lobby_id);
    const invitee_id = Number(data.account_id);
    if (!Number.isFinite(lobby_id) || !Number.isFinite(invitee_id)) {
        res.sendStatus(400);
        return;
    }
    // Deliberate divergence from Java: the caller may only invite into
    // their OWN lobby. The Java reference trusts `data.lobby_id` from the
    // request body, which would let a hostile/modified client invite
    // themselves into a victim's empty lobby (the 1-invitee cap only
    // blocks once an invitee exists, not at lobby creation).
    if (lobby_id !== session.account_id) {
        res.sendStatus(403);
        return;
    }
    // Reject self-invite. Without this, the owner's `members` entry is
    // overwritten with `joined: false, ready: false` (the invitee shape)
    // and they can no longer mark themselves ready. The 1-invitee cap a
    // few lines down doesn't catch this because the owner is excluded
    // from `otherMembers`.
    if (invitee_id === session.account_id) {
        res.sendStatus(400);
        return;
    }

    let lobby = lobbies.get(lobby_id);
    if (!lobby) {
        lobby = {
            id: lobby_id,
            display_name: String(data.display_name ?? ""),
            scene: String(data.scene ?? ""),
            timer: Number(data.timer ?? 30),
            msg: data.msg != null ? String(data.msg) : null,
            members: new Map(),
        };
        lobby.members.set(session.account_id, {
            account_id: session.account_id,
            display_name: session.display_name,
            joined: true,
            ready: false,
        });
        lobbies.set(lobby_id, lobby);
    } else {
        // Refresh options off the new invite — matches Java's invite()
        // calling sendRabbit(config, data) with the full LobbyOptionsData.
        lobby.display_name = String(data.display_name ?? lobby.display_name);
        lobby.scene = String(data.scene ?? lobby.scene);
        lobby.timer = Number(data.timer ?? lobby.timer);
        lobby.msg = data.msg != null ? String(data.msg) : lobby.msg;
    }

    // 1-invitee-per-lobby cap. Only check NON-owner members so re-inviting
    // never sneaks past via the owner's own entry.
    const otherMembers = Array.from(lobby.members.values()).filter(
        (m) => m.account_id !== lobby!.id
    );
    if (otherMembers.length > 0) {
        // Faithful to Java: log and silently return without pushing.
        console.warn(
            `[LOBBY] invite dropped — lobby ${lobby_id} already has invitee ${otherMembers[0].account_id} (1-max rule)`
        );
        res.send();
        return;
    }

    // Resolve invitee display name. Prefer the live session; fall back to
    // whatever the client sent. Java reads auth_account; the bsf-server
    // accounts table has no by-32-bit-account-id index, so the live session
    // is the most accurate cheap source.
    const inviteeSession = sessionByAccountId(invitee_id);
    const inviteeDisplayName: string =
        inviteeSession?.display_name ??
        String(data.account_display_name ?? `player_${invitee_id}`);

    lobby.members.set(invitee_id, {
        account_id: invitee_id,
        display_name: inviteeDisplayName,
        joined: false,
        ready: false,
    });

    const recipients = allLobbyAccountIds(lobby);
    pushToAccounts(
        recipients,
        makeLobbyOptionsData(lobby, invitee_id, inviteeDisplayName, "INVITE")
    );
    // Java's invite() ends with notifyParty(config, lobby_id, lobby_id, ...)
    // which sends the OWNER's party — so the invitee immediately sees who
    // they were invited by.
    pushToAccounts(
        recipients,
        makeLobbyPartyData(lobby.id, lobby.id, buildPartyDefs(session), "PARTY")
    );

    res.send();
});

// POST /lobby/uninvite/:session_key
// Body: integer account_id of the invitee to remove (sent as text/plain).
//
// Faithful Java quirk: the kicked invitee is NOT notified. sendRabbit in
// LobbySystem.java runs AFTER removeInvite, and getInvites at that point no
// longer includes the kicked id, so only the owner's queue receives UNINVITE.
LobbyRouter.post("/uninvite/:session_key", (req, res) => {
    const session = requireSession(req);
    if (!session) {
        res.sendStatus(401);
        return;
    }
    const invitee_id = Number(readBody(req));
    if (!Number.isFinite(invitee_id)) {
        res.sendStatus(400);
        return;
    }

    // The caller must be the owner — kicking only makes sense for the lobby
    // they themselves own. Java looks up the lobby implicitly via the
    // caller's account_info row; here we use session.account_id directly.
    const lobby = lobbies.get(session.account_id);
    if (!lobby) {
        res.send();
        return;
    }

    if (!lobby.members.delete(invitee_id)) {
        // Wasn't a member; still 200 — Java silently no-ops too.
        res.send();
        return;
    }

    pushToAccounts(
        allLobbyAccountIds(lobby),
        makeLobbyData(lobby.id, invitee_id, null, "UNINVITE")
    );

    res.send();
});

// POST /lobby/exit/:session_key
// Body: integer lobby_id the caller is leaving (sent as text/plain).
//
// If caller == owner: TERMINATE the whole lobby (push TERMINATED to all
// then delete). Else: just remove the caller and push EXIT.
LobbyRouter.post("/exit/:session_key", (req, res) => {
    const session = requireSession(req);
    if (!session) {
        res.sendStatus(401);
        return;
    }
    const lobby_id = Number(readBody(req));
    if (!Number.isFinite(lobby_id)) {
        res.sendStatus(400);
        return;
    }

    const lobby = lobbies.get(lobby_id);
    if (!lobby) {
        res.send();
        return;
    }

    if (lobby_id === session.account_id) {
        const recipients = allLobbyAccountIds(lobby);
        pushToAccounts(
            recipients,
            makeLobbyData(lobby.id, 0, session.display_name, "TERMINATED")
        );
        lobbies.delete(lobby_id);
        res.send();
        return;
    }

    // Member exit: drop caller, then push EXIT to whoever's left.
    if (!lobby.members.delete(session.account_id)) {
        res.send();
        return;
    }
    pushToAccounts(
        allLobbyAccountIds(lobby),
        makeLobbyData(lobby.id, session.account_id, session.display_name, "EXIT")
    );

    res.send();
});

// POST /lobby/join/:session_key
// Body: integer lobby_id to join (sent as text/plain).
//
// Refuses two cases: 409 when the lobby doesn't exist, 403 when the
// caller isn't on the invite list. Deliberate divergence from Java,
// which silently UPDATEd account_info.lobby_id to a junk value and
// pushed to no-one.
//
// Both codes matter — they are not cosmetic. Do NOT "simplify" either
// back to 404. The client re-sends a 404 every ~2 s with no attempt cap
// (HttpAction.canRetry), every lobby route opts into re-sending, and
// nothing but a 401 or a maintenance 503 can abandon one — so a 404 here
// left any client that sent a join against a dead id asking for the life
// of the process. None of 401, 403 or 409 is re-sent.
//
// The reachable trigger is NOT a server restart: a restart clears the
// sessions too, so app.ts's gate answers 401 before this router is ever
// reached. It is the lobby disappearing while the caller's session is
// still alive — the owner exits, or exitAllLobbies runs from the session
// reaper or from logout. See docs/client-contract.md → R23.
LobbyRouter.post("/join/:session_key", (req, res) => {
    const session = requireSession(req);
    if (!session) {
        res.sendStatus(401);
        return;
    }
    const lobby_id = Number(readBody(req));
    if (!Number.isFinite(lobby_id)) {
        res.sendStatus(400);
        return;
    }

    const lobby = lobbies.get(lobby_id);
    if (!lobby) {
        res.sendStatus(409);
        return;
    }

    const member = lobby.members.get(session.account_id);
    if (!member) {
        res.sendStatus(403);
        return;
    }
    member.joined = true;

    const recipients = allLobbyAccountIds(lobby);
    // Java pushes a JOIN signal first (party=null) then PARTY with the real
    // party in a second message — keep both so the client's two-step
    // handler matches the original wire trace.
    pushToAccounts(
        recipients,
        makeLobbyPartyData(lobby.id, session.account_id, null, "JOIN")
    );
    pushToAccounts(
        recipients,
        makeLobbyPartyData(lobby.id, session.account_id, buildPartyDefs(session), "PARTY")
    );

    res.send();
});

// POST /lobby/decline/:session_key
// Body: integer lobby_id whose invite is being declined (sent as text/plain).
LobbyRouter.post("/decline/:session_key", (req, res) => {
    const session = requireSession(req);
    if (!session) {
        res.sendStatus(401);
        return;
    }
    const lobby_id = Number(readBody(req));
    if (!Number.isFinite(lobby_id)) {
        res.sendStatus(400);
        return;
    }

    const lobby = lobbies.get(lobby_id);
    if (!lobby) {
        res.send();
        return;
    }

    if (!lobby.members.delete(session.account_id)) {
        res.send();
        return;
    }
    pushToAccounts(
        allLobbyAccountIds(lobby),
        makeLobbyData(lobby.id, session.account_id, null, "DECLINE")
    );

    res.send();
});

// POST /lobby/options/:session_key
// Body: LobbyOptionsData JSON (sent as text/plain). Updates lobby metadata;
// fans out OPTIONS. Owner-only — see guard below.
LobbyRouter.post("/options/:session_key", (req, res) => {
    const session = requireSession(req);
    if (!session) {
        res.sendStatus(401);
        return;
    }
    const data = readBody(req);
    if (!data || typeof data !== "object") {
        res.sendStatus(400);
        return;
    }
    const lobby_id = Number(data.lobby_id);
    if (!Number.isFinite(lobby_id)) {
        res.sendStatus(400);
        return;
    }

    const lobby = lobbies.get(lobby_id);
    if (!lobby) {
        res.send();
        return;
    }
    // Deliberate divergence from Java: only the lobby owner may mutate
    // metadata. The Java reference accepted /options from any session,
    // which would let a hostile client rewrite display_name / scene /
    // timer / msg in someone else's lobby.
    if (lobby.id !== session.account_id) {
        res.sendStatus(403);
        return;
    }

    lobby.display_name = String(data.display_name ?? lobby.display_name);
    lobby.scene = String(data.scene ?? lobby.scene);
    lobby.timer = Number(data.timer ?? lobby.timer);
    lobby.msg = data.msg != null ? String(data.msg) : lobby.msg;

    pushToAccounts(
        allLobbyAccountIds(lobby),
        makeLobbyOptionsData(lobby, session.account_id, session.display_name, "OPTIONS")
    );

    res.send();
});

function readyHandler(ready: boolean): (req: any, res: any) => void {
    return (req, res) => {
        const session = requireSession(req);
        if (!session) {
            res.sendStatus(401);
            return;
        }
        const lobby_id = Number(readBody(req));
        if (!Number.isFinite(lobby_id)) {
            res.sendStatus(400);
            return;
        }

        const lobby = lobbies.get(lobby_id);
        if (!lobby) {
            res.send();
            return;
        }
        const member = lobby.members.get(session.account_id);
        if (!member) {
            res.send();
            return;
        }
        member.ready = ready;

        pushToAccounts(
            allLobbyAccountIds(lobby),
            makeLobbyData(lobby.id, session.account_id, null, ready ? "READY" : "UNREADY")
        );
        res.send();
    };
}

LobbyRouter.post("/ready/:session_key", readyHandler(true));
LobbyRouter.post("/unready/:session_key", readyHandler(false));
