import { BattlePartyData } from "./BattlePartyData";
import {ServerClasses} from "../const"

interface ReliableMsg {
    reliable_msg_id: string;
    reliable_msg_target: String | null;
    timestamp: number;
}

interface BaseBattleData {
    user_id: number;
    battle_id: string;
};

interface BaseBattleTurnData extends BaseBattleData {
    turn: number;
    entity: string;
    ordinal: number;
    class: ServerClasses;
};

interface BattleCreateData extends BaseBattleTurnData {
    parties: Array<BattlePartyData>;
    scene: string;
    friendly: boolean;
}

export {
    ReliableMsg,
    BaseBattleData,
    BaseBattleTurnData,
    BattleCreateData
}