import { readFileSync } from "fs";
import { ServerClasses } from "./const";
import { sessionHandler } from "./sessions";
import crypto from "crypto";

const generateBattleId = () => {
  return crypto.randomBytes(10).toString("hex");
};

class BattlePartyData{
    user: number;
    team: string;
    display_name: string;
    defs: Array<any>; // TODO: implement some type for user party (see client code for ref)
    match_handle: number;
    timer: number; // TODO: investigate usage
    party_index: number;

    constructor(user_id: number){
        let user = sessionHandler.getSession(`${user_id}`);
        // TODO: find someway to better handle this without parseing the sessions
        // probably better to look up user in db

        this.user = user_id;
        this.team = user_id.toString(); // TODO: investigate use case
        this.display_name = user!.display_name; // TODO: investigate what happens if user leaves after matchmade 
        this.defs = []// user account data
        this.match_handle = 0 // count of user games in current session 
        this.timer = 45 // no idea but its set on the queue request
        this.party_index  = 0 // again no idea 

        // this.display_name = sessionHandler.getSession()
    }
}

class Battle{

    battle_id: string;
    parties: Array<BattlePartyData>;
/*
        "reliable_msg_id": "17f8dc41a6e:53ceb:47bda_create",
        "reliable_msg_target": null,
        "timestamp": 1647350913647,

        */

    constructor(user1: number, user2: number){
        this.battle_id = generateBattleId();
        this.parties = [new BattleParty(user1), new BattleParty(user2)]

    }

}