import { BattlePartyData } from "./BattlePartyData";
import { ServerClasses } from "../const"

type ReliableMsg = {
    reliable_msg_id: string;
    reliable_msg_target: String | null;
    timestamp: number;
}

type BaseBattleData = {
    user_id: number;
    battle_id: string;
};

type BaseBattleTurnData = BaseBattleData & {
    turn: number;
    entity: string;
    ordinal: number;
    class: ServerClasses;
};

type BattleCreateData = BaseBattleTurnData & {
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