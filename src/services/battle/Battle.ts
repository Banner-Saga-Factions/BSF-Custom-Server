import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { AchievementTypes, GameModes, ServerClasses } from "../../const";
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../auth/auth";
import { Router, Response } from "express";
import { getPartyInfo } from "../playerData";

const MAP_ROTATION = ["greathall", "proving_grounds"];
let nextSceneIndex = 0;
const getNextScene = () => {
    const scene = MAP_ROTATION[nextSceneIndex];
    nextSceneIndex = (nextSceneIndex + 1) % MAP_ROTATION.length;
    return scene;
};

type BattleTurnEvent = BattleData.BattleSyncData | BattleData.BattleMoveData | BattleData.BattleActionData;

type TurnState = {
    events: BattleTurnEvent[];
    executionIds: Set<number>;
    hashes: Set<number>;
    actors: string[];
};

export type BattleEndReason = "ELIMINATION" | "SURRENDER" | "DISCONNECT";

type BattleStats = {
    kills: Record<string, number>;
    startedAt: number;
    endedAt?: number;
};

const BASE_RENOWN = 5;
const KILL_RENOWN = 2;
const VICTORY_RENOWN = 10;

const generateBattleId = () => {
    return crypto.randomBytes(10).toString("hex");
};

export const BattleRouter = Router();

export class Battle {
    battle_id: string;
    parties: Record<string, BattlePartyData>;
    type: GameModes;
    tourney_id: number;
    turnStates: Record<number, TurnState> = {};
    aliveUnits: Record<string, string[]> = {};
    winner: string | null = null;
    scene: string;
    stats: BattleStats;
    state: "ACTIVE" | "FINISHED" = "ACTIVE";
    endReason?: BattleEndReason;
    private achievementCounter = 0;

    constructor(partySessions: Session[], GameMode: GameModes) {
        this.battle_id = generateBattleId();
        this.parties = {};
        this.type = GameMode;
        this.tourney_id = this.type === "QUICK" ? 0 : 1;
        this.scene = getNextScene();
        this.stats = { kills: {}, startedAt: Date.now() };

        partySessions.forEach((session, idx) => {
            session.battle_id = this.battle_id;
            let party = this.createBattlePartyData(session.user_id, idx);
            this.parties[session.session_key] = party;
            this.aliveUnits[`${party.user}`] = party.defs.map((entity) => entity.id);
        });
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

    private createBattlePartyData(user_id: number, idx: number): BattlePartyData {
        let session = sessionHandler.getSession("user_id", user_id);
        const { partyDefs, power } = getPartyInfo(user_id);

        let data: BattlePartyData = {
            class: ServerClasses.BATTLE_PARTY_DATA,
            user: user_id,
            team: `${user_id}`,
            display_name: session!.display_name,
            defs: partyDefs,
            match_handle: session!.match_handle,
            party_index: idx,
            elo: this.type === "QUICK" ? 0 : 1000, // do something else if not quick play
            power,
            session_key: session!.session_key,
            battle_count: 1,
            tourney_id: this.type === "QUICK" ? 0 : 1, // do something else if not quick play
            timer: 45,
            vs_type: this.type,
        };
        return data;
    }

    private getTurnState(turn: number): TurnState {
        if (!this.turnStates[turn]) {
            this.turnStates[turn] = {
                events: [],
                executionIds: new Set<number>(),
                hashes: new Set<number>(),
                actors: [],
            };
        }
        return this.turnStates[turn];
    }

    recordTurnEvent(turn: number, event: BattleTurnEvent, opts?: { executedId?: number; hash?: number }): boolean {
        const state = this.getTurnState(turn);
        if (typeof opts?.executedId === "number") {
            if (state.executionIds.has(opts.executedId)) {
                return false;
            }
            state.executionIds.add(opts.executedId);
        }
        if (typeof opts?.hash === "number") {
            state.hashes.add(opts.hash);
        }
        if (event.entity && !state.actors.includes(event.entity)) {
            state.actors.push(event.entity);
        }
        state.events.push(event);
        return true;
    }

    getTurnEvents(turn: number): BattleTurnEvent[] {
        return this.turnStates[turn]?.events ?? [];
    }

    private getParticipantSessions(): Session[] {
        return Object.keys(this.parties)
            .map((sessionKey) => sessionHandler.getSession("session_key", sessionKey))
            .filter((session): session is Session => Boolean(session));
    }

    private createAchievementEntry(
        session: Session,
        type: AchievementTypes,
        delta: number
    ): BattleData.AchievementProgressData {
        const handle = `${this.battle_id}.${this.achievementCounter++}.${session.user_id}.${type}`;
        return {
            class: ServerClasses.ACHIEVEMENT_PROGRESS_DATA,
            account_id: session.user_id,
            session_key: session.session_key,
            delta,
            total: delta,
            acquired: [],
            handle,
            battle_id: this.battle_id,
            achievement_type: type,
        };
    }

    private buildAchievementProgress(session: Session, didWin: boolean, kills: number): BattleData.AchievementProgressData[] {
        const achievements: BattleData.AchievementProgressData[] = [];
        achievements.push(this.createAchievementEntry(session, AchievementTypes.BATTLES, 1));
        if (didWin) {
            achievements.push(this.createAchievementEntry(session, AchievementTypes.WINS, 1));
        }
        if (kills > 0) {
            achievements.push(this.createAchievementEntry(session, AchievementTypes.UNIT_KILL, kills));
        }
        return achievements;
    }

    private finishBattle(winnerTeam: string | null, reason: BattleEndReason) {
        if (this.state === "FINISHED") return;
        this.state = "FINISHED";
        this.winner = winnerTeam;
        this.endReason = reason;
        this.stats.endedAt = Date.now();

        const participants = this.getParticipantSessions();
        const victoriousTeam = this.winner ?? "";
        participants.forEach((session) => {
            session.battle_id = undefined;
            const teamId = String(session.user_id);
            const didWin = victoriousTeam === teamId;
            const kills = this.stats.kills[teamId] ?? 0;
            const totalRenown = BASE_RENOWN + kills * KILL_RENOWN + (didWin ? VICTORY_RENOWN : 0);
            const renownMsg: BattleData.RenownMessage = {
                reliable_msg_id: `renown_${session.user_id}_${this.stats.endedAt}_${totalRenown}`,
                reliable_msg_target: null,
                class: ServerClasses.RENOWN_MESSAGE,
                timestamp: this.stats.endedAt!,
                total: totalRenown,
                user_id: session.user_id,
            };

            const rewards: BattleData.BattleRewardData = {
                class: ServerClasses.BATTLE_REWARD_DATA,
                achievements: [],
                awards: {
                    KILLS: kills,
                },
                total_achievement_renown: 0,
                total_renown: totalRenown,
            };

            const battleFinished: BattleData.BattleFinishedData = {
                ...this.setBaseBattleData(`_finished_${session.user_id}`, ServerClasses.BATTLE_FINISHED_DATA, session.user_id),
                victoriousTeam,
                total_renown: totalRenown,
                rewards: [rewards],
            };

            const achievements = this.buildAchievementProgress(session, didWin, kills);
            session.pushData(...achievements, renownMsg, battleFinished);
        });
    }

    handleKill(killedParty: number | string, killerParty: number | string, entityId: string) {
        const killedTeam = String(killedParty);
        const killerTeam = String(killerParty);
        const partyUnits = this.aliveUnits[killedTeam] ?? [];
        const idx = partyUnits.indexOf(entityId);
        if (idx !== -1) {
            partyUnits.splice(idx, 1);
        }
        this.aliveUnits[killedTeam] = partyUnits;
        this.stats.kills[killerTeam] = (this.stats.kills[killerTeam] ?? 0) + 1;

        if (!partyUnits.length) {
            this.finishBattle(killerTeam, "ELIMINATION");
        }
    }

    handleExit(session: Session, reason?: BattleEndReason): boolean {
        const sessionKey = session.session_key;
        const teamId = String(session.user_id);
        if (this.state === "ACTIVE") {
            const opponentKey = Object.keys(this.parties).find((key) => key !== sessionKey);
            const opponentParty = opponentKey ? this.parties[opponentKey] : undefined;
            const winningTeam = opponentParty ? String(opponentParty.user) : null;
            this.finishBattle(winningTeam, reason ?? "SURRENDER");
        }

        delete this.parties[sessionKey];
        delete this.aliveUnits[teamId];
        session.battle_id = undefined;

        return Object.keys(this.parties).length === 0;
    }
}

var battles: Record<string, Battle> = {};

export const battleHandler = {
    getBattles: (): Battle[] => {
        return Object.values(battles);
    },
    addBattle: (parties: Session[], GameMode: GameModes) => {
        let battle = new Battle(parties, GameMode);
        battles[battle.battle_id] = battle;
        return battle;
    },
    removeBattle: (battle_id: string) => {
        delete battles[battle_id];
        return;
    },
    getBattle: (battle_id: string): Battle | undefined => {
        return battles[battle_id];
    },
    getOpponent: (battle_id: string, session_key: string): Session | undefined => {
        let battle = battleHandler.getBattle(battle_id);
        if (!battle) return;

        return sessionHandler.getSession(
            "session_key",
            Object.keys(battle.parties).find((s_key) => s_key !== session_key)
        );
    },
};

const ensureOpponent = (opponent: Session | undefined, res: Response): opponent is Session => {
    if (!opponent) {
        res.status(409).send("Opponent is no longer available");
        return false;
    }
    return true;
};

const ensureActiveBattle = (battle: Battle, res: Response): battle is Battle => {
    if (battle.state === "FINISHED") {
        res.status(409).send("Battle already finished");
        return false;
    }
    return true;
};

BattleRouter.use((req, res, next) => {
    let battle = battleHandler.getBattle(req.body.battle_id);
    if (!battle) {
        res.sendStatus(404);
        return;
    }

    (req as any).battle = battle;
    (req as any).opponent = battleHandler.getOpponent(battle.battle_id, (req as any).session.session_key);

    next();
});

BattleRouter.post("/ready/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    if (!ensureActiveBattle(battle, res)) return;
    const opponent: Session | undefined = data.opponent;
    if (!ensureOpponent(opponent, res)) return;

    let readyData: BattleData.BaseBattleData = battle.setBaseBattleData(
        `_ready_${data.session.user_id}`,
        ServerClasses.BATTLE_READY_DATA,
        data.session.user_id
    );
    opponent.pushData(readyData);
    res.send();
});

BattleRouter.post("/deploy/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    if (!ensureActiveBattle(battle, res)) return;
    const opponent: Session | undefined = data.opponent;
    if (!ensureOpponent(opponent, res)) return;

    let tiles = req.body.tiles;
    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });
    let deployData = {
        ...battle.setBaseBattleData(
            `_deploy_${data.session.user_id}`,
            ServerClasses.BATTLE_DEPLOY_DATA,
            data.session.user_id
        ),
        tiles: tiles,
    };
    opponent.pushData(deployData);
    res.send();
});

BattleRouter.post("/sync/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    if (!ensureActiveBattle(battle, res)) return;
    const opponent: Session | undefined = data.opponent;
    if (!ensureOpponent(opponent, res)) return;

    let syncData: BattleData.BattleSyncData = {
        ...battle.setBaseBattleData(
            `_sync_${data.session.user_id}_${req.body.turn}`,
            ServerClasses.BATTLE_SYNC_DATA,
            data.session.user_id
        ),
        turn: req.body.turn,
        entity: req.body.entity,
        ordinal: 0,
        team: String(data.session.user_id),
        hash: req.body.hash,
        hash_str: null,
    };
    battle.recordTurnEvent(req.body.turn, syncData, { hash: req.body.hash });
    opponent.pushData(syncData);
    res.send();
});

BattleRouter.post("/query/:session_key", (req, res) => {
    let battle: Battle = (req as any).battle;
    let turn: number = req.body.turn;

    const events = battle.getTurnEvents(turn);
    if (!events.length) {
        res.send();
        return;
    }

    const timestamp = new Date().getTime();
    const payload = events.map((action) => ({
        ...action,
        timestamp,
    }));

    (req as any).session.pushData(...payload);
    res.send();
});

BattleRouter.post("/move/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    if (!ensureActiveBattle(battle, res)) return;
    let tiles = req.body.tiles;
    const opponent: Session | undefined = data.opponent;
    if (!ensureOpponent(opponent, res)) return;

    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });

    let moveData: BattleData.BattleMoveData = {
        ...battle.setBaseBattleData(
            `_move_${data.session.user_id}_${req.body.turn}`,
            ServerClasses.BATTLE_MOVE_DATA,
            data.session.user_id
        ),
        turn: req.body.turn,
        entity: req.body.entity,
        ordinal: req.body.ordinal,
        tiles: tiles,
    };

    battle.recordTurnEvent(req.body.turn, moveData);
    opponent.pushData(moveData);
    res.send();
});

BattleRouter.post("/action/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    if (!ensureActiveBattle(battle, res)) return;
    let tiles = req.body.tiles;
    const opponent: Session | undefined = data.opponent;
    if (!ensureOpponent(opponent, res)) return;

    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });

    let actionData: BattleData.BattleActionData = {
        ...battle.setBaseBattleData(
            `/${data.session.user_id}/${req.body.turn}`,
            ServerClasses.BATTLE_ACTION_DATA,
            data.session.user_id
        ),
        action: req.body.action,
        executed_id: req.body.executed_id,
        level: req.body.level,
        target_ids: req.body.target_ids,
        tiles: tiles,
        terminator: req.body.terminator,
        turn: req.body.turn,
        entity: req.body.entity,
        ordinal: req.body.ordinal,
    };

    const recorded = battle.recordTurnEvent(req.body.turn, actionData, {
        executedId: req.body.executed_id,
    });

    if (!recorded) {
        res.status(409).send("Duplicate execution id");
        return;
    }

    opponent.pushData(actionData);
    res.send();
});

BattleRouter.post("/killed/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    const opponent: Session | undefined = data.opponent;

    let killData: BattleData.BattleKilledData = {
        ...battle.setBaseBattleData(
            `_killed_${req.body.killedparty}_${req.body.killedparty}_${req.body.entity}`,
            ServerClasses.BATTLE_KILLED_DATA,
            data.session.user_id
        ),
        turn: req.body.turn,
        entity: req.body.entity,
        ordinal: req.body.ordinal,
        killedparty: req.body.killedparty,
        killer: req.body.killer,
        killerparty: req.body.killerparty,
    };

    if (opponent) {
        opponent.pushData(killData);
    }
    res.send();

    battle.handleKill(req.body.killedparty, req.body.killerparty, req.body.entity);
});

const handleBattleExit = (req: any, res: any) => {
    let battle: Battle = req.battle;
    const shouldRemove = battle.handleExit(req.session, req.body?.reason as BattleEndReason | undefined);
    if (shouldRemove) {
        battleHandler.removeBattle(battle.battle_id);
    }
    res.send();
};

BattleRouter.post("/exit/:session_key", handleBattleExit);
// Legacy path kept for compatibility with older clients
BattleRouter.post("/battle/exit/:session_key", handleBattleExit);
