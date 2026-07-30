// The one home for turning a login ID into the in-game player number (#146).
//
// Every login ID (a 64-bit Steam ID or a Discord Snowflake string) must become the
// small 32-bit "player number" (account_id) the game client uses everywhere — entity
// strings, party lookup, ranking rows. This module is the only place that conversion
// is allowed to live. Import it; never re-type the math.
//
// LOAD-BEARING — do NOT "modernize" the Steam rule to BigInt. Its exact plain-Number
// rounding (which steps by 16 above 2^53) is frozen by data already on disk and by how
// the value is read back:
//   • every account_id already stored in the ranking table was computed this way, and
//   • the leaderboard name lookup re-derives it the same way to join names to rows.
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

// The Steam rule: a Steam-sized id has the base subtracted; smaller (non-Steam) ids
// pass through unchanged. Named for the provider on purpose — this is ONLY correct for
// Steam ids. A Discord Snowflake is also >= STEAM_ID_BASE, so running one through here
// yields a wrong ~10^18 value that never matches its stored account_id (that mismatch is
// bug #159). Also accepts a string because the leaderboard reads ids back from a TEXT
// database column — Number() on a number is a no-op, so both callers get bit-identical
// results.
export function accountIdFromSteamId(user_id: number | string): number {
    const uid = Number(user_id);
    return uid >= STEAM_ID_BASE ? uid - STEAM_ID_BASE : uid;
}

// The Discord rule: keep only the Snowflake's low 30 bits — always positive,
// <= 2^30-1, fits the client's signed 32-bit user_id (mirrors the Steam path).
// Two Snowflakes sharing these low bits land on the SAME account_id; they stay
// distinct DB accounts and distinct sessions (both keyed on the full id string)
// but share ranking rows and in-battle identity — the residual tracked in #140.
export function accountIdFromSnowflake(snowflake: string): number {
    return Number(BigInt(snowflake) & BigInt(0x3fffffff));
}

// Screening check for a Discord Snowflake: 1-20 digits AND greater than zero
// (#140 tightening — "0" is not a real account). The regex runs first so BigInt()
// never sees a non-numeric string, which would throw.
export function isValidSnowflake(s: string): boolean {
    return /^\d{1,20}$/.test(s) && BigInt(s) > BigInt(0);
}
