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
    // A private match two people arranged in the friend lobby (#205). It is not a
    // queue anybody can join: each side names the other in the request, and the
    // pair is made because they asked for each other rather than because their
    // parties are evenly matched.
    FRIEND = "FRIEND",
}

// The match kinds whose waiting-player counts we tell everybody about. FRIEND is
// left out on purpose: it is an arrangement between two named people, so there is
// no "how many are waiting" worth reporting and the game shows no counter for it.
// Mirrors the original server's own list (VsWorker.java:643 `queueDataTypes`).
export const REPORTED_QUEUE_MODES: readonly GameModes[] = [
    GameModes.QUICK,
    GameModes.RANKED,
    GameModes.TOURNEY,
];

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

// #98: every alternate unit colour, granted to every player.
//
// The game decides entirely on its own whether a colour is available and whether it
// costs anything -- it reads two ids off each appearance in character_classes.json
// and asks whether the player holds them. Until now we answered "you hold nothing",
// so the third colour showed a shopping-cart icon and sent the player to Stoic's store,
// which shut down. Granting these ends that. (Only twelve of the thirty classes have more
// than one colour -- see THREE_COLOUR_CLASSES below.)
//
// There is exactly one id per colourable class, and it fills BOTH of the two fields
// the game tests, so granting it makes the second and third colour free as well as
// available. That is the whole pricing decision: the game charges nothing, so the
// server charges nothing, and the two agree.
//
// Twelve ids, not seventeen. Issue #98's own text also lists var_all, var_all_raiders,
// var_all_archers, var_all_warriors and var_all_shieldbangers -- no appearance
// references any of them, they were store bundle products, and granting them does
// nothing. Read out of the decoded appearance table (bsf-client/misc/
// factions_character_classes.json): 30 classes, of which these 12 have three colours
// and the other 18 have one.
export const UNIVERSAL_UNLOCK_IDS: readonly string[] = [
    "var_axemasters",
    "var_backbiters",
    "var_bowmasters",
    "var_provokers",
    "var_shieldmasters",
    "var_siegearchers",
    "var_skystrikers",
    "var_strongarms",
    "var_thrashers",
    "var_warhawks",
    "var_warleaders",
    "var_warmasters",
];

// #72/#119: how many colours each unit class actually has.
//
// The server has to refuse a colour that does not exist, and it cannot work that out on its
// own -- the appearance table is the game's data, not ours. These are the twelve classes with
// three colours; every other class has exactly one, so only index 0 is valid for it.
//
// Read out of the decoded appearance table (bsf-client/misc/factions_character_classes.json):
// 30 classes, of which these 12 have three appearances. Note these are class ids (singular)
// and are NOT the unlock ids in UNIVERSAL_UNLOCK_IDS above, which are plural -- `siegearcher`
// the class, `var_siegearchers` the unlock. Re-derive both together if the game's data changes.
//
// This is a copy of the game's data and can therefore drift out of step with it. It fails in
// the safe direction: a colour we do not know about is refused with 400, which the game does
// not retry. Accepting any index instead would let a colour that does not exist be SAVED onto
// a unit, and the game would then look up a missing appearance every time it drew that unit.
const THREE_COLOUR_CLASSES: ReadonlySet<string> = new Set([
    "axemaster",
    "backbiter",
    "bowmaster",
    "provoker",
    "shieldmaster",
    "siegearcher",
    "skystriker",
    "strongarm",
    "thrasher",
    "warhawk",
    "warleader",
    "warmaster",
]);

export function appearanceCountFor(entityClass: string): number {
    return THREE_COLOUR_CLASSES.has(entityClass) ? 3 : 1;
}
