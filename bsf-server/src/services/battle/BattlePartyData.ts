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
    // Seconds this player gets per turn; 0 means no clock, which the game honours
    // literally by building no countdown at all. Each party carries its own, so the two
    // players in one battle can legitimately be on different clocks — whoever is acting,
    // both screens count down that player's value (#213).
    timer: number;
    vs_type: GameModes;
}
