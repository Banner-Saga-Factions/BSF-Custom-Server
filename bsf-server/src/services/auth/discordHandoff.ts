import crypto from "crypto";

// #251: signing in through Discord without Steam. The game asks for a hand-off, shows its short
// code and opens the browser; the player signs in to Discord there; the game keeps asking whether
// that has finished, and once it has, signs in with the hand-off's key as its password.
//
// Two secrets, for two readers:
// - the code is short and readable, shown in the game and on the web page so the player can
//   check the two match. It grants nothing by itself: knowing it lets you finish someone's
//   Discord step, never sign in.
// - the key is long and random and only the game holds it. It asks "done yet?" and, once done,
//   signs in -- once.
//
// Held in memory only, like the Discord page's states: a restart drops anyone midway, and they
// press Retry. Imports nothing from auth.ts or discord.ts, so both can import this file.

export const HANDOFF_TTL_MS = 5 * 60 * 1000;

// A ceiling on how many hand-offs wait at once, whatever the number of addresses asking (#301
// pattern): at it, the game is told to try again in a minute and nothing is stored.
export const MAX_PENDING_HANDOFFS = 10_000;

// No 0/O or 1/I, so the player cannot misread the code.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// No "used": a hand-off is forgotten the moment it signs in.
type HandoffState = "pending" | "ready" | "failed";

interface Handoff {
    code: string;
    key: string;
    expiresAt: number;
    state: HandoffState;
    // Set once the Discord step has finished.
    discordId?: string;
    username?: string;
    // Set when the Discord step was refused for good; shown to the player.
    message?: string;
}

// Two indexes over the same entries. No prototype (#311), so a key such as "constructor" finds nothing.
const byKey: Record<string, Handoff> = Object.create(null);
const byCode: Record<string, Handoff> = Object.create(null);

function forget(h: Handoff): void {
    delete byKey[h.key];
    delete byCode[h.code];
}

setInterval(() => {
    const now = Date.now();
    for (const h of Object.values(byKey)) {
        if (now > h.expiresAt) forget(h);
    }
}, 60 * 1000).unref();

function newCode(): string {
    let code = "";
    for (let i = 0; i < 8; i++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Read by the tests.
export const handoffCount = (): number => Object.keys(byKey).length;

// The live hand-off with this code, or undefined when there is none or it has expired.
function liveByCode(code: string): Handoff | undefined {
    const h = byCode[code];
    if (!h) return undefined;
    if (Date.now() > h.expiresAt) {
        forget(h);
        return undefined;
    }
    return h;
}

function liveByKey(key: string): Handoff | undefined {
    const h = byKey[key];
    if (!h) return undefined;
    if (Date.now() > h.expiresAt) {
        forget(h);
        return undefined;
    }
    return h;
}

// A new hand-off, or undefined when too many are already waiting.
export function createHandoff(): { code: string; key: string; expiresIn: number } | undefined {
    if (handoffCount() >= MAX_PENDING_HANDOFFS) return undefined;
    let code = newCode();
    // 32^8 codes, so a clash is very unlikely; but a clash would join two players' sign-ins.
    while (byCode[code]) code = newCode();
    const h: Handoff = {
        code,
        key: crypto.randomBytes(16).toString("hex"),
        expiresAt: Date.now() + HANDOFF_TTL_MS,
        state: "pending",
    };
    byKey[h.key] = h;
    byCode[h.code] = h;
    return { code: h.code, key: h.key, expiresIn: Math.floor(HANDOFF_TTL_MS / 1000) };
}

// Whether the browser may still start the Discord step for this code. True again and again
// while waiting, so the game's Retry can reopen the same page.
export function canStartDiscord(code: string): boolean {
    return liveByCode(code)?.state === "pending";
}

// The Discord step finished for this code. False when the code has gone or was already used.
export function markReady(code: string, discordId: string, username: string): boolean {
    const h = liveByCode(code);
    if (!h || h.state !== "pending") return false;
    h.state = "ready";
    h.discordId = discordId;
    h.username = username;
    return true;
}

// The Discord step was refused for good; the game shows `message` and stops waiting.
export function markFailed(code: string, message: string): void {
    const h = liveByCode(code);
    if (!h || h.state !== "pending") return;
    h.state = "failed";
    h.message = message;
}

export type PollAnswer =
    | { status: "pending" }
    | { status: "ready" }
    | { status: "failed"; message: string }
    | { status: "expired"; message: string };

export const EXPIRED_MESSAGE = "Discord sign-in has expired. Start again from the game.";

// What the game is told when it asks whether the Discord step has finished. Never carries a
// secret: the game already holds the key it signs in with.
export function pollHandoff(key: string): PollAnswer {
    const h = liveByKey(key);
    if (!h) return { status: "expired", message: EXPIRED_MESSAGE };
    if (h.state === "failed") return { status: "failed", message: h.message ?? EXPIRED_MESSAGE };
    return { status: h.state };
}

export type ClaimResult =
    { discordId: string; username: string } | { refused: "not-finished" | "expired" | "failed"; message: string };

// Signing in with a hand-off's key. Works once: a ready hand-off is used up here, before the
// caller does anything else, so two sign-ins racing with one key cannot both get through.
export function claimHandoff(key: string): ClaimResult {
    const h = liveByKey(key);
    if (!h) return { refused: "expired", message: EXPIRED_MESSAGE };
    if (h.state === "pending") {
        return { refused: "not-finished", message: "Discord sign-in is not finished yet. Finish it in your browser." };
    }
    if (h.state === "failed") return { refused: "failed", message: h.message ?? EXPIRED_MESSAGE };
    forget(h);
    return { discordId: h.discordId as string, username: h.username as string };
}

// Tests only: a hand-off whose Discord step has already finished, as if the player had been
// through the browser. Returns its key.
export function readyHandoffForTest(discordId: string, username: string): string {
    const made = createHandoff();
    if (!made) throw new Error("readyHandoffForTest: too many hand-offs waiting");
    markReady(made.code, discordId, username);
    return made.key;
}

// Tests only: forget every hand-off.
export function clearHandoffsForTest(): void {
    for (const h of Object.values(byKey)) forget(h);
}
