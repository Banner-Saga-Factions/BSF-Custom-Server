import { BattlePartyData } from "./BattlePartyData";
import { ServerClasses } from "../const"

type ReliableMsg = {
    reliable_msg_id: string;
    reliable_msg_target: String | null;
    timestamp: number;
}

type BaseBattleData = ReliableMsg & {
    class: ServerClasses;
    user_id: number;
    battle_id: string;
};

type BattleCreateData = BaseBattleData & {
    tourney_id: number;
    parties: Array<BattlePartyData>;
    scene: string;
    friendly: boolean;
};

type BaseBattleTurnData = BaseBattleData & {
    turn: number;
    entity: string;
    ordinal: number;
};

type BattleSyncData = BaseBattleTurnData & {
    
};

type BattleMoveData = BaseBattleTurnData & {
    
};

type BattleActionData = BaseBattleTurnData & {
    
};

export {
    ReliableMsg,
    BaseBattleData,
    BaseBattleTurnData,
    BattleCreateData
}