import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { GameModes, ServerClasses } from "../const"
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../sessions";
import { readFileSync } from "fs";
import { Router } from "express";
import * as UserFunctions from "../../src/api/utils/users/users.controller";

const generateBattleId = () => {
    return crypto.randomBytes(10).toString("hex");
};

export const BattleRouter = Router();

export class Battle {
    battle_id: string;
    parties: Array<Session>;
    type: GameModes;
    tourney_id: number;
    power: number;

    constructor(parties: Array<Session>, GameMode: GameModes, power: number) {
        this.battle_id = generateBattleId()
        this.type = GameMode;
        this.power = power;
        this.tourney_id = this.type === "QUICK" ? 0 : 1;
        this.init(parties);
        this.parties = parties;

        //console.log(this.parties);
    };

    public async init(parties: Array<Session>) {
        
        let partyData: Array<BattlePartyData> = [];

        parties.forEach(async (party, idx) => {
            var partyDataDetails = await this.createBattlePartyData(party.user_id, idx);
            var partyDataJson = JSON.parse(JSON.stringify(partyDataDetails));
            partyData.push(partyDataJson);
            //console.log(partyDataJson);
        })
        //console.log(partyData);
        let newBattle: BattleData.BattleCreateData = {
            class: ServerClasses.BATTLE_CREATE_DATA,
            user_id: 0,
            battle_id: this.battle_id,
            tourney_id: this.tourney_id,
            scene: "greathall",
            friendly: false,
            parties: partyData,
            ...this.setReliableMessageData("_create")
        }

        parties.forEach(party => {
            party.pushData(newBattle);
        })
    }

    setReliableMessageData(reliable_msg_postfix: string): BattleData.ReliableMsg {
        return {
            reliable_msg_id: this.battle_id + reliable_msg_postfix,
            reliable_msg_target: null,
            timestamp: new Date().getTime(),
        }
    };

    setBaseBattleData(reliable_msg_postfix: string, server_class: ServerClasses, user_id: number):
        BattleData.BaseBattleData {
        return {
            ...this.setReliableMessageData(reliable_msg_postfix),
            class: server_class,
            battle_id: this.battle_id,
            user_id: user_id
        }
    }

    private async createBattlePartyData(user_id: number, idx: number) {
        let session = sessionHandler.getSessions().find(session => session.user_id === user_id)
        //let acc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));
        var userPTRosterList = [];
        let userPTRosters = await UserFunctions.getUserPartyRosters(user_id);
        
        var userPTRostersJson = JSON.parse(JSON.stringify(userPTRosters));
        
        for (let indexA = 0; indexA < userPTRostersJson.length; indexA++) { 
            
            let userPTRosterStats = await UserFunctions.getUserRosterStats(userPTRostersJson[indexA].id);
            var userPTRosterStatsJson = JSON.parse(JSON.stringify(userPTRosterStats));
            
            var statsList = [];

            for (let index = 0; index < userPTRosterStatsJson.length; index++) {
                statsList.push({ class: userPTRosterStatsJson[index].class, stat: userPTRosterStatsJson[index].stat, value: userPTRosterStatsJson[index].value });
            }
            
            userPTRosterList.push({
                class: userPTRostersJson[indexA].class,
                id: userPTRostersJson[indexA].unit_id,
                entityClass: userPTRostersJson[indexA].entity_class,
                name: userPTRostersJson[indexA].name,
                stats: statsList,
                start_date: 0,
                appearance_acquires: userPTRostersJson[indexA].appearance_acquires,
                appearance_index: userPTRostersJson[indexA].appearance_index
            });

            //console.log(userPTRosterList);
        };

        let data: BattlePartyData = {
            class: ServerClasses.BATTLE_PARTY_DATA,
            user: user_id,
            team: `${user_id}`,
            display_name: session!.display_name,
            //defs: (acc.roster.defs as Array<any>).filter(unit => acc.party.ids.includes(unit.id)),
            defs: userPTRosterList,
            match_handle: session!.match_handle,
            party_index: idx,
            elo: this.type === "QUICK" ? 0 : 1000, // do something else if not quick play
            power: this.power,
            session_key: session!.session_key,
            battle_count: 1,
            tourney_id: this.type === "QUICK" ? 0 : 1, // do something else if not quick play
            timer: 45,
            vs_type: this.type
        }
        
        return data;
    }
}

var battles: Array<Battle> = [];

export const battleHandler = {
    getBattles: (): Array<Battle> => {
        return battles;
    },
    addBattle: (parties: Array<Session>, GameMode: GameModes, power: number) => {
        let battle = new Battle(parties, GameMode, power);
        battles.push(battle);
        return battle;
    },
    getBattle: (battle_id: string): Battle | undefined => {
        return battles.find(battle => battle.battle_id === battle_id);
    },

};

BattleRouter.post("/ready/:session_key", (req, res) => {
    let battle = battleHandler.getBattle(req.body.battle_id);
    console.log(battle);
    if (!battle) { res.sendStatus(404); return; }
    let sender: Session = (req as any).session
    let ready: BattleData.BaseBattleData = {
        class: ServerClasses.BATTLE_READY_DATA,
        user_id: sender.user_id,
        battle_id: battle.battle_id,
        ...battle.setReliableMessageData(`_ready_${sender.user_id}`)
    }
    battle.parties.forEach(party => {
        if (party !== sender) party.pushData(ready);
    })

    console.log(ready);
    res.send();
});

BattleRouter.post("/deploy/:session_key", (req, res) => {
    let battle = battleHandler.getBattle(req.body.battle_id);
    if (!battle) { res.sendStatus(404); return; }
    let tiles = req.body.tiles
    tiles.forEach((tile: any) => {
        tile.class = ServerClasses.BATTLE_DATA_TILE
    })
    let sender = (req as any).session
    let data = {
    ...battle.setBaseBattleData(`_deploy_${sender.user_id}`, ServerClasses.BATTLE_DEPLOY_DATA, sender.user_id),
    tiles: tiles
    }
    battle.parties.forEach(party => {
        if (party !== sender) party.pushData(data);
    })
    res.send();
});

BattleRouter.post("/sync/:session_key", (req, res) => {

});

BattleRouter.post("/query/:session_key", (req, res) => {

});

BattleRouter.post("/move/:session_key", (req, res) => {

});

BattleRouter.post("/action/:session_key", (req, res) => {

});

BattleRouter.post("/killed/:session_key", (req, res) => {

});

BattleRouter.post("/surrender/:session_key", async (req, res) => {
    var battleId = req.body.battle_id;
    var turn = req.body.turn;

    res.send();
});