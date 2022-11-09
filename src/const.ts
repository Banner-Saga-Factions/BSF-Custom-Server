export enum ServerClasses {
    // CHAT
    CHAT_MESSAGE = "tbs.srv.chat.ChatMsg",

    // DATA
    SERVER_STATUS_DATA = "tbs.srv.data.ServerStatusData",

    DATA_STAT = "tbs.srv.data.Stat",

    PURCHASABLE_UNIT = "tbs.srv.data.PurchasableUnitData",

    ENTITY_DEF = "tbs.srv.data.EntityDef",

    VS_QUEUE_DATA = "tbs.srv.data.VsQueueData",

    TOURNEY_DEF = "tbs.srv.data.TourneyDef",

    FRIENDS_DATA = "tbs.srv.data.FriendsData",

    LEADERBOARDS_DATA = "tbs.srv.data.LeaderboardsData",

    LEADERBOARD_DATA = "tbs.srv.data.LeaderboardData",

    // UTIL
    TOURNEY = "tbs.srv.data.Tourney",

    TOURNEY_PROGRESS_DATA = "tbs.srv.data.TourneyProgressData",

    TOURNEY_WINNER_DATA = "tbs.srv.data.TourneyData",

    // BATTLE
    BATTLE_CREATE_DATA = "tbs.srv.battle.data.BattleCreateData",

    BATTLE_PARTY_DATA = "tbs.srv.battle.data.BattlePartyData",

    BATTLE_READY_DATA = "tbs.srv.battle.data.client.BattleReadyData",

    BATTLE_SYNC_DATA= "tbs.srv.battle.data.client.BattleSyncData",

    BATTLE_DEPLOY_DATA= "tbs.srv.battle.data.client.BattleDeployData",

    BATTLE_MOVE_DATA= "tbs.srv.battle.data.client.BattleMoveData",
    
    BATTLE_ACTION_DATA= "tbs.srv.battle.data.client.BattleActionData",
    
    BATTLE_DATA_TILE="tbs.srv.battle.data.Tile"
}

export enum GameModes {
    QUICK = "QUICK",

    RANKED = "RANKED",

    TOURNEY = "TOURNEY",
}
