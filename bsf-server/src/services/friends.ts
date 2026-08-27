import { ServerClasses } from "../const";
// Import cycle: auth.ts imports announceOnline/announceOffline/pushFriendsSnapshot
// from this file, and this file imports Session/sessionHandler from auth.ts. Safe for
// the same reason the auth <-> lobby cycle is: neither name is touched at module load,
// only inside function bodies that run after both modules have finished evaluating.
// Follow that precedent rather than inventing a third pattern.
import { Session, sessionHandler } from "./auth/auth";

/**
 * #91 - the friends list.
 *
 * The game shows a "Challenge a Friend" screen, and the only way to invite anyone is to
 * pick a name off that screen. We had never sent a list, so the screen was blank and
 * the eight working lobby routes were unreachable from inside the game.
 *
 * Who is on the list: everyone signed in right now, except you. There is no stored
 * friendship and no table, because the game ships no control that changes this list at
 * all - no add, no remove, no search - so it is a read-only view of whatever we send.
 * (Its Steam-overlay button can add a friend on *Steam*, which touches nothing we hold
 * and which the game never reads back.)
 *
 * Three properties of the game's own handling shape everything below:
 *
 *  1. Its list only ever GROWS. It merges what we send by id and has no delete path, so
 *     we can never take a name off someone's screen. A player who signs out is marked
 *     offline instead, which greys the row and blocks the invite.
 *  2. `online: false` is not decoration. The invite button answers "X is currently
 *     offline" and sends nothing, so presence has to be right or the feature is dead.
 *  3. Two fields can break the screen rather than just look wrong - a null name and an
 *     empty avatar path each throw part-way through drawing the list. Both are guarded
 *     here, once, for every entry we build.
 *
 * Known limit, from #140's residual: two accounts whose provider ids happen to derive the
 * same 32-bit id are one person as far as everything below is concerned. They become
 * invisible **to each other** - neither is on the other's list and neither is told when
 * the other arrives - and everyone else sees a single row standing for both, which greys
 * out as soon as either one leaves. Nobody ever sees themselves, which is the property
 * that actually matters. Fixing it needs #140's server-assigned id, not a change here.
 */

// A picture is required: the game's loader throws on an empty path, and the row's own
// placeholder graphic is hidden during setup, so a path that fails to load leaves a
// blank square rather than a fallback. This one is an asset the game already carries in
// its index (the end-of-battle overlay references it by this exact name), so it resolves
// without us hosting anything.
export const FRIEND_AVATAR = "common/achievement/icons/friendmatch_achievement_icon.png";

// The rooms the game reports standing in, taken from its own calls to update the
// player's location. Anything outside this set is dropped rather than passed on: the
// string is rendered on other players' screens, so we forward only what we recognise.
export const GAME_LOCATIONS = new Set<string>([
    "loc_strand",
    "loc_great_hall",
    "loc_mead_house",
    "loc_hall_of_valor",
    "loc_proving_grounds",
    "loc_assemble_heroes",
    "loc_friend_lobby",
    "loc_versus",
    "loc_battle",
    "loc_login_queue",
    "loc_tutorial",
    "map_camp",
]);

export type FriendEntry = {
    // The 32-bit account_id. The game passes this value straight back as the target of
    // /lobby/invite, so it must be the id that session is actually keyed on. Keep it
    // above zero: the game renders anything else greyed as "not a player" (the row is
    // still clickable - only `online` blocks an invite - but the name reads as junk).
    id: number;
    display_name: string;
    location: string | null;
    online: boolean;
    // Deliberately blank. The original server sent the player's real Steam id here, and
    // we could send the Steam id or Discord id we hold - but that identifies a person
    // off-game to everyone signed in, and nothing on the friend row displays it.
    steam_id: string;
    avatar128: string;
    avatar64: string;
    avatar32: string;
    // Always zero for now. The row has a win:loss field and we do hold ranking rows, but
    // ranked results are written to one tournament row and read from another (#198), so
    // any record we showed today would be wrong for exactly the players who have one.
    // Fill these in once #198 lands.
    wins: number;
    losses: number;
    last_battle_time: number;
};

export type FriendsDataPush = {
    class: ServerClasses;
    friends: FriendEntry[];
};

const toEntry = (session: Session): FriendEntry => ({
    id: session.account_id,
    // Never null: the game assigns this straight to a text field as it draws the row,
    // and throws on null, so the list stops drawing there. Nothing appears in any log.
    display_name: session.display_name?.trim() || `Player ${session.account_id}`,
    location: session.location || null,
    online: true,
    steam_id: "",
    avatar128: FRIEND_AVATAR,
    avatar64: FRIEND_AVATAR,
    avatar32: FRIEND_AVATAR,
    wins: 0,
    losses: 0,
    last_battle_time: 0,
});

/**
 * Everyone signed in right now except the caller. Sending an empty list is correct and
 * useful - it is what moves the screen from "waiting for friend list" to "find a friend
 * to battle", so a lone player sees an honest empty grid instead of a permanent wait.
 */
export const buildFriendsData = (selfAccountId: number): FriendsDataPush => ({
    class: ServerClasses.FRIENDS_DATA,
    friends: sessionHandler
        .getSessions((s) => s.account_id !== selfAccountId && s.account_id > 0)
        .map(toEntry),
});

/** Send one player the whole list. Always the whole list - a partial one only adds. */
export const pushFriendsSnapshot = (session: Session): void => {
    session.pushData(buildFriendsData(session.account_id));
};

/**
 * A player has finished signing in. Give them their list, and tell everyone else.
 *
 * Everyone else gets two messages. The list adds the newcomer to their copy, which is
 * what makes the name appear the next time they open the screen. The presence message
 * repaints the row live and makes the game print "<name> has logged in" in chat - the
 * game writes that line itself from this message, and it is the only way a player
 * waiting for company hears about it without watching the friends screen.
 *
 * Cost note: this sends one list per signed-in player, so the work grows with the square
 * of how many people are online. At the handful this server sees that is nothing; past a
 * few hundred it would need to become a delta.
 */
export const announceOnline = (session: Session): void => {
    pushFriendsSnapshot(session);

    const arrival = {
        class: ServerClasses.FRIEND_ONLINE_DATA,
        account_id: session.account_id,
        online: true,
    };
    // Passive: this says somebody ELSE arrived, so it must not count as a sign that the
    // recipient is still there. See Session.pushDataPassive - using pushData here would
    // keep every connected session alive for another half hour on every single login.
    for (const other of sessionHandler.getSessions((s) => s.account_id !== session.account_id)) {
        other.pushDataPassive(buildFriendsData(other.account_id), arrival);
    }
};

/**
 * A player has signed out or been timed out. We cannot take their name off anyone's
 * screen, so mark them offline: the row greys, the invite button refuses, and the game
 * prints "<name> has logged out" in chat.
 *
 * Safe to call whether or not the leaving session is still in the map - the message only
 * ever goes to other accounts, so a session can never receive its own departure.
 */
export const announceOffline = (account_id: number): void => {
    const departure = {
        class: ServerClasses.FRIEND_ONLINE_DATA,
        account_id,
        online: false,
    };
    // Passive, and load-bearing here: the reaper reads each session's last-seen time as
    // it walks them, so refreshing the others mid-sweep would skip them on that same pass.
    for (const other of sessionHandler.getSessions((s) => s.account_id !== account_id)) {
        other.pushDataPassive(departure);
    }
};

/**
 * A player has walked into a different room, so everyone else's copy of their row shows
 * where they are. The game treats this as proof they are online too, which is correct.
 */
export const announceLocation = (account_id: number, location: string): void => {
    const moved = {
        class: ServerClasses.GAME_LOCATION_DATA,
        account_id,
        location,
    };
    for (const other of sessionHandler.getSessions((s) => s.account_id !== account_id)) {
        other.pushDataPassive(moved);
    }
};
