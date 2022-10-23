import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { ServerClasses } from "../const"
import { BattlePartyData } from "./BattlePartyData";
import { sessionHandler, getUserAccountData } from "../sessions";
import { readFileSync } from "fs";

const generateBattleId = () => {
    return crypto.randomBytes(10).toString("hex");
};


class Battle {
    battle_id: string;
    parties: Array<number>;
    battleData: BattleData.BaseBattleTurnData;

    constructor(parties: Array<number>) {
        this.battle_id = generateBattleId()
        this.parties = parties;
        this.battleData = {
            battle_id: this.battle_id,
            turn: 0,
            user_id: 0,
            entity: "",
            ordinal: 0,
            class: ServerClasses.BATTLE_CREATE_DATA
        };

        let partyData: Array<BattlePartyData> = [];
        parties.forEach((party, idx)=>{
            partyData.push(this.getBattlePartyData(party, idx))
        })

        let newBattle: BattleData.BattleCreateData = {
            ...this.battleData,
            scene: "great_hall",
            friendly: false,
            parties: partyData,
        }

        sessionHandler.getSessions().forEach(session=>{
            if (parties.includes(session.user_id)){
                session.pushData(newBattle);
            }
        })

    };

    setReliableMessage(reliable_msg_postfix: string) {
        let data: BattleData.ReliableMsg = {
            reliable_msg_id: this.battle_id + reliable_msg_postfix,
            reliable_msg_target: null,
            timestamp: new Date().getTime(),
        }
        return data;
    }

    private getBattlePartyData(user_id: number, idx: number): BattlePartyData {
        // this is shit (should be fixed when user database is setup)
        let displayname = sessionHandler.getSessions().find(session => session.user_id === user_id)?.display_name;
        let acc = JSON.parse(readFileSync("../data/acc.json", "utf-8"));
        
        
        let data: BattlePartyData = {
            user: user_id,
            team: `${user_id}`,
            timer: 45,
            display_name: displayname ? displayname : "Guest",
            match_handle: 0,
            party_index: idx,
            defs: acc.roster.defs
        }
        return data;
    }


}