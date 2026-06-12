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
    // Redacted to "" before it goes on the wire (BattleCreateData push) so a player
    // can't read the opponent's auth token — see the Battle constructor (#32). The
    // map that holds these objects is keyed by the same value.
    session_key: string;
    battle_count: number;
    tourney_id: number;
    timer: number; // TODO: investigate usage
    vs_type: GameModes;
}
