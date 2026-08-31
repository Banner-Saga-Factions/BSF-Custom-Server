import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { AchievementTypes, GameModes, ServerClasses, DEFAULT_TURN_TIMER_SEC } from "../../const";
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../auth/auth";
import { asyncRouter } from "../../http/asyncRouter";
import { addRenown, saveRoster } from "../../db/account";
import { saveBattle } from "../../db/battles";
import { applyBattleRankingUpdate, getOrCreateRanking } from "../../db/ranking";
import { ELO_BEGIN, calculateNewElo } from "./ranking";
import { computeRenownAwards } from "./renownAwards";
import { buildOrderedPartyDefs } from "../account";
import type { ChatMessage } from "../chat";

const generateBattleId = () => {
    return crypto.randomBytes(10).toString("hex");
};

let _debugPartyLimit: number | null = null;
export function setDebugPartyLimit(n: number | null) { _debugPartyLimit = n; }

let _debugFastTimer = process.env.NODE_ENV !== "production";
export function setDebugFastTimer(enabled: boolean) { _debugFastTimer = enabled;}

// Seconds this side gets per turn, ready to put on the wire.
//
// A side that names no value is given the number the game itself sends when nothing
// special has been chosen — that is only the handful of internal call sites that build
// a battle without going through the queue.
//
// The fast-timer debug switch shortens a real clock to 15 seconds for quicker testing,
// but MUST leave a zero alone. It defaults to on whenever NODE_ENV is not "production"
// (tests included), so without the carve-out a player who asked for no clock would be
// given a 15-second one on every developer machine — the exact bug #213 is about.
function resolveTurnTimer(requested: number | undefined): number {
    const sec = typeof requested === "number" && Number.isFinite(requested) && requested >= 0
        ? requested
        : DEFAULT_TURN_TIMER_SEC;
    if (sec === 0) return 0;
    return _debugFastTimer ? 15 : sec;
}

export const BattleRouter = asyncRouter();

// Per-turn server-side deadline. If the party expected to act next doesn't advance the turn
// before this fires, the stalled side is surrendered. Stops a crashed/disconnected client
// from freezing a match (and leaking the Battle object) for the full 30-min session TTL.
//
// This is NOT a clock. The clock belongs to the player and runs in their own game; when it
// runs out their game ends their turn for them. This is only here to notice somebody who has
// gone. So it is built from the waiting player's OWN chosen turn length plus enough headroom
// for a slow answer — anyone still silent a full minute past their own clock is not thinking.
//
// Before #213 it was a flat 90 seconds, a figure the 2026-05-11 audit picked as "the in-game
// timer values (30s/45s) plus headroom" — from the seat-based constants that issue removed.
const TURN_DEADLINE_GRACE_MS = 60_000;

// ...and when the waiting player asked for NO clock, there is nothing to build a deadline
// from, and surrendering them for thinking is precisely the promise they were made. So we
// only look in on them: while both games are still connected the battle is left alone and
// checked again later; once a session has gone the battle is swept, which is the job this
// deadline existed for in the first place (#213).
const NO_TIMER_SWEEP_MS = 10 * 60_000;

// Per-side match metadata. The matchmaker hands a two-element array to
// addBattle so each player's BattlePartyData carries their OWN current
// power and OWN pre-match Elo — pre-M2 both sides shared a single power
// and elo was hardcoded to 0 (QUICK) or 1000 (RANKED).
// `timer` is optional so the many existing `[{ power, elo }, ...]` call sites keep working;
// a side that does not name one is given the value the game itself sends by default.
export type PerSideMatchData = { power: number; elo: number; timer?: number };

// The maps we are willing to put a battle on. Every name here has been watched
// loading in the running game; the rest of the maps the game ships are simply
// unverified, which is not the same as broken. Widening this list is #200's job,
// and it needs someone to sit in front of the game and look, not a code change.
//
// Why an unrecognised name is refused rather than passed along: the game looks the
// name up in its own map index and, on a miss, abandons the whole match with
// "Invalid scene id" (VersusFindMatchState). A name we cannot vouch for therefore
// risks breaking the battle for BOTH players, where falling back to a known map
// costs only that one player's map choice.
export const BATTLE_SCENES: readonly string[] = [
    "wall",
    "mead_house",
    "greathall",
    "beach",
    "proving_grounds",
];

export const isKnownScene = (scene: unknown): scene is string =>
    typeof scene === "string" && BATTLE_SCENES.includes(scene);

const pickRandomScene = (): string =>
    BATTLE_SCENES[Math.floor(Math.random() * BATTLE_SCENES.length)];

// Extras the matchmaker can hand a new battle. Optional as a whole, so the many
// existing `new Battle(sessions, mode, perSide)` call sites keep working unchanged.
export type BattleOptions = {
    // True only when BOTH players asked for a friend match (#205). A friendly
    // battle pays no renown and does not advance units' kill counts; it does
    // still move both players' rating and win/loss record.
    friendly?: boolean;
    // The map the friend lobby chose. Honoured when BATTLE_SCENES recognises it,
    // otherwise a random known map is used instead.
    scene?: string;
};

export class Battle {
    battle_id: string;
    parties: any = {};
    type: GameModes;
    tourney_id: number;
    // Kept as a single scalar for log/debug parity with pre-M2 code.
    // Set to the higher of the two perSide powers — see constructor.
    // Per-side power lives on BattlePartyData; renownAwards.ts already
    // reads each side independently from the BattlePartyData, so this
    // field doesn't influence award math.
    power: number;
    perSide: PerSideMatchData[];
    turns: any[] = [];
    turnNum: number = 0;
    nextExecutionId: number = 1; // TODO: set properly in constructor
    aliveUnits: any = {};
    winner: number | null = null;
    // Mutual kill-confirmation (#18). killedparty account_id → entity id → bitmask of
    // the party_indexes that have reported that entity dead. A unit is only treated as
    // killed once BOTH players have reported it (value === killMask), so one modified
    // client can't fabricate the opponent's deaths. Keyed by killedparty first because
    // entity ids (roster ids like "archer_start_0") can repeat across the two players.
    killReports: Record<string, Record<string, number>> = {};
    // Per-unit kill tally for the persistent KILLS stat (#99). killerparty account_id →
    // killer unit id → confirmed kills it scored THIS battle. Only opposing, mutually
    // confirmed kills count (see applyKillReport); applied to roster_json at endgame so a
    // unit can reach its promotion threshold. Separate from killReports (about removing dead
    // units) and from the aliveUnits-delta counts used for renown.
    unitKillCounts: Record<string, Record<string, number>> = {};
    // #99: the killer the FIRST client attributed each death to (killedparty account_id →
    // entity id → killer unit id). A kill is only credited once BOTH clients agree on the
    // killer, so a lone modified client can't mis-attribute (funnel) kills onto a favored
    // unit. Separate from killReports (death confirmation, keyed on entity only).
    killReportKillers: Record<string, Record<string, string>> = {};
    // One-way flag that flips to true the moment a battle finalizes.
    // Acts as a guard: if two "last-unit-killed" messages arrive at almost the same time,
    // only the first one runs the endgame logic; the second sees the flag set and skips.
    // Same flag protects against /killed and /exit (surrender) racing each other.
    endgameStarted: boolean = false;
    // Set by finalizeSurrender so endgame() can record battle_surrender on the row.
    endedBySurrender: boolean = false;
    // True when both players arranged this match between themselves (#205). Set by the
    // matchmaker, which is the only place that can see BOTH sides' requests; the battle
    // itself only knows one match type. Read at endgame to withhold renown and unit
    // kill credit, and sent to the clients on BattleCreateData.
    friendly: boolean = false;
    scene: string = "";
    startedAt: Date = new Date();

    private turnDeadline?: NodeJS.Timeout;

    constructor(
        partySessions: Session[],
        GameMode: GameModes,
        perSide: PerSideMatchData[],
        opts: BattleOptions = {},
    ) {
        this.battle_id = generateBattleId();
        this.parties = {};
        this.type = GameMode;
        this.perSide = perSide;
        this.friendly = opts.friendly === true;
        this.power = Math.max(perSide[0]?.power ?? 0, perSide[1]?.power ?? 0);
        // Friend matches sit on the same ladder as quick play, which is the one the
        // queue reads ratings from and the one the leaderboard shows. Ladder 1 is
        // where ranked results go today and nothing reads it — that split is #198's
        // to fix, so leave the RANKED/TOURNEY half of this alone.
        this.tourney_id = (this.type === GameModes.QUICK || this.type === GameModes.FRIEND) ? 0 : 1;

        partySessions.forEach((session, idx) => {
            session.battle_id = this.battle_id;
            let party = this.createBattlePartyData(session, idx);
            this.parties[session.session_key] = party;
            this.aliveUnits[String(session.account_id)] = party.defs.map((entity) => entity.id);
        });
        // Use the map the players picked when we recognise it; otherwise fall back to a
        // random known one rather than send a name the game may refuse (see BATTLE_SCENES).
        if (isKnownScene(opts.scene)) {
            this.scene = opts.scene;
        } else {
            if (opts.scene) {
                console.warn(`[BATTLE] ignoring unrecognised map ${JSON.stringify(opts.scene)} — picking a known one instead`);
            }
            this.scene = pickRandomScene();
        }

        let newBattle: BattleData.BattleCreateData = {
            class: ServerClasses.BATTLE_CREATE_DATA,
            user_id: 0,
            battle_id: this.battle_id,
            tourney_id: this.tourney_id,
            scene: this.scene,
            friendly: this.friendly,
            // #32: redact session keys on the wire. The original 2013 server sent each
            // party's real session_key here (capture 0058_s.txt), leaking the opponent's
            // auth token. The client never reads the field, so we keep it for wire-shape
            // parity but blank the value.
            parties: Object.values(this.parties).map((p: any) => ({ ...p, session_key: "" })),
            ...this.setReliableMessageData("_create"),
        };

        const partyUserIds = newBattle.parties.map((p: any) => `${p.display_name}=${p.user}`).join(', ');
        console.log(`[BATTLE] Created battle_id=${newBattle.battle_id} type=${this.type} friendly=${this.friendly} map=${this.scene} with ${newBattle.parties.length} parties [${partyUserIds}]`);

        partySessions.forEach((session) => {
            session.pushData(newBattle);
        });
    }

    setReliableMessageData(reliable_msg_postfix: string): BattleData.ReliableMsg {
        return {
            reliable_msg_id: this.battle_id + reliable_msg_postfix,
            reliable_msg_target: null,
            timestamp: new Date().getTime(),
        };
    }

    setBaseBattleData(
        reliable_msg_postfix: string,
        server_class: ServerClasses,
        user_id: number
    ): BattleData.BaseBattleData {
        return {
            ...this.setReliableMessageData(reliable_msg_postfix),
            class: server_class,
            battle_id: this.battle_id,
            user_id: user_id,
        };
    }

    private createBattlePartyData(session: Session, idx: number): BattlePartyData {
        if (!session?.accountData) {
            throw new Error(`createBattlePartyData: no active session for user_id=${session.user_id}`);
        }
        const acc = session.accountData;

        // buildOrderedPartyDefs preserves the player's chosen party arrangement
        // order, which drives turn order on the client (issue #71). The old
        // roster.filter pattern silently reordered by roster grid position.
        const filteredDefs = buildOrderedPartyDefs(acc.roster_json, acc.party_ids_json)
            .slice(0, _debugPartyLimit ?? Infinity);

        console.log(`[BATTLE] User ${session.user_id} (account_id=${session.account_id}): ${filteredDefs.length}/${acc.roster_json.length} units selected${_debugPartyLimit !== null ? ` (capped at ${_debugPartyLimit})` : ""}`);

        const side = this.perSide[idx] ?? { power: 0, elo: 0 };
        return {
            class: ServerClasses.BATTLE_PARTY_DATA,
            // Use 32-bit account_id — matches original server format; game client uses this
            // for entity prefixes and both clients must agree on the value.
            user: session.account_id,
            team: String(session.account_id),
            display_name: session.display_name,
            defs: filteredDefs,
            match_handle: session.match_handle,
            party_index: idx,
            elo: side.elo,
            power: side.power,
            session_key: session.session_key,
            battle_count: 1,
            // Same ladder the battle itself is on — read the field rather than working it
            // out a second time. The two copies had already drifted apart once.
            tourney_id: this.tourney_id,
            // The player's own choice, sent on every /vs/start and carried here by the
            // matchmaker (#213). Before that this was invented from the seat — 30 for the
            // first player, 45 for the second — which was a misreading of a single 2013
            // capture in which the two players happened to have asked for those numbers.
            // The reference passes each side's own value through (VsWorker.java:701-703).
            timer: resolveTurnTimer(side.timer),
            vs_type: this.type,
        };
    }

    refreshTurnDeadline(actorKey: string): void {
        this.clearTurnDeadline();
        // The player we are waiting on is the one who did NOT just act, and it is their own
        // chosen turn length that decides how long they get. Read it here rather than in the
        // callback so the delay and the decision are made from the same value.
        const stuckKey = Object.keys(this.parties).find(k => k !== actorKey);
        // Read the value already settled when the party was built, not the request — by this
        // point it has been through resolveTurnTimer once and is what that player's game is
        // actually counting down.
        const stored = stuckKey ? this.parties[stuckKey]?.timer : undefined;
        const stuckTimerSec: number = typeof stored === "number" ? stored : DEFAULT_TURN_TIMER_SEC;
        const noClock = stuckTimerSec === 0;
        const delayMs = noClock
            ? NO_TIMER_SWEEP_MS
            : stuckTimerSec * 1000 + TURN_DEADLINE_GRACE_MS;

        this.turnDeadline = setTimeout(() => {
            this.turnDeadline = undefined;
            if (this.endgameStarted) return;
            const actorSession = sessionHandler.getSession("session_key", actorKey);
            const stuckSession = stuckKey ? sessionHandler.getSession("session_key", stuckKey) : undefined;
            if (!actorSession || !stuckSession) {
                console.warn(`[BATTLE] turn deadline: session(s) gone for battle ${this.battle_id}, sweeping registry`);
                battleHandler.removeBattle(this.battle_id);
                return;
            }
            // Both games are still connected and this player was promised no clock. Leave
            // them to think and look in again later — never surrender them (#213).
            if (noClock) {
                console.log(`[BATTLE] no-clock check: ${stuckSession.display_name} is still here, leaving battle ${this.battle_id} alone`);
                this.refreshTurnDeadline(actorKey);
                return;
            }
            console.warn(`[BATTLE] turn deadline expired after ${delayMs / 1000}s: ${stuckSession.display_name} surrenders, ${actorSession.display_name} wins (battle ${this.battle_id})`);
            finalizeSurrender({ battle: this, session: stuckSession, opponent: actorSession })
                .catch(err => console.error("[BATTLE] turn deadline finalizeSurrender failed:", err));
        }, delayMs);
        this.turnDeadline.unref();
    }

    clearTurnDeadline(): void {
        if (this.turnDeadline) {
            clearTimeout(this.turnDeadline);
            this.turnDeadline = undefined;
        }
    }

    // Bitmask with one bit per party (0b11 for the usual 2-player battle). A unit is
    // "fully killed" only once every party_index has reported it dead.
    private get killMask(): number {
        return (1 << Object.keys(this.parties).length) - 1;
    }

    // Record one client's report that `entity` (owned by killedparty) was killed.
    // A kill only counts once BOTH players report the same entity (mutual confirmation,
    // #18) — so a single modified client can't fabricate the opponent's deaths. On the
    // confirming report the unit is removed from the killed party's alive list and, if
    // that empties the party, the winner is derived from server state (the party that
    // still has units) rather than the client-supplied killerparty (#19).
    // Set BSF_KILL_CONFIRM_SINGLE=true to revert to the old single-report behavior.
    applyKillReport(args: {
        killedparty: number;
        killerparty: number;
        entity: string;
        killer: string;
        reporterPartyIndex: number;
    }): { confirmed: boolean; finished: boolean } {
        const { killedparty, killerparty, killer, entity, reporterPartyIndex } = args;
        const kp = String(killedparty);
        const mask = this.killMask;
        if (!this.killReports[kp]) this.killReports[kp] = {};
        const reports = this.killReports[kp];

        // Already fully confirmed earlier → redundant report, no-op.
        if (reports[entity] === mask) return { confirmed: false, finished: false };

        const single = process.env.BSF_KILL_CONFIRM_SINGLE === "true";
        const before = reports[entity] ?? 0;
        const after = before | (1 << reporterPartyIndex);
        const confirmed = single || after === mask;
        reports[entity] = confirmed ? mask : after;

        // #99: remember the killer the FIRST report of this death named, so we can require
        // the confirming report to AGREE before crediting a kill (anti mis-attribution).
        if (!this.killReportKillers[kp]) this.killReportKillers[kp] = {};
        if (before === 0) this.killReportKillers[kp][entity] = killer;
        const firstKiller = this.killReportKillers[kp][entity];

        console.log(`[BATTLE] kill report: party_index=${reporterPartyIndex} entity=${entity} killedparty=${kp} mask=${reports[entity]}/${mask}${confirmed ? " CONFIRMED" : ""}`);

        if (!confirmed) return { confirmed: false, finished: false };

        // #99: credit the killer unit with this confirmed kill — but only for an OPPOSING
        // kill (killerparty !== killedparty) with a real killer id, AND only when both
        // clients agree on who the killer was (single-report mode trusts the lone report).
        // Runs once per entity: the "already fully confirmed" early-return above prevents
        // any double count. The killer-agreement check gates ONLY this tally — it never
        // affects the death removal / winner logic below, so a killer mismatch still
        // confirms the death (the unit really died) and can't stall the battle.
        const killerKey = String(killerparty);
        const killerAgreed = single || killer === firstKiller;
        if (killer && killerKey !== kp && killerAgreed) {
            if (!this.unitKillCounts[killerKey]) this.unitKillCounts[killerKey] = {};
            this.unitKillCounts[killerKey][killer] = (this.unitKillCounts[killerKey][killer] ?? 0) + 1;
        } else if (killer && killerKey !== kp && !killerAgreed) {
            console.warn(`[BATTLE] kill credit skipped: killer mismatch entity=${entity} (first="${firstKiller}", confirming="${killer}")`);
        }

        // Remove the confirmed-dead unit from the killed party's alive list (once).
        const alive: string[] | undefined = this.aliveUnits[kp];
        if (Array.isArray(alive)) {
            const idx = alive.indexOf(entity);
            if (idx !== -1) alive.splice(idx, 1);
        }

        const finished = Array.isArray(alive) && alive.length === 0;
        if (finished) {
            // #19: winner = the party that still has units (the one that is NOT the
            // emptied killedparty). Server-derived; never the client's killerparty.
            const winnerKey = Object.keys(this.aliveUnits).find((k) => k !== kp);
            this.winner = winnerKey !== undefined ? Number(winnerKey) : null;
        }
        return { confirmed: true, finished };
    }
}

// MED-1: const instead of var
const battles: Record<string, Battle> = {};

export const battleHandler = {
    getBattles: (): Battle[] => {
        return Object.values(battles);
    },
    addBattle: (parties: Session[], GameMode: GameModes, perSide: PerSideMatchData[], opts: BattleOptions = {}) => {
        const battle = new Battle(parties, GameMode, perSide, opts);
        battles[battle.battle_id] = battle;
        return battle;
    },
    removeBattle: (battle_id: string) => {
        const battle = battles[battle_id];
        if (battle) battle.clearTurnDeadline();
        delete battles[battle_id];
    },
    getBattle: (battle_id: string): Battle | undefined => {
        return battles[battle_id];
    },
    getOpponent: (battle_id: string, session_key: string): Session | undefined => {
        const battle = battleHandler.getBattle(battle_id);
        if (!battle) return undefined;
        const opponentKey = Object.keys(battle.parties).find((k) => k !== session_key);
        return sessionHandler.getSession("session_key", opponentKey);
    },
};

BattleRouter.use((req, res, next) => {
    const battle = battleHandler.getBattle(req.body.battle_id);
    if (!battle) {
        res.sendStatus(404);
        return;
    }
    (req as any).battle = battle;

    const sessionKey = (req as any).session.session_key;
    if (!(sessionKey in battle.parties)) {
        res.sendStatus(403);
        return;
    }

    const opponent = battleHandler.getOpponent(battle.battle_id, sessionKey);

    // HIGH-3: /battle/exit is allowed even when the opponent has already left.
    // All other routes push data to the opponent and require it to be present.
    if (!opponent && !req.path.startsWith("/exit") && !req.path.startsWith("/surrender")) {
        res.sendStatus(410); // Gone — opponent disconnected
        return;
    }

    (req as any).opponent = opponent;
    next();
});

BattleRouter.post("/ready/:session_key", (req, res) => {
    const data = req as any;
    const readyData: BattleData.BaseBattleData = (data.battle as Battle).setBaseBattleData(
        `_ready_${data.session.account_id}`,
        ServerClasses.BATTLE_READY_DATA,
        data.session.account_id
    );
    data.opponent.pushData(readyData);
    res.send();
});

BattleRouter.post("/deploy/:session_key", (req, res) => {
    const data = req as any;

    // MED-2: validate tiles before iterating
    if (!Array.isArray(req.body.tiles)) {
        res.sendStatus(400);
        return;
    }
    const tiles = req.body.tiles;
    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });

    const deployData = {
        ...(data.battle as Battle).setBaseBattleData(
            `_deploy_${data.session.account_id}`,
            ServerClasses.BATTLE_DEPLOY_DATA,
            data.session.account_id
        ),
        tiles,
    };
    console.log(`[BATTLE-DEPLOY] ${data.session.display_name} (account_id=${data.session.account_id}) deployed ${tiles.length} tiles → opponent`);
    data.opponent.pushData(deployData);
    res.send();
});

BattleRouter.post("/sync/:session_key", (req, res) => {
    const data = req as any;
    const battle: Battle = data.battle;

    const turn = parseInt(req.body.turn, 10);
    if (isNaN(turn) || turn < 0) {
        res.sendStatus(400);
        return;
    }
    if (!battle.turns[turn]) battle.turns[turn] = [];

    const syncData: BattleData.BattleSyncData = {
        ...battle.setBaseBattleData(
            `_sync_${data.session.account_id}_${turn}`,
            ServerClasses.BATTLE_SYNC_DATA,
            data.session.account_id
        ),
        turn,
        entity: req.body.entity,
        ordinal: 0,
        team: String(data.session.account_id),
        hash: req.body.hash,
        hash_str: null,
    };
    console.log(`[BATTLE-SYNC] ${data.session.display_name} (account_id=${data.session.account_id}) turn=${turn} hash=${req.body.hash} entity=${req.body.entity}`);
    data.opponent.pushData(syncData);
    battle.refreshTurnDeadline(data.session.session_key);
    res.send();
});

BattleRouter.post("/query/:session_key", (req, res) => {
    const battle: Battle = (req as any).battle;

    // HIGH-6: validate turn before indexing the sparse turns array
    const turn = parseInt(req.body.turn, 10);
    if (isNaN(turn) || turn < 0) {
        res.sendStatus(400);
        return;
    }
    const turnData = battle.turns[turn];
    if (!Array.isArray(turnData)) {
        // The opponent simply has not moved yet. This is the ordinary case, not a failure:
        // the asking game only ever sends this because its opponent's clock ran out
        // (BattleStateTurnRemote is the sole caller), which happens in any battle where
        // somebody uses their whole turn.
        //
        // Answering 404 made that ordinary wait look like a broken server. The game re-sends
        // a 404 every 2 seconds with no attempt cap, AND counts each one as a network
        // failure — and failures spanning more than 5 seconds with no success between them
        // raise the "network problem" overlay (HttpErrorState; HttpCommunicator.as:51-56
        // treats any status at or above 401 except 500 as a failure).
        //
        // An empty 200 is what the game already receives when the turn IS ready — the moves
        // themselves go out over the long poll, never in this reply — so it cannot tell the
        // two apart. It just asks again in 5 seconds instead of 2, and counts it as fine.
        res.send();
        return;
    }

    turnData.forEach((action: any) => {
        action.timestamp = new Date().getTime();
    });
    (req as any).session.pushData(...turnData);
    res.send();
});

BattleRouter.post("/move/:session_key", (req, res) => {
    const data = req as any;
    const battle: Battle = data.battle;

    // MED-2: validate tiles
    if (!Array.isArray(req.body.tiles)) {
        res.sendStatus(400);
        return;
    }
    // HIGH-7: validate turn and ensure slot is initialised before push
    const turn = parseInt(req.body.turn, 10);
    if (isNaN(turn) || turn < 0) {
        res.sendStatus(400);
        return;
    }

    const tiles = req.body.tiles;
    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });

    const moveData: BattleData.BattleMoveData = {
        ...battle.setBaseBattleData(
            `_move_${data.session.account_id}_${turn}`,
            ServerClasses.BATTLE_MOVE_DATA,
            data.session.account_id
        ),
        turn,
        entity: req.body.entity,
        ordinal: req.body.ordinal,
        tiles,
    };

    if (!battle.turns[turn]) battle.turns[turn] = [];
    battle.turns[turn].push(moveData);
    console.log(`[BATTLE-ACTION] MOVE: ${data.session.display_name} → opponent (pushing to queue)`);
    data.opponent.pushData(moveData);
    battle.refreshTurnDeadline(data.session.session_key);
    res.send();
});

BattleRouter.post("/action/:session_key", (req, res) => {
    const data = req as any;
    const battle: Battle = data.battle;

    // MED-2: validate tiles
    if (!Array.isArray(req.body.tiles)) {
        res.sendStatus(400);
        return;
    }
    // HIGH-7: validate turn and ensure slot is initialised before push
    const turn = parseInt(req.body.turn, 10);
    if (isNaN(turn) || turn < 0) {
        res.sendStatus(400);
        return;
    }

    const tiles = req.body.tiles;
    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });

    const actionData: BattleData.BattleActionData = {
        ...battle.setBaseBattleData(
            `/${data.session.account_id}/${turn}`,
            ServerClasses.BATTLE_ACTION_DATA,
            data.session.account_id
        ),
        action: req.body.action,
        executed_id: req.body.executed_id,
        level: req.body.level,
        target_ids: req.body.target_ids,
        tiles,
        terminator: req.body.terminator,
        turn,
        entity: req.body.entity,
        ordinal: req.body.ordinal,
    };

    if (!battle.turns[turn]) battle.turns[turn] = [];
    battle.turns[turn].push(actionData);
    data.opponent.pushData(actionData);
    battle.refreshTurnDeadline(data.session.session_key);
    res.send();
});

BattleRouter.post("/killed/:session_key", (req, res) => {
    const data = req as any;
    const battle: Battle = data.battle;

    const killData: BattleData.BattleKilledData = {
        ...battle.setBaseBattleData(
            `_killed_${data.session.account_id}_${req.body.killedparty}_${req.body.entity}`,
            ServerClasses.BATTLE_KILLED_DATA,
            data.session.account_id
        ),
        turn: req.body.turn,
        entity: req.body.entity,
        ordinal: req.body.ordinal,
        killedparty: req.body.killedparty,
        killer: req.body.killer,
        killerparty: req.body.killerparty,
    };

    data.opponent.pushData(killData);

    // M-4: validate killedparty/killerparty are known account IDs before processing state
    const knownIds = Object.keys(battle.aliveUnits);
    if (!knownIds.includes(String(req.body.killedparty)) || !knownIds.includes(String(req.body.killerparty))) {
        console.warn(`[BATTLE] /killed: unknown killedparty=${req.body.killedparty} or killerparty=${req.body.killerparty} — ignoring state update`);
        res.send();
        return;
    }

    // HIGH-5: process kill state BEFORE sending the response so any throw
    // doesn't attempt a second response on an already-completed request.
    //
    // #18/#19: a kill only counts once BOTH players have reported the same entity
    // (mutual confirmation in applyKillReport), and the winner is derived from which
    // party still has units — never from the client-supplied killerparty.
    if (!battle.endgameStarted) {
        const reporterPartyIndex = battle.parties[data.session.session_key]?.party_index;
        const { finished } = battle.applyKillReport({
            killedparty: Number(req.body.killedparty),
            killerparty: Number(req.body.killerparty),
            entity: req.body.entity,
            killer: req.body.killer,
            reporterPartyIndex,
        });
        // C-1: endgameStarted guards against a double endgame from concurrent kills.
        if (finished && !battle.endgameStarted) {
            battle.endgameStarted = true;
            battle.clearTurnDeadline();
            endgame(data)
                .catch(err => console.error("[BATTLE] endgame failed:", err))
                .finally(() => {
                    setTimeout(() => battleHandler.removeBattle(battle.battle_id), 30_000).unref();
                });
        } else if (!battle.endgameStarted) {
            battle.refreshTurnDeadline(data.session.session_key);
        }
    }
    res.send();
});

// Shared surrender finalization for /exit and /surrender. Bails if the battle has already
// finalized (endgameStarted guard) or if no opponent is present (endgame() requires both sides).
//
// Notifies the winner with BattleSurrenderData FIRST so their client FSM transitions to
// BattleStateFinish (per BattleFsm.as:273-289). Without that message, the subsequent
// BattleFinishedData is dropped because the winner is still in a turn-state, and they
// stay stuck in the battle screen.
export const finalizeSurrender = async (data: any): Promise<void> => {
    const battle: Battle = data.battle;
    if (battle.endgameStarted || !data.opponent) return;
    battle.endgameStarted = true;
    battle.endedBySurrender = true;
    battle.winner = data.opponent.account_id;
    battle.clearTurnDeadline();

    const surrenderData = {
        ...battle.setBaseBattleData(
            `_surrender_${data.session.account_id}`,
            ServerClasses.BATTLE_SURRENDER_DATA,
            data.session.account_id,
        ),
        turn: 0,
        entity: "",
        ordinal: 0,
    };
    data.opponent.pushData(surrenderData);

    await endgame(data)
        .catch(err => console.error("[BATTLE] surrender endgame failed:", err))
        .finally(() => {
            setTimeout(() => battleHandler.removeBattle(battle.battle_id), 30_000).unref();
        });
};

BattleRouter.post("/exit/:session_key", async (req, res) => {
    const data = req as any;
    const battle: Battle = data.battle;

    await finalizeSurrender(data);

    delete battle.parties[data.session.session_key];
    // C-2: clear battle_id so re-queuing and queue notifications work correctly
    data.session.battle_id = undefined;
    if (Object.keys(battle.parties).length === 0) battleHandler.removeBattle(battle.battle_id);
    res.json({ status: "success", battle_id: battle.battle_id });
});

BattleRouter.post("/surrender/:session_key", async (req, res) => {
    const data = req as any;
    await finalizeSurrender(data);
    res.send();
});

// #99: Return a CLONE of `roster` with each unit's KILLS stat raised by the kills it
// scored this battle (from Battle.unitKillCounts). Units that scored nothing are left
// as-is; a killer id with no matching roster unit is skipped (hardening — never throws).
// Returns null when nothing changed so the caller can skip a redundant DB write. A unit
// with no KILLS entry gets one created (every shipped roster def already has one).
export function applyKillsToRoster(
    roster: any[] | undefined,
    killCounts: Record<string, number> | undefined,
): any[] | null {
    if (!Array.isArray(roster) || !killCounts) return null;
    let changed = false;
    // Unchanged units are returned by reference (not cloned); only changed units get fresh
    // objects, so the caller's original array is never touched (see endgame .then()).
    //
    // The stated reason for that used to be "roster units are replaced wholesale by saveRoster,
    // never mutated in place". That is NOT true and has not been for a while: promote, rename,
    // stat purchase and now unit/variation all mutate a roster unit in place. What actually
    // makes this safe is the window — a roster edit that lands between this copy and the
    // saveRoster below is overwritten by it, in the database and in memory both. The window is
    // milliseconds wide and the player is looking at the results screen, so it is not reachable
    // in practice; it is a real lost update rather than an impossible one.
    const updated = roster.map((unit) => {
        const count = unit?.id != null ? killCounts[unit.id] : 0;
        if (!count) return unit;
        changed = true;
        const stats = Array.isArray(unit.stats) ? unit.stats.map((s: any) => ({ ...s })) : [];
        const killStat = stats.find((s: any) => s.stat === "KILLS");
        if (killStat) killStat.value = (killStat.value ?? 0) + count;
        else stats.push({ class: "tbs.srv.data.Stat", stat: "KILLS", value: count });
        return { ...unit, stats };
    });
    return changed ? updated : null;
}

export const endgame = async (data: any): Promise<void> => {
    if (!data.session || !data.opponent) {
        console.error("[BATTLE] endgame called with missing session or opponent");
        return;
    }

    const battle: Battle = data.battle;

    // Identify winner/loser — battle.winner holds account_id (set by /killed or /exit)
    const winnerSession: Session = battle.winner === data.session.account_id ? data.session : data.opponent;
    const loserSession: Session  = winnerSession === data.session ? data.opponent : data.session;

    // Compute kills from party defs (initial size) vs remaining aliveUnits
    const winnerParty = Object.values(battle.parties).find((p: any) => p.user === winnerSession.account_id) as BattlePartyData | undefined;
    const loserParty  = Object.values(battle.parties).find((p: any) => p.user === loserSession.account_id)  as BattlePartyData | undefined;
    // #52: bail safely if a party object is missing (e.g. a spoofed winner with no
    // party, or an /exit cleanup racing this endgame) instead of crashing on .defs below.
    if (!winnerParty || !loserParty) {
        console.error("[BATTLE] endgame: missing party for winner or loser", {
            winner: winnerSession.account_id,
            loser: loserSession.account_id,
            battle_id: battle.battle_id,
        });
        return;
    }
    const winnerKills = loserParty.defs.length - (battle.aliveUnits[String(loserSession.account_id)]?.length ?? 0);
    const loserKills  = winnerParty.defs.length - (battle.aliveUnits[String(winnerSession.account_id)]?.length ?? 0);

    // #99: apply each side's confirmed per-unit kills to its persistent KILLS stat.
    // A friendly battle (#205) skips this, as the original server did — unit kill credit
    // is a payment, since it walks a unit towards a promotion.
    //
    // Do not read that as "we match the original here". It withheld far more: friendly
    // battles moved neither rating nor win/loss either, and were counted in a separate
    // column instead (BattleMonitor.java:1552-1566). Ours DO move rating and win/loss —
    // a deliberate divergence decided on 2026-08-27, of which only the no-payment half
    // was kept.
    // Each value is null when that side's units scored nothing (skips a needless write).
    const isFriendly: boolean = battle.friendly;
    const winnerRosterUpdate = isFriendly ? null : applyKillsToRoster(
        winnerSession.accountData?.roster_json,
        battle.unitKillCounts[String(winnerSession.account_id)],
    );
    const loserRosterUpdate = isFriendly ? null : applyKillsToRoster(
        loserSession.accountData?.roster_json,
        battle.unitKillCounts[String(loserSession.account_id)],
    );

    console.log(`[BATTLE] endgame: winner=${winnerSession.user_id} (${winnerKills} kills) loser=${loserSession.user_id} (${loserKills} kills)`);

    // Load both sides' ranking rows and compute new Elos before kicking off
    // the DB writes. Promise.allSettled (not Promise.all) so a one-off
    // failure on one side doesn't silently rewrite the other side's real
    // Elo down to ELO_BEGIN. If either load rejects, we still record the
    // match (renown, kills, history row) but skip the Elo update for it.
    const tourney_id = battle.tourney_id;
    let rankingLoadOk = false;
    let winnerEloBefore: number | null = null;
    let loserEloBefore:  number | null = null;
    let winnerEloAfter:  number | null = null;
    let loserEloAfter:   number | null = null;
    const [winnerRankingResult, loserRankingResult] = await Promise.allSettled([
        getOrCreateRanking(winnerSession.account_id, tourney_id),
        getOrCreateRanking(loserSession.account_id,  tourney_id),
    ]);
    if (winnerRankingResult.status === "fulfilled" && loserRankingResult.status === "fulfilled") {
        winnerEloBefore = winnerRankingResult.value.battle_elo;
        loserEloBefore  = loserRankingResult.value.battle_elo;
        winnerEloAfter  = calculateNewElo(winnerEloBefore, loserEloBefore, 1);
        loserEloAfter   = calculateNewElo(loserEloBefore,  winnerEloBefore, 0);
        rankingLoadOk = true;
        console.log(`[BATTLE] endgame: Elo ${winnerSession.display_name} ${winnerEloBefore}→${winnerEloAfter}, ${loserSession.display_name} ${loserEloBefore}→${loserEloAfter}`);
    } else {
        if (winnerRankingResult.status === "rejected") {
            console.error("[BATTLE] ranking load failed for winner; skipping Elo update:", winnerRankingResult.reason);
        }
        if (loserRankingResult.status === "rejected") {
            console.error("[BATTLE] ranking load failed for loser; skipping Elo update:", loserRankingResult.reason);
        }
    }

    // M1.5: compute renown awards once we have the pre-battle win_streak from
    // the ranking load above. A friendly battle (#205) zeroes every award.
    // EXPERT timer uses wall-clock; revisit if BattlePartyData.timer ever ticks
    // real per-side time.
    const winnerWinStreakBefore = winnerRankingResult.status === "fulfilled"
        ? winnerRankingResult.value.win_streak
        : 0;
    const awards = computeRenownAwards({
        winnerKills,
        loserKills,
        winnerPower: winnerParty.power,
        loserPower: loserParty.power,
        winnerWinStreakBefore,
        battleDurationSec: (Date.now() - battle.startedAt.getTime()) / 1000,
        loserSurrendered: battle.endedBySurrender,
        isFriendly,
    });
    const winnerRenown = awards.winnerTotal;
    const loserRenown  = awards.loserTotal;
    console.log(`[BATTLE] endgame: renown winner=+${winnerRenown} ${JSON.stringify(awards.winner)} loser=+${loserRenown} ${JSON.stringify(awards.loser)}`);

    // Strip session_key out of the parties snapshot before serialising —
    // session keys are auth material and shouldn't be written to the DB.
    const partiesForDb = Object.values(battle.parties).map((p: any) => {
        const { session_key, ...rest } = p;
        return rest;
    });

    // Message ordering matters here:
    //   1. Achievement progress goes out first — it's zero-delta today and doesn't need DB state.
    //   2. Then we save renown + battle row to SQLite.
    //   3. Only AFTER (2) succeeds do we push BattleFinishedData and RenownMessage.
    //      This prevents a "you earned 23 renown!" message reaching the client when
    //      the DB write actually failed — which would silently desync in-memory state from disk.
    //   4. If (2) fails, the .catch() block sends a fallback BattleFinishedData with
    //      total_renown=0 plus a chat message so the player isn't stuck on a black screen.
    // NOTE for whoever makes achievements real: the original skipped this block entirely
    // for a friendly battle (BattleMonitor.java:973). Nothing is wrong today because every
    // delta below is zero, so there is nothing to withhold — but the moment they carry a
    // real value this needs the same gate the renown and kill-credit paths have.
    // `isFriendly` is already in scope above.
    const ach_data: BattleData.AchievementProgressData[] = [];
    [winnerSession, loserSession].forEach((session: Session) => {
        for (const ach_type in AchievementTypes) {
            ach_data.push({
                class: ServerClasses.ACHIEVEMENT_PROGRESS_DATA,
                account_id: session.account_id,
                // Blank, not the real token: this AchievementProgressData goes to BOTH
                // players, so session.session_key would hand each one the opponent's auth
                // token (same leak #126 fixed for BattleCreateData, ~line 111). Client never reads it.
                session_key: "",
                delta: 0,
                total: 1,
                acquired: [],
                handle: `${battle.battle_id}.${ach_data.length}.${session.account_id}.${ach_type}`,
                battle_id: battle.battle_id,
                achievement_type: ach_type as AchievementTypes,
            });
        }
    });
    winnerSession.pushData(...ach_data);
    loserSession.pushData(...ach_data);

    // Persist to DB. RenownMessage + BattleFinishedData are pushed only after writes
    // succeed, so clients never see inflated totals without a backing row.
    // Ranking updates are conditional on rankingLoadOk so we never write
    // a fake Elo derived from a failed read.
    //
    // #43: these writes are NOT wrapped in a single transaction. If some land and one
    // rejects, the DB can end up "ahead" of memory by one side's renown — but the
    // in-memory renown is applied only in the .then() AFTER every write resolves, so on
    // a partial failure memory is left untouched (the .catch() sends total_renown:0 plus
    // a report-to-admin message) and re-syncs from the DB on the next /account/info load.
    // No currency is minted and no inflated total is ever shown, so we accept this
    // self-healing residual rather than add a multi-statement transaction primitive
    // across these five independent write helpers.
    // A friendly battle pays nobody, so it issues no renown writes at all. The write is
    // `renown = renown + ?` and a zero changes no row either way — but it still sits in
    // the group below whose failure sends both players the "report this to the admin"
    // message, and a battle that pays nothing should not be able to fail its ending on a
    // write it never needed.
    //
    // Deliberately narrowed to friendly battles rather than "skip any zero". An ordinary
    // loser who killed nothing also earns zero, and skipping theirs would thin out the
    // coverage of the tests that check renown is written against the exact provider id
    // string rather than the precision-lossy number (#146/#140).
    const writes: Promise<unknown>[] = [
        saveBattle({
            battle_id: battle.battle_id,
            battle_type: battle.type,
            battle_scene: battle.scene || null,
            battle_create_time: battle.startedAt.getTime(),
            battle_end_time: Date.now(),
            battle_victor_team: String(winnerSession.account_id),
            battle_surrender: battle.endedBySurrender,
            battle_turns: battle.turnNum || null,
            battle_renown: winnerRenown + loserRenown,
            winner_account_id: winnerSession.account_id,
            loser_account_id:  loserSession.account_id,
            winner_renown: winnerRenown,
            loser_renown:  loserRenown,
            winner_kills: winnerKills,
            loser_kills:  loserKills,
            winner_elo_before: winnerEloBefore,
            winner_elo_after:  winnerEloAfter,
            loser_elo_before:  loserEloBefore,
            loser_elo_after:   loserEloAfter,
            parties_json: JSON.stringify(partiesForDb),
        }),
    ];
    if (!isFriendly) {
        writes.push(
            addRenown(winnerSession.external_id_str, winnerRenown),
            addRenown(loserSession.external_id_str,  loserRenown),
        );
    }
    if (rankingLoadOk) {
        writes.push(
            applyBattleRankingUpdate({
                account_id: winnerSession.account_id,
                tourney_id,
                new_elo: winnerEloAfter!,
                won: true,
            }),
            applyBattleRankingUpdate({
                account_id: loserSession.account_id,
                tourney_id,
                new_elo: loserEloAfter!,
                won: false,
            }),
        );
    }
    // #99: persist the bumped rosters in the SAME Promise.all as renown/elo/battle row,
    // so the in-memory roster is only updated after the write resolves.
    if (winnerRosterUpdate) writes.push(saveRoster(winnerSession.external_id_str, winnerRosterUpdate));
    if (loserRosterUpdate)  writes.push(saveRoster(loserSession.external_id_str,  loserRosterUpdate));
    Promise.all(writes).then(() => {
        if (winnerSession.accountData) winnerSession.accountData.renown += winnerRenown;
        if (loserSession.accountData)  loserSession.accountData.renown  += loserRenown;
        // #99: in-memory roster updated only after the write resolves; on failure the
        // .catch() leaves it untouched, consistent with the renown=0 fallback.
        if (winnerRosterUpdate && winnerSession.accountData) winnerSession.accountData.roster_json = winnerRosterUpdate;
        if (loserRosterUpdate && loserSession.accountData)  loserSession.accountData.roster_json  = loserRosterUpdate;
        console.log(`[BATTLE] endgame: DB writes complete for battle ${battle.battle_id}`);

        // The client reads rewards[localBattleOrder] (= local player's party_index)
        // to find its own reward bundle, so the array must be indexed by party_index,
        // not by winner-first. Mixing those slots up makes a loser see the winner's
        // bonus icons (and vice versa).
        const rewardsByPartyIndex: any[] = [];
        rewardsByPartyIndex[winnerParty.party_index] = {
            achievements: {},
            awards: awards.winner,
            class: ServerClasses.BATTLE_REWARD_DATA,
            total_achievement_renown: 0,
            total_renown: winnerRenown,
        };
        rewardsByPartyIndex[loserParty.party_index] = {
            achievements: {},
            awards: awards.loser,
            class: ServerClasses.BATTLE_REWARD_DATA,
            total_achievement_renown: 0,
            total_renown: loserRenown,
        };

        const finishedTs = new Date().getTime();
        const battle_finished: BattleData.BattleFinishedData = {
            reliable_msg_id: `${battle.battle_id}_finished_0`,
            reliable_msg_target: null,
            timestamp: finishedTs,
            class: ServerClasses.BATTLE_FINISHED_DATA,
            battle_id: battle.battle_id,
            user_id: 0,
            victoriousTeam: String(battle.winner),
            total_renown: winnerRenown + loserRenown,
            rewards: rewardsByPartyIndex,
        };

        for (const { session, renown } of [
            { session: winnerSession, renown: winnerRenown },
            { session: loserSession,  renown: loserRenown  },
        ]) {
            const ts = new Date().getTime();
            session.pushData(
                {
                    reliable_msg_id: `renown_${session.account_id}_${ts}_${renown}`,
                    reliable_msg_target: null,
                    class: ServerClasses.RENOWN_MESSAGE,
                    timestamp: ts,
                    total: renown,
                    user_id: session.account_id,
                } as BattleData.RenownMessage,
                battle_finished,
            );
        }

        // #41: free the per-battle turn log now the battle is over. `turns` holds every
        // move/action/sync for the whole match (200KB+ for long games) and has no
        // post-game reader — the DB stores `turnNum` (a count), not this array. The
        // Battle object can linger in the registry after endgame, so drop the big field.
        // #30's future event log streams events as they happen, not from here, so this
        // is safe for it too.
        battle.turns = [];
    }).catch(err => {
        console.error("[BATTLE] endgame DB persistence failed:", err);

        // Fallback: clients still need a BattleFinishedData to exit the battle screen.
        // total_renown=0 is truthful (the row didn't save). Renown is NOT applied to
        // accountData so in-memory state doesn't diverge from the DB on restart.
        const finishedTs = new Date().getTime();
        const battle_finished_failed: BattleData.BattleFinishedData = {
            reliable_msg_id: `${battle.battle_id}_finished_0`,
            reliable_msg_target: null,
            timestamp: finishedTs,
            class: ServerClasses.BATTLE_FINISHED_DATA,
            battle_id: battle.battle_id,
            user_id: 0,
            victoriousTeam: String(battle.winner),
            total_renown: 0,
            rewards: [],
        };

        // Typed so it can't silently drift from the chat-route message shape (#51).
        const chatFallback: ChatMessage = {
            class: ServerClasses.CHAT_MESSAGE,
            msg: "Battle results could not be saved — please report this to the server admin.",
            room: "battle",
            user: 0,
            username: "[server]",
        };

        for (const session of [winnerSession, loserSession]) {
            const ts = new Date().getTime();
            session.pushData(
                chatFallback,
                {
                    reliable_msg_id: `renown_${session.account_id}_${ts}_0`,
                    reliable_msg_target: null,
                    class: ServerClasses.RENOWN_MESSAGE,
                    timestamp: ts,
                    total: 0,
                    user_id: session.account_id,
                } as BattleData.RenownMessage,
                battle_finished_failed,
            );
        }

        // #41: free the turn log on the failure path too — the battle is equally over.
        battle.turns = [];
    }).catch((err) => console.error("[BATTLE] endgame fallback handler also failed:", err));
};
