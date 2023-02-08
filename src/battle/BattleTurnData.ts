import { BattlePartyData } from "./BattlePartyData";
import { AchievementTypes, ServerClasses } from "../const"

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
    parties: BattlePartyData[];
    scene: string;
    friendly: boolean;
};

type BaseBattleTurnData = BaseBattleData & {
    turn: number;
    entity: string;
    ordinal: number;
};

type BattleSyncData = BaseBattleTurnData & {
    team: string;
    hash: number;
    hash_str: null;
};

type BattleMoveData = BaseBattleTurnData & {
    tiles: Array<{class: string, x: number, y: number}>
};

type BattleActionData = BaseBattleTurnData & {
    action: string;
    executed_id: number;
    level: number;
    target_ids: string[];
    terminator: boolean;
    tiles: Array<{class: string, x: number, y: number}>;
};

type BattleKilledData = BaseBattleTurnData & {
    killedparty: number;
    killer: string;
    killerparty: number;
}

type BattleRewardData = {
    class: ServerClasses.BATTLE_REWARD_DATA,
    awards: any,
    achievements: any,
    total_renown: number,
    total_achievement_renown: number
}

type BattleFinishedData = BaseBattleData & {
    victoriousTeam: string,
    total_renown: number,
    rewards: BattleRewardData[]
}

type AchievementProgressData = {
    class: ServerClasses.ACHIEVEMENT_PROGRESS_DATA,
    account_id: number,
    session_key: string,
    achievement_type: AchievementTypes,
    delta: number,
    total: number,
    acquired: any[],
    handle: string, // '18613b44ee6:456:53ceb.0.1110.BATTLES', '18613b44ee6:456:53ceb.1.1110.ELO', '18613b44ee6:456:53ceb.2.1110.UNIT_KILL',
    battle_id: string
}

type RenownMessage = ReliableMsg & {
    class: ServerClasses.RENOWN_MESSAGE,
    user_id: number,
    total: number
}

export {
    ReliableMsg,
    BaseBattleData,
    BaseBattleTurnData,
    BattleCreateData,
    BattleSyncData,
    BattleMoveData,
    BattleActionData,
    BattleKilledData,
    BattleRewardData,
    BattleFinishedData,
    AchievementProgressData,
    RenownMessage
}