// Asking Steam whether a sign-in's proof is genuine, and whose it is (#326).
//
// The game sends two things when it signs in through Steam: a Steam number, and a one-time
// proof ("ticket") that the player really owns that number. This module hands the proof to
// Steam and reports the answer. The sign-in route decides what to do with it.
//
// NEVER log the key, the proof, or the address asked: the key travels in the address, and an
// error thrown by a failed request can carry that address in its text. Log the error's name only.

// The game's number on Steam (GameMainAir in the client).
export const STEAM_APP_ID = 219340;
const STEAM_CHECK_URL = "https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/";
export const STEAM_TIMEOUT_MS = 5000;
export const STEAM_RETRY_DELAY_MS = 1000;

// A proof is hex text. The one measured on 2026-10-12 was 468 characters; the ceiling is
// generous and exists only so that junk is turned away without a call to Steam.
const PROOF_SHAPE = /^[0-9a-fA-F]{2,4096}$/;
// Hex text Steam will never accept, for asking a question whose only purpose is to learn
// whether the key works.
const PROBE_PROOF = "00".repeat(32);

// "refused": Steam does not accept the proof, or it belongs to a different number.
// "unreachable": Steam did not give a usable answer in two tries.
// "key-rejected": Steam does not accept this server's key, so it will check nothing for us.
export type SteamTicketResult = "ok" | "refused" | "unreachable" | "key-rejected";

type SteamAnswer =
    | { kind: "confirmed"; steamId: string }
    | { kind: "not-confirmed" }
    | { kind: "key-rejected" }
    | { kind: "no-answer" };

async function askSteam(proof: string, key: string): Promise<SteamAnswer> {
    const url =
        `${STEAM_CHECK_URL}?key=${encodeURIComponent(key)}` +
        `&appid=${STEAM_APP_ID}&ticket=${encodeURIComponent(proof)}`;
    // Give up on a try after STEAM_TIMEOUT_MS; a sign-in must not hang on a silent Steam.
    const giveUp = new AbortController();
    const timer = setTimeout(() => giveUp.abort(), STEAM_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: giveUp.signal });
        // Measured 2026-10-12: a key Steam does not accept gets 403 and the words "Retrying
        // will not help"; a good key with a bad proof gets 200 and an error in the body.
        if (res.status === 403) return { kind: "key-rejected" };
        if (!res.ok) {
            console.warn(`[STEAM] check answered HTTP ${res.status}`);
            return { kind: "no-answer" };
        }
        const params = ((await res.json()) as any)?.response?.params;
        if (params?.result === "OK" && typeof params.steamid === "string") {
            return { kind: "confirmed", steamId: params.steamid };
        }
        return { kind: "not-confirmed" };
    } catch (err) {
        console.warn(`[STEAM] check failed: ${err instanceof Error ? err.name : "unknown error"}`);
        return { kind: "no-answer" };
    } finally {
        clearTimeout(timer);
    }
}

// `claimedId` must be the exact decimal text of the number, never a Number: real Steam
// numbers are above 2^53, where a Number is rounded to a neighbour's.
export async function checkSteamTicket(
    claimedId: string,
    proof: unknown,
    key: string,
    opts: { retryDelayMs?: number } = {}
): Promise<SteamTicketResult> {
    if (typeof proof !== "string" || !PROOF_SHAPE.test(proof)) return "refused";

    let answer = await askSteam(proof, key);
    if (answer.kind === "no-answer") {
        await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? STEAM_RETRY_DELAY_MS));
        answer = await askSteam(proof, key);
    }

    if (answer.kind === "no-answer") return "unreachable";
    if (answer.kind === "key-rejected") return "key-rejected";
    if (answer.kind === "not-confirmed") return "refused";
    // A genuine proof is not enough: it must be this player's. The 2013 server stopped one
    // step short of this and accepted any genuine proof beside any number.
    return answer.steamId === claimedId ? "ok" : "refused";
}

// Run once at start-up: does Steam accept this server's key? "unknown" means Steam could not
// be reached, which says nothing about the key either way.
export async function probeSteamKey(key: string): Promise<"accepted" | "rejected" | "unknown"> {
    const answer = await askSteam(PROBE_PROOF, key);
    if (answer.kind === "key-rejected") return "rejected";
    if (answer.kind === "no-answer") return "unknown";
    return "accepted";
}
