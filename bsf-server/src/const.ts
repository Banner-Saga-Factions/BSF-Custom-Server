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


// ---------------------------------------------------------------------------
// How long a player gets per turn, in seconds (#213).
//
// The game chooses this itself and sends it on every /vs/start: the Great Hall
// asks for 45, or 30 when the player has expert mode switched on and for any
// tournament; the friend lobby offers 0, 30 or 60.
//
// Zero means no clock at all, and the game means it literally -- it builds no
// countdown for a zero (BaseBattleState.as:84 is a bare `if(timeoutMs)`), so a
// zero must survive as a zero and must never be swapped for a default.
//
// The upper bound is ours; the original server read the number with no checking
// at all (VsSvc.java:58). The lower bound of zero is load-bearing: the game
// multiplies this by 1000 and hands the result straight to a countdown it builds
// without checking (BattleStateTurnBase.as:31), so a negative would break the
// battle screen for both players, not just the one who sent it.
// ---------------------------------------------------------------------------
export const MAX_TURN_TIMER_SEC = 300;
export const DEFAULT_TURN_TIMER_SEC = 45;


// ---------------------------------------------------------------------------
// What a brand-new account starts with, in renown (#227).
//
// Renown is the game's spending money -- it hires units, promotes them, renames
// them and pays for barracks space. A new account used to be created with none of
// it. That did not stop a new player hiring anybody (sixteen of the eighteen units
// on offer cost nothing), but it did mean they could not promote, rename or
// improve a single one until they had played several battles.
//
// This is a field we dropped when porting, not a new invention. The original
// server read its starting roster, its starting party AND a starting renown number
// out of one starting-account file (GameConfig.java:231), then applied the number
// when the account was set up (AccountInit.java:96). We read a file of the same
// shape (data/acc.json) for the roster and the party in src/db/account.ts and
// skipped the third value, which is still sitting in that file, unused, at 19.
//
// We diverge on the amount deliberately. 19 was tuned for a live game with a store
// attached; the point here is that nobody has to grind first. Hiring and fully
// promoting a completely full barracks -- all 72 slots, every unit at top rank --
// costs about 8,705, or about 9,425 if you rename every one of them too. So this
// covers everything the server charges for, with change to spare.
//
// THE FIVE-DIGIT QUESTION IS OPEN, and this value does not dodge it. An earlier
// draft used 9999 to keep the number four characters long. That buys nothing: a
// first win adds 5 (WIN_AWARD in services/battle/renownAwards.ts), and retiring the
// six rank-2 units a new account starts with refunds 120 -- so five digits arrive
// after one battle, or after none at all. Nobody has yet looked at whether five
// characters fit the banners the game prints this into. See
// .claude/rules/gotchas.md and docs/idea-triage.md before assuming they do.
// ---------------------------------------------------------------------------
export const DEFAULT_STARTING_RENOWN = 10000;

// The game holds renown in a 32-bit signed integer (Legend.as:20 in the decompiled
// client), so anything above this would show the player a wrong number while the
// server kept the true one.
const MAX_STARTING_RENOWN = 2_147_483_647;

// Latch so a misconfigured server says this once rather than on every sign-in --
// same reasoning as warnedNoUnlocksTable in src/services/account.ts.
let warnedBadStartingRenown = false;

// Read at CALL time, not at module load. dotenv's config() runs inside app.ts and
// db/connection.ts, and both evaluate their imports first -- measured 2026-09-02,
// this file is loaded 5th (by services/friends.ts) and the first config() runs
// 12th, so a value computed in this module's body really would be fixed before any
// .env was read. Same pattern, and the same reason, as isLegacyMode() in
// src/services/queue.ts.
//
// A bad value must never break login, which is when this runs. So unlike envInt()
// in queue.ts -- which throws, correctly, for a value read once at boot -- this
// warns and falls back. Zero is deliberately allowed: STARTING_RENOWN=0 turns the
// grant off again without a code change.
//
// isSafeInteger, NOT isInteger, and the difference is not pedantic. Every whole
// number between 2^53 and 2^63 passes isInteger, binds to SQLite as an INTEGER, and
// then makes node:sqlite throw when the row is read back -- which upsertAccount does
// immediately after inserting it. The INSERT has already committed by then, so an
// account created under such a setting can never be read again and every one of its
// future logins fails, even after the bad setting is corrected. An extra zero in
// .env was enough to do that.
export function startingRenown(): number {
    const raw = process.env.STARTING_RENOWN;
    if (raw === undefined || raw.trim() === "") return DEFAULT_STARTING_RENOWN;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0 || n > MAX_STARTING_RENOWN) {
        if (!warnedBadStartingRenown) {
            console.warn(
                `[CONFIG] STARTING_RENOWN must be a whole number between 0 and ${MAX_STARTING_RENOWN} ` +
                `(got "${raw}") -- new accounts will start with ${DEFAULT_STARTING_RENOWN}. Not logged again.`
            );
            warnedBadStartingRenown = true;
        }
        return DEFAULT_STARTING_RENOWN;
    }
    return n;
}
