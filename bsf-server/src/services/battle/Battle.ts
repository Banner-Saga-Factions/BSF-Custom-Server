import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { AchievementTypes, GameModes, ServerClasses } from "../../const";
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../auth/auth";
import { Router } from "express";
import { addRenown } from "../../db/account";
import { saveBattle } from "../../db/battles";
import { applyBattleRankingUpdate, getOrCreateRanking } from "../../db/ranking";
import { ELO_BEGIN, calculateNewElo } from "./ranking";
import { computeRenownAwards } from "./renownAwards";
import { buildOrderedPartyDefs } from "../account";

const generateBattleId = () => {
    return crypto.randomBytes(10).toString("hex");
};

let _debugPartyLimit: number | null = null;
export function setDebugPartyLimit(n: number | null) { _debugPartyLimit = n; }

let _debugWeakUnits: boolean = false;
let _debugFastTimer = process.env.NODE_ENV !== "production";
export function setDebugWeakUnits(enabled: boolean) { _debugWeakUnits = enabled; }
export function isDebugWeakUnits(): boolean { return _debugWeakUnits; }
export function setDebugFastTimer(enabled: boolean) { _debugFastTimer = enabled;}

export const BattleRouter = Router();

// Per-turn server-side deadline. If the party expected to act next doesn't advance the turn
// before this fires, the stalled side is surrendered. Stops a crashed/disconnected client
// from freezing a match (and leaking the Battle object) for the full 30-min session TTL.
const TURN_LIMIT_MS = 90_000;

// Per-side match metadata. The matchmaker hands a two-element array to
// addBattle so each player's BattlePartyData carries their OWN current
// power and OWN pre-match Elo — pre-M2 both sides shared a single power
// and elo was hardcoded to 0 (QUICK) or 1000 (RANKED).
export type PerSideMatchData = { power: number; elo: number };

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
    // One-way flag that flips to true the moment a battle finalizes.
    // Acts as a guard: if two "last-unit-killed" messages arrive at almost the same time,
    // only the first one runs the endgame logic; the second sees the flag set and skips.
    // Same flag protects against /killed and /exit (surrender) racing each other.
    endgameStarted: boolean = false;
    // Set by finalizeSurrender so endgame() can record battle_surrender on the row.
    endedBySurrender: boolean = false;
    scene: string = "";
    startedAt: Date = new Date();

    private turnDeadline?: NodeJS.Timeout;

    constructor(partySessions: Session[], GameMode: GameModes, perSide: PerSideMatchData[]) {
        this.battle_id = generateBattleId();
        this.parties = {};
        this.type = GameMode;
        this.perSide = perSide;
        this.power = Math.max(perSide[0]?.power ?? 0, perSide[1]?.power ?? 0);
        this.tourney_id = this.type === "QUICK" ? 0 : 1;

        partySessions.forEach((session, idx) => {
            session.battle_id = this.battle_id;
            let party = this.createBattlePartyData(session, idx);
            this.parties[session.session_key] = party;
            this.aliveUnits[String(session.account_id)] = party.defs.map((entity) => entity.id);
        });
/*
const validScenes = [
    "mead_house",
    "greathall",  // add other valid map asset names here as we confirm them
    "beach",
    "wall",
    "proving_grounds",
];
*/
        // List of likely working map scene assets
        const validScenes = [
            "wall",
        ];
        this.scene = validScenes[Math.floor(Math.random() * validScenes.length)];

        let newBattle: BattleData.BattleCreateData = {
            class: ServerClasses.BATTLE_CREATE_DATA,
            user_id: 0,
            battle_id: this.battle_id,
            tourney_id: this.tourney_id,
            scene: this.scene,
            friendly: false,
            parties: Object.values(this.parties),
            ...this.setReliableMessageData("_create"),
        };

        const partyUserIds = newBattle.parties.map((p: any) => `${p.display_name}=${p.user}`).join(', ');
        console.log(`[BATTLE] Created battle_id=${newBattle.battle_id} with ${newBattle.parties.length} parties [${partyUserIds}]`);

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
        let filteredDefs = buildOrderedPartyDefs(acc.roster_json, acc.party_ids_json)
            .slice(0, _debugPartyLimit ?? Infinity);

        if (_debugWeakUnits) {
            filteredDefs = filteredDefs.map((unit: any) => ({
                ...unit,
                stats: unit.stats.map((s: any) => {
                    if (s.stat === "STRENGTH") return { ...s, value: 1 };
                    if (s.stat === "ARMOR") return { ...s, value: 0 };
                    return s;
                }),
            }));
        }

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
            tourney_id: this.type === "QUICK" ? 0 : 1,
            timer: _debugFastTimer ? 15: (idx === 0 ? 30 : 45),
            vs_type: this.type,
        };
    }

    refreshTurnDeadline(actorKey: string): void {
        this.clearTurnDeadline();
        this.turnDeadline = setTimeout(() => {
            this.turnDeadline = undefined;
            if (this.endgameStarted) return;
            const stuckKey = Object.keys(this.parties).find(k => k !== actorKey);
            const actorSession = sessionHandler.getSession("session_key", actorKey);
            const stuckSession = stuckKey ? sessionHandler.getSession("session_key", stuckKey) : undefined;
            if (!actorSession || !stuckSession) {
                console.warn(`[BATTLE] turn deadline: session(s) gone for battle ${this.battle_id}, sweeping registry`);
                battleHandler.removeBattle(this.battle_id);
                return;
            }
            console.warn(`[BATTLE] turn deadline expired: ${stuckSession.display_name} surrenders, ${actorSession.display_name} wins (battle ${this.battle_id})`);
            finalizeSurrender({ battle: this, session: stuckSession, opponent: actorSession })
                .catch(err => console.error("[BATTLE] turn deadline finalizeSurrender failed:", err));
        }, TURN_LIMIT_MS);
        this.turnDeadline.unref();
    }

    clearTurnDeadline(): void {
        if (this.turnDeadline) {
            clearTimeout(this.turnDeadline);
            this.turnDeadline = undefined;
        }
    }
}

// MED-1: const instead of var
const battles: Record<string, Battle> = {};

export const battleHandler = {
    getBattles: (): Battle[] => {
        return Object.values(battles);
    },
    addBattle: (parties: Session[], GameMode: GameModes, perSide: PerSideMatchData[]) => {
        const battle = new Battle(parties, GameMode, perSide);
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
        res.sendStatus(404);
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
    const party: string[] = battle.aliveUnits[req.body.killedparty];
    if (Array.isArray(party)) {
        // HIGH-4: guard indexOf returning -1 (spoofed/unknown entity id)
        const killed_idx = party.indexOf(req.body.entity);
        if (killed_idx === -1) {
            console.warn(`[BATTLE] entity "${req.body.entity}" not found in aliveUnits — ignoring`);
        } else {
            party.splice(killed_idx, 1);
            // C-1: guard against double endgame from rapid concurrent kill messages
            if (party.length === 0 && !battle.endgameStarted) {
                battle.endgameStarted = true;
                battle.winner = Number(req.body.killerparty);
                battle.clearTurnDeadline();
                endgame(data)
                    .catch(err => console.error("[BATTLE] endgame failed:", err))
                    .finally(() => {
                        setTimeout(() => battleHandler.removeBattle(battle.battle_id), 30_000).unref();
                    });
            }
        }
    }

    if (!battle.endgameStarted) {
        battle.refreshTurnDeadline(data.session.session_key);
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

const endgame = async (data: any): Promise<void> => {
    if (!data.session || !data.opponent) {
        console.error("[BATTLE] endgame called with missing session or opponent");
        return;
    }

    const battle: Battle = data.battle;

    // Identify winner/loser — battle.winner holds account_id (set by /killed or /exit)
    const winnerSession: Session = battle.winner === data.session.account_id ? data.session : data.opponent;
    const loserSession: Session  = winnerSession === data.session ? data.opponent : data.session;

    // Compute kills from party defs (initial size) vs remaining aliveUnits
    const winnerParty = Object.values(battle.parties).find((p: any) => p.user === winnerSession.account_id) as BattlePartyData;
    const loserParty  = Object.values(battle.parties).find((p: any) => p.user === loserSession.account_id)  as BattlePartyData;
    const winnerKills = loserParty.defs.length - (battle.aliveUnits[String(loserSession.account_id)]?.length ?? 0);
    const loserKills  = winnerParty.defs.length - (battle.aliveUnits[String(winnerSession.account_id)]?.length ?? 0);

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
    // the ranking load above. TODO: isFriendly derived from battle_type once
    // M3b lobby/friendly matches land — for now bsf-server only supports VS_NORMAL.
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
        isFriendly: false,
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
    const ach_data: BattleData.AchievementProgressData[] = [];
    [winnerSession, loserSession].forEach((session: Session) => {
        for (const ach_type in AchievementTypes) {
            ach_data.push({
                class: ServerClasses.ACHIEVEMENT_PROGRESS_DATA,
                account_id: session.account_id,
                session_key: session.session_key,
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
    const writes: Promise<unknown>[] = [
        addRenown(winnerSession.steam_id_str, winnerRenown),
        addRenown(loserSession.steam_id_str, loserRenown),
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
    Promise.all(writes).then(() => {
        if (winnerSession.accountData) winnerSession.accountData.renown += winnerRenown;
        if (loserSession.accountData)  loserSession.accountData.renown  += loserRenown;
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

        for (const session of [winnerSession, loserSession]) {
            const ts = new Date().getTime();
            session.pushData(
                {
                    class: ServerClasses.CHAT_MESSAGE,
                    msg: "Battle results could not be saved — please report this to the server admin.",
                    room: "battle",
                    user: 0,
                    username: "[server]",
                },
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
    }).catch((err) => console.error("[BATTLE] endgame fallback handler also failed:", err));
};
