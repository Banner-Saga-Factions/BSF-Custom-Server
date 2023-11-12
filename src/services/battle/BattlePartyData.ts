import { GameModes, ServerClasses } from "../../const";
import { Session } from "../auth/auth";

export interface BattlePartyData {
    class: ServerClasses;
    user: number;
    team: string;
    display_name: string;
    defs: any[]; // TODO: implement some type for user party (see client code for ref)
    match_handle: number;
    party_index: number;
    elo: number;
    power: number;
    session_key: string;
    battle_count: number;
    tourney_id: number;
    timer: number; // TODO: investigate usage
    vs_type: GameModes;
}
