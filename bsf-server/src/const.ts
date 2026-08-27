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
    // #91: the two live-update messages that keep a sent friends list correct.
    // Deliberately absent: "tbs.srv.data.FriendData" (the SINGULAR entry). The game
    // handles that class, but for a name it already holds it writes past the start of
    // a fixed-type array and throws, which kills the whole batch of messages in that
    // poll. Always send the plural list instead -- see .claude/rules/gotchas.md.
    FRIEND_ONLINE_DATA = "tbs.srv.data.FriendOnlineData",
    GAME_LOCATION_DATA = "tbs.srv.data.GameLocationData",

    LEADERBOARDS_DATA = "tbs.srv.data.LeaderboardsData",

    LEADERBOARD_DATA = "tbs.srv.data.LeaderboardData",

    TOURNEY = "tbs.srv.data.Tourney",

    TOURNEY_PROGRESS_DATA = "tbs.srv.data.TourneyProgressData",

    TOURNEY_WINNER_DATA = "tbs.srv.data.TourneyData",

    // UTIL
    ACHIEVEMENT_PROGRESS_DATA = "tbs.srv.util.AchievementProgressData",

    RENOWN_MESSAGE = "tbs.srv.util.RenownMsg",

    // BATTLE
    BATTLE_CREATE_DATA = "tbs.srv.battle.data.BattleCreateData",

    BATTLE_PARTY_DATA = "tbs.srv.battle.data.BattlePartyData",

    BATTLE_READY_DATA = "tbs.srv.battle.data.client.BattleReadyData",

    BATTLE_SYNC_DATA = "tbs.srv.battle.data.client.BattleSyncData",

    BATTLE_DEPLOY_DATA = "tbs.srv.battle.data.client.BattleDeployData",

    BATTLE_MOVE_DATA = "tbs.srv.battle.data.client.BattleMoveData",

    BATTLE_ACTION_DATA = "tbs.srv.battle.data.client.BattleActionData",

    BATTLE_KILLED_DATA = "tbs.srv.battle.data.client.BattleKilledData",

    BATTLE_SURRENDER_DATA = "tbs.srv.battle.data.client.BattleSurrenderData",

    BATTLE_TILE_DATA = "tbs.srv.battle.data.Tile",

    BATTLE_REWARD_DATA = "tbs.srv.battle.data.client.BattleRewardData",

    BATTLE_FINISHED_DATA = "tbs.srv.battle.data.client.BattleFinishedData",

    // LOBBY (M3b). The client distinguishes LobbyData / LobbyOptionsData /
    // LobbyPartyData by the `class` field on each pushed event so the
    // long-poll dispatcher routes them to the right handler.
    LOBBY_DATA = "tbs.srv.data.LobbyData",

    LOBBY_OPTIONS_DATA = "tbs.srv.data.LobbyOptionsData",

    LOBBY_PARTY_DATA = "tbs.srv.data.LobbyPartyData",
}

export enum GameModes {
    QUICK = "QUICK",
    RANKED = "RANKED",
    TOURNEY = "TOURNEY",
}

export enum BattleRenownAwardTypes {
    KILLS = "KILLS",
    WIN = "WIN",
    UNDERDOG = "UNDERDOG",
    DAILY = "DAILY",
    FRIEND = "FRIEND",
    BOOST = "BOOST",
    STREAK = "STREAK",
    EXPERT = "EXPERT",
}

export enum AchievementTypes {
    BATTLES = "BATTLES",
    ELO = "ELO",
    STREAK = "STREAK",
    UNIT_KILL = "UNIT_KILL",
    WINS = "WINS",
}
