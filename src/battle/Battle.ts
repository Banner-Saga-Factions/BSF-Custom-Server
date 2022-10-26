import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { GameModes, ServerClasses } from "../const"
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../sessions";
import { readFileSync } from "fs";
import { Router } from "express";

const generateBattleId = () => {
    return crypto.randomBytes(10).toString("hex");
};

export const BattleRouter = Router();

export class Battle {
    battle_id: string;
    parties: Array<Session>;
    battleTurnData: BattleData.BaseBattleTurnData;
    type: GameModes;
    tourney_id: number;
    power: number;

    constructor(parties: Array<Session>, GameMode: GameModes, power: number) {
        this.battle_id = generateBattleId()
        this.parties = parties;
        this.type = GameMode;
        this.power = power;
        this.tourney_id = this.type === "QUICK" ? 0 : 1;
        this.battleTurnData = {
            battle_id: this.battle_id,
            turn: 0,
            user_id: 0,
            entity: "",
            ordinal: 0,
            class: ServerClasses.BATTLE_CREATE_DATA
        };

        let partyData: Array<BattlePartyData> = [];
        parties.forEach((party, idx) => {
            partyData.push(this.createBattlePartyData(party.user_id, idx))
        })

        let newBattle: BattleData.BattleCreateData & BattleData.ReliableMsg = {
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

    };

    setReliableMessageData(reliable_msg_postfix: string): BattleData.ReliableMsg {
        return {
            reliable_msg_id: this.battle_id + reliable_msg_postfix,
            reliable_msg_target: null,
            timestamp: new Date().getTime(),
        }
    }

    private createBattlePartyData(user_id: number, idx: number): BattlePartyData {
        // this is shit (should be fixed when user database is setup)
        let session = sessionHandler.getSessions().find(session => session.user_id === user_id)
        let acc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));


        let data: BattlePartyData = {
            class: ServerClasses.BATTLE_PARTY_DATA,
            user: user_id,
            team: `${user_id}`,
            display_name: session!.display_name,
            defs: acc.roster.defs,
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

BattleRouter.post("/ready/:session_key", (req, res)=>{
    
});

BattleRouter.post("/deploy/:session_key", (req, res)=>{

});

BattleRouter.post("/sync/:session_key", (req, res)=>{

});

BattleRouter.post("/query/:session_key", (req, res)=>{

});

BattleRouter.post("/move/:session_key", (req, res)=>{

});

BattleRouter.post("/action/:session_key", (req, res)=>{

});

BattleRouter.post("/killed/:session_key", (req, res)=>{

});