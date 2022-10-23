import { Session } from "../sessions";

export interface BattlePartyData {
    user: number;
    team: string;
    display_name: string;
    defs: Array<any>; // TODO: implement some type for user party (see client code for ref)
    match_handle: number;
    timer: number; // TODO: investigate usage
    party_index: number;
}