import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { AchievementTypes, BattleRenownAwardTypes, GameModes, ServerClasses } from "../../const";
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../auth/auth";
import { Router } from "express";
import { addRenown } from "../../db/account";
import { saveBattleResult } from "../../db/battles";

const generateBattleId = () => {
    return crypto.randomBytes(10).toString("hex");
};

export const BattleRouter = Router();

export class Battle {
    battle_id: string;
    parties: any = {};
    type: GameModes;
    tourney_id: number;
    power: number;
    turns: any[] = [];
    turnNum: number = 0;
    nextExecutionId: number = 1; // TODO: set properly in constructor
    aliveUnits: any = {};
    winner: number | null = null;
    startedAt: Date = new Date();

    constructor(partySessions: Session[], GameMode: GameModes, power: number) {
        this.battle_id = generateBattleId();
        this.parties = {};
        this.type = GameMode;
        this.power = power;
        this.tourney_id = this.type === "QUICK" ? 0 : 1;

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
            scene: "greathall",
            friendly: false,
            parties: Object.values(this.parties),
            ...this.setReliableMessageData("_create"),
        };

        console.log(`[BATTLE] Created battle_id=${newBattle.battle_id} with ${newBattle.parties.length} parties`);

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
        const session = sessionHandler.getSession("user_id", user_id);
        if (!session?.accountData) {
            throw new Error(`createBattlePartyData: no active session for user_id=${user_id}`);
        }
        const acc = session.accountData;

        const filteredDefs = acc.roster_json.filter((unit: any) =>
            acc.party_ids_json.includes(unit.id)
        );

        console.log(`[BATTLE] User ${user_id}: ${filteredDefs.length}/${acc.roster_json.length} units selected`);

        return {
            class: ServerClasses.BATTLE_PARTY_DATA,
            user: user_id,
            team: `${user_id}`,
            display_name: session.display_name,
            defs: filteredDefs,
            match_handle: session.match_handle,
            party_index: idx,
            elo: this.type === "QUICK" ? 0 : 1000,
            power: this.power,
            session_key: session.session_key,
            battle_count: 1,
            tourney_id: this.type === "QUICK" ? 0 : 1,
            timer: idx === 0 ? 30 : 45,
            vs_type: this.type,
        };
    }
}

// MED-1: const instead of var
const battles: Record<string, Battle> = {};

export const battleHandler = {
    getBattles: (): Battle[] => {
        return Object.values(battles);
    },
    addBattle: (parties: Session[], GameMode: GameModes, power: number) => {
        const battle = new Battle(parties, GameMode, power);
        battles[battle.battle_id] = battle;
        return battle;
    },
    removeBattle: (battle_id: string) => {
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
    const opponent = battleHandler.getOpponent(battle.battle_id, sessionKey);

    // HIGH-3: /battle/exit is allowed even when the opponent has already left.
    // All other routes push data to the opponent and require it to be present.
    if (!opponent && !req.path.startsWith("/battle/exit")) {
        res.sendStatus(410); // Gone — opponent disconnected
        return;
    }

    (req as any).opponent = opponent;
    next();
});

BattleRouter.post("/ready/:session_key", (req, res) => {
    const data = req as any;
    const readyData: BattleData.BaseBattleData = (data.battle as Battle).setBaseBattleData(
        `_ready_${data.session.user_id}`,
        ServerClasses.BATTLE_READY_DATA,
        data.session.user_id
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
            `_deploy_${data.session.user_id}`,
            ServerClasses.BATTLE_DEPLOY_DATA,
            data.session.user_id
        ),
        tiles,
    };
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
            `_sync_${data.session.user_id}_${turn}`,
            ServerClasses.BATTLE_SYNC_DATA,
            data.session.user_id
        ),
        turn,
        entity: req.body.entity,
        ordinal: 0,
        team: String(data.session.user_id),
        hash: req.body.hash,
        hash_str: null,
    };
    data.opponent.pushData(syncData);
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
            `_move_${data.session.user_id}_${turn}`,
            ServerClasses.BATTLE_MOVE_DATA,
            data.session.user_id
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
            `/${data.session.user_id}/${turn}`,
            ServerClasses.BATTLE_ACTION_DATA,
            data.session.user_id
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
    res.send();
});

BattleRouter.post("/killed/:session_key", (req, res) => {
    const data = req as any;
    const battle: Battle = data.battle;

    const killData: BattleData.BattleKilledData = {
        ...battle.setBaseBattleData(
            `_killed_${req.body.killedparty}_${req.body.entity}`,
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

    data.opponent.pushData(killData);

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
            if (party.length === 0) {
                battle.winner = req.body.killerparty;
                endgame(data).catch(err => console.error("[BATTLE] endgame failed:", err));
            }
        }
    }

    res.send();
});

BattleRouter.post("/battle/exit/:session_key", (req, res) => {
    const data = req as any;
    const battle: Battle = data.battle;
    delete battle.parties[data.session.session_key];
    if (Object.keys(battle.parties).length === 0) battleHandler.removeBattle(battle.battle_id);
    res.json({ status: "success", battle_id: battle.battle_id });
});

const RENOWN_WIN_BONUS = 20;
const RENOWN_PER_KILL = 3;

const endgame = async (data: any): Promise<void> => {
    if (!data.session || !data.opponent) {
        console.error("[BATTLE] endgame called with missing session or opponent");
        return;
    }

    const battle: Battle = data.battle;

    // Identify winner/loser from battle.winner (set by /killed route)
    const winnerSession: Session = battle.winner === data.session.user_id ? data.session : data.opponent;
    const loserSession: Session  = winnerSession === data.session ? data.opponent : data.session;

    // Compute kills from party defs (initial size) vs remaining aliveUnits
    const winnerParty = Object.values(battle.parties).find((p: any) => p.user === winnerSession.user_id) as BattlePartyData;
    const loserParty  = Object.values(battle.parties).find((p: any) => p.user === loserSession.user_id)  as BattlePartyData;
    const winnerKills = loserParty.defs.length; // loser has 0 alive units at endgame
    const loserKills  = winnerParty.defs.length - (battle.aliveUnits[String(winnerSession.user_id)]?.length ?? 0);

    const winnerRenown = RENOWN_WIN_BONUS + winnerKills * RENOWN_PER_KILL;
    const loserRenown  = loserKills * RENOWN_PER_KILL;

    console.log(`[BATTLE] endgame: winner=${winnerSession.user_id} (${winnerKills} kills, +${winnerRenown} renown) loser=${loserSession.user_id} (${loserKills} kills, +${loserRenown} renown)`);

    // Persist to DB without blocking client message delivery
    Promise.all([
        addRenown(winnerSession.user_id, winnerRenown),
        addRenown(loserSession.user_id, loserRenown),
        saveBattleResult(
            battle.battle_id, battle.type,
            winnerSession.user_id, loserSession.user_id,
            winnerRenown + loserRenown, battle.startedAt
        ),
    ]).then(() => {
        if (winnerSession.accountData) winnerSession.accountData.renown += winnerRenown;
        if (loserSession.accountData)  loserSession.accountData.renown  += loserRenown;
        console.log(`[BATTLE] endgame: DB writes complete for battle ${battle.battle_id}`);
    }).catch(err => console.error("[BATTLE] endgame DB persistence failed:", err));

    // Achievement progress (placeholder deltas — full tracking is a future stream)
    const ach_data: BattleData.AchievementProgressData[] = [];
    [winnerSession, loserSession].forEach((session: Session) => {
        for (const ach_type in AchievementTypes) {
            ach_data.push({
                class: ServerClasses.ACHIEVEMENT_PROGRESS_DATA,
                account_id: session.user_id,
                session_key: session.session_key,
                delta: 0,
                total: 1,
                acquired: [],
                handle: `${battle.battle_id}.${ach_data.length}.${session.user_id}.${ach_type}`,
                battle_id: battle.battle_id,
                achievement_type: ach_type as AchievementTypes,
            });
        }
    });
    winnerSession.pushData(...ach_data);
    loserSession.pushData(...ach_data);

    // Send RenownMessage + BattleFinishedData to each player with real computed values
    for (const { session, kills, renown } of [
        { session: winnerSession, kills: winnerKills, renown: winnerRenown },
        { session: loserSession,  kills: loserKills,  renown: loserRenown  },
    ]) {
        const ts = new Date().getTime();
        const awards: Record<string, number> = { [BattleRenownAwardTypes.KILLS]: kills * RENOWN_PER_KILL };
        if (session === winnerSession) awards[BattleRenownAwardTypes.WIN] = RENOWN_WIN_BONUS;

        const renown_msg: BattleData.RenownMessage = {
            reliable_msg_id: `renown_${session.user_id}_${ts}_${renown}`,
            reliable_msg_target: null,
            class: ServerClasses.RENOWN_MESSAGE,
            timestamp: ts,
            total: renown,
            user_id: session.user_id,
        };
        const battle_finished: BattleData.BattleFinishedData = {
            ...battle.setBaseBattleData(
                `_finished_${session.user_id}`,
                ServerClasses.BATTLE_FINISHED_DATA,
                session.user_id
            ),
            victoriousTeam: String(battle.winner),
            total_renown: renown,
            rewards: [{
                achievements: [],
                awards,
                class: ServerClasses.BATTLE_REWARD_DATA,
                total_achievement_renown: 0,
                total_renown: renown,
            }],
        };
        session.pushData(renown_msg, battle_finished);
    }
};
