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
    // Seconds each player gets per turn; 0 means no clock, which the game honours literally
    // by building no countdown at all. The field is per party because that is the wire shape,
    // but we always send the SAME number in both — one clock per battle, worked out from what
    // the two players each asked for (sharedTurnTimer in queue.ts). Deliberate divergence from
    // the reference, which gives each side its own (#213).
    timer: number;
    vs_type: GameModes;
}
