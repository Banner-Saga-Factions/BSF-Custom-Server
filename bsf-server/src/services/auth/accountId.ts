// The one home for the maths that turns a login ID into the in-game player number (#146).
//
// Every login ID (a 64-bit Steam ID or a Discord Snowflake string) must become the
// small 32-bit "player number" (account_id) the game client uses everywhere — entity
// strings, party lookup, ranking rows. This module is the only place that conversion
// is allowed to live. Import it; never re-type the math.
//
// Since #140 the maths gives only a player's USUAL number: the one they are offered the
// first time they sign in. The number they actually play under is handed out once and
// stored (src/db/accountNumbers.ts, table account_numbers); a player whose usual number
// was already taken gets a different one. So outside the first sign-in, read the stored
// number — never recompute it from the id.
//
// LOAD-BEARING — do NOT "modernize" the Steam rule to BigInt. Its exact plain-Number
// rounding (which steps by 16 above 2^53) is frozen by data already on disk:
//   • every account_id already stored in the ranking table was computed this way, and
//   • the start-up step that stores existing accounts' numbers (src/db/accountNumberSeed.ts)
//     works them out the same way, so they keep matching those ranking rows.
// Change the rounding and those stored numbers no longer match what you compute.
// It is also load-bearing INSIDE a battle, not just for stored rows. Both clients merely
// RECEIVE this number, so they can't disagree about it on their own — but each one writes
// it verbatim into every unit's identity string ({account_id}+{index}+{unit_id}) and folds
// that string into the per-turn checksum both sides compare. So the value we hand out is
// part of the lockstep contract: the historical desync came from sending 64-bit Steam IDs
// that each client truncated differently, which is exactly what this 32-bit value prevents.
// See .claude/rules/gotchas.md → "32-bit account IDs", ../../docs/client-contract.md → R2,
// and the client's own docs/battle-engine.md → "Entity ID format — the lockstep contract".

// 76561197960265728 = 2^56 + 2^52 — exactly representable in IEEE 754.
// All personal Steam IDs are >= this base.
export const STEAM_ID_BASE = 76561197960265728;

// Which of three kinds a number arriving on the Steam sign-in route is (#326):
//   "made-up" -- below the base. Players without Steam pick one of these, and the game's
//                README tells them to, so there is no proof to check.
//   "steam"   -- the base up to the base + 2^32 - 1, where every personal Steam number lives.
//   "too-big" -- above that. Not a Steam number, so refused on this route.
// Takes a BigInt and compares as BigInt: a Number this large is rounded to a neighbour.
// BigInt("...") rather than a literal because the build targets ES2017.
const STEAM_RANGE_START = BigInt("76561197960265728");
const STEAM_RANGE_END = BigInt("76561202255233023");
export function steamRouteIdKind(id: bigint): "made-up" | "steam" | "too-big" {
    if (id < STEAM_RANGE_START) return "made-up";
    return id <= STEAM_RANGE_END ? "steam" : "too-big";
}

// The Steam rule: a Steam-sized id has the base subtracted; smaller (non-Steam) ids
// pass through unchanged. Named for the provider on purpose — this is ONLY correct for
// Steam ids. A Discord Snowflake is also >= STEAM_ID_BASE, so running one through here
// yields a wrong ~10^18 value (that was bug #159). Also accepts a string, the exact id
// text the sign-in routes and the accounts table hold — Number() on a number is a no-op,
// so both forms give bit-identical results.
export function accountIdFromSteamId(user_id: number | string): number {
    const uid = Number(user_id);
    return uid >= STEAM_ID_BASE ? uid - STEAM_ID_BASE : uid;
}

// The Discord rule: keep only the Snowflake's low 30 bits — always positive,
// <= 2^30-1, fits the client's signed 32-bit user_id (mirrors the Steam path).
// Two Snowflakes sharing these low bits get the same USUAL number; since #140 the
// stored table gives whichever signs in second a different one.
export function accountIdFromSnowflake(snowflake: string): number {
    return Number(BigInt(snowflake) & BigInt(0x3fffffff));
}

// Screening check for a Discord Snowflake: 1-20 digits AND greater than zero
// (#140 tightening — "0" is not a real account). The regex runs first so BigInt()
// never sees a non-numeric string, which would throw.
export function isValidSnowflake(s: string): boolean {
    return /^\d{1,20}$/.test(s) && BigInt(s) > BigInt(0);
}

// Which sign-in route an id came from. Stored beside each number (#375), because one
// provider's id text can look exactly like the other's.
export type AccountProvider = "steam" | "discord";

// A player's usual number: the one the stored table offers them at first sight (#140).
export function usualAccountId(provider: AccountProvider, idStr: string): number {
    return provider === "steam" ? accountIdFromSteamId(idStr) : accountIdFromSnowflake(idStr);
}
