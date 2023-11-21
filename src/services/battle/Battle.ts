import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { AchievementTypes, GameModes, ServerClasses } from "../../const";
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../auth/auth";
import * as UserFunctions from "@api/utils/users/users.controller";
import { Router } from "express";
import { EntityDef } from "@api/utils/entityDefs/entityDefs.model";
import * as EntityDefFunctions from "@api/utils/entityDefs/entityDefs.controller";
import * as StatsFunctions from "@api/utils/stats/stats.controller";

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

    constructor(parties: Session[], GameMode: GameModes, power: number) {
        this.battle_id = generateBattleId();
        this.parties = [];
        this.type = GameMode;
        this.power = power;
        this.tourney_id = this.type === "QUICK" ? 0 : 1;

        this.init(parties);
        this.parties = parties;
    }

    public async init(parties: Array<Session>) {
        let partyData: Array<BattlePartyData> = [];

        parties.forEach(async (party, idx) => {
            var partyDataDetails = await this.createBattlePartyData(party.user_id, idx);
            var partyDataJson = JSON.parse(JSON.stringify(partyDataDetails));
            partyData.push(partyDataJson);
            //console.log(partyDataJson);
        });
        //console.log(partyData);
        let newBattle: BattleData.BattleCreateData = {
            class: ServerClasses.BATTLE_CREATE_DATA,
            user_id: 0,
            battle_id: this.battle_id,
            tourney_id: this.tourney_id,
            scene: "greathall",
            friendly: false,
            parties: partyData,
            ...this.setReliableMessageData("_create"),
        };

        parties.forEach((party) => {
            party.pushData(newBattle);
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

    private async createBattlePartyData(user_id: number, idx: number): Promise<BattlePartyData> {
        // this is shit (should be fixed when user database is setup)
        let session = sessionHandler.getSession("user_id", user_id);
        //let acc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));
        var userPTRosterList = [];
        let userPTRosters = await EntityDefFunctions.getUserPartyEntityDefs(user_id);

        var userPTRostersJson = JSON.parse(JSON.stringify(userPTRosters));

        for (let indexA = 0; indexA < userPTRostersJson.length; indexA++) {
            let userPTRosterStats = await StatsFunctions.getEntityDefsStats(userPTRostersJson[indexA].id);
            var userPTRosterStatsJson = JSON.parse(JSON.stringify(userPTRosterStats));

            var statsList = [];

            for (let index = 0; index < userPTRosterStatsJson.length; index++) {
                statsList.push({
                    class: userPTRosterStatsJson[index].class,
                    stat: userPTRosterStatsJson[index].stat,
                    value: userPTRosterStatsJson[index].value,
                });
            }

            userPTRosterList.push({
                class: userPTRostersJson[indexA].class,
                id: userPTRostersJson[indexA].unit_id,
                entityClass: userPTRostersJson[indexA].entity_class,
                name: userPTRostersJson[indexA].name,
                stats: statsList,
                start_date: 0,
                appearance_acquires: userPTRostersJson[indexA].appearance_acquires,
                appearance_index: userPTRostersJson[indexA].appearance_index,
            });

            //console.log(userPTRosterList);
        }

        let data: BattlePartyData = {
            class: ServerClasses.BATTLE_PARTY_DATA,
            user: user_id,
            team: `${user_id}`,
            display_name: session!.display_name,
            //defs: [acc.roster.defs[0]],
            defs: userPTRosterList,
            match_handle: session!.match_handle,
            party_index: idx,
            elo: this.type === "QUICK" ? 0 : 1000, // do something else if not quick play
            power: this.power,
            session_key: session!.session_key,
            battle_count: 1,
            tourney_id: this.type === "QUICK" ? 0 : 1, // do something else if not quick play
            timer: 45,
            vs_type: this.type,
        };
        return data;
    }
}

var battles: any = {};

export const battleHandler = {
    getBattles: (): Battle[] => {
        return battles;
    },
    addBattle: (parties: Session[], GameMode: GameModes, power: number) => {
        let battle = new Battle(parties, GameMode, power);
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

    let readyData: BattleData.BaseBattleData = (data.battle as Battle).setBaseBattleData(
        `_ready_${data.session.user_id}`,
        ServerClasses.BATTLE_READY_DATA,
        data.session.user_id
    );
    data.opponent.pushData(readyData);
    res.send();
});

BattleRouter.post("/deploy/:session_key", (req, res) => {
    let data = req as any;

    let tiles = req.body.tiles;
    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });
    let deployData = {
        ...(data.battle as Battle).setBaseBattleData(
            `_deploy_${data.session.user_id}`,
            ServerClasses.BATTLE_DEPLOY_DATA,
            data.session.user_id
        ),
        tiles: tiles,
    };
    data.opponent.pushData(deployData);
    res.send();
});

BattleRouter.post("/sync/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    if (!battle.turns[req.body.turn]) {
        battle.turns[req.body.turn] = [];
    }

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
    data.opponent.pushData(syncData);
    res.send();
});

BattleRouter.post("/query/:session_key", (req, res) => {
    let battle: Battle = (req as any).battle;
    let turn: number = req.body.turn;

    let data = battle.turns[turn];
    data.forEach((action: any) => {
        action.timestamp = new Date().getTime();
    });

    (req as any).session.pushData(...data);
    res.send();
});

BattleRouter.post("/move/:session_key", (req, res) => {
    let data = req as any;
    let tiles = req.body.tiles;

    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });

    let moveData: BattleData.BattleMoveData = {
        ...(data.battle as Battle).setBaseBattleData(
            `_move_${data.session.user_id}_${req.body.turn}`,
            ServerClasses.BATTLE_MOVE_DATA,
            data.session.user_id
        ),
        turn: req.body.turn,
        entity: req.body.entity,
        ordinal: req.body.ordinal,
        tiles: tiles,
    };

    (data.battle as Battle).turns[req.body.turn].push(moveData);
    data.opponent.pushData(moveData);
    res.send();
});

BattleRouter.post("/action/:session_key", (req, res) => {
    let data = req as any;
    let tiles = req.body.tiles;

    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_TILE_DATA;
    });

    let actionData: BattleData.BattleActionData = {
        ...(data.battle as Battle).setBaseBattleData(
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

    (data.battle as Battle).turns[req.body.turn].push(actionData);
    data.opponent.pushData(actionData);
    res.send();
});

BattleRouter.post("/killed/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;

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

    data.opponent.pushData(killData);
    res.send();

    let party = battle.aliveUnits[req.body.killedparty];

    let killed_idx = party.indexOf[req.body.entity];
    battle.aliveUnits[req.body.killedparty].splice(killed_idx);
    console.log(party);
    if (!party.length) {
        battle.winner = req.body.killerparty;
        endgame(data);
    }
});

BattleRouter.post("/battle/exit/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    delete battle.parties[data.session.session_key];
    if (!battle.parties.length) battleHandler.removeBattle(battle.battle_id);
});

// TO BE REDONE! ASAP!
const endgame = (data: any) => {
    let ach_data: Array<BattleData.AchievementProgressData> = [];
    let ach_type: keyof typeof AchievementTypes;
    let battle: Battle = data.battle;
    [data.session, data.opponent].forEach((session: Session) => {
        for (ach_type in AchievementTypes) {
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
    data.session.pushData(...ach_data);
    data.opponent.pushData(...ach_data);

    [data.session, data.opponent].forEach((session: Session) => {
        let ts = new Date().getTime();
        let renown_count = 31;
        let renown_msg: BattleData.RenownMessage = {
            reliable_msg_id: `renown_${session.user_id}_${ts}_${renown_count}`,
            reliable_msg_target: null,
            class: ServerClasses.RENOWN_MESSAGE,
            timestamp: ts,
            total: renown_count,
            user_id: session.user_id,
        };

        let user_id = 0;
        let battle_finished: BattleData.BattleFinishedData = {
            ...battle.setBaseBattleData(`_finished_${user_id}`, ServerClasses.BATTLE_FINISHED_DATA, user_id),
            victoriousTeam: String(battle.winner),
            total_renown: 100,
            rewards: [
                {
                    achievements: [],
                    awards: { KILLS: 2 },
                    class: ServerClasses.BATTLE_REWARD_DATA,
                    total_achievement_renown: 0,
                    total_renown: 14,
                },
            ],
        };
        session.pushData(renown_msg, battle_finished);
    });
};

BattleRouter.post("/surrender/:session_key", async (req, res) => {
    var battleId = req.body.battle_id;
    var turn = req.body.turn;

    res.send();
});
