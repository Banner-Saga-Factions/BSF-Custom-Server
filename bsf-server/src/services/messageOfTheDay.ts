import { ServerClasses } from "../const";
// Type only, so nothing is loaded: auth.ts imports this file.
import type { Session } from "./auth/auth";
import { serverChatLine } from "./playerNumbers";

// #269: the message of the day. The operator posts in a category of this project's GitHub
// Discussions that only maintainers can start posts in, and the title of the newest post there is
// shown to each player as they sign in: as a chat line, and as the game's red notice for 30
// seconds. Changing it needs no access to the server machine. A post locked to stop replies still
// counts as open; one that was closed and then locked does not. The operator's steps are in
// docs/Deployment.md -> "The message of the day".
//
// Sign-in never waits on GitHub. The server reads the category every 10 minutes and keeps what it
// found in memory; a sign-in only reads that copy. When GitHub cannot be reached, the last message
// read stays in use.

const LIST_URL = "https://api.github.com/repos/Banner-Saga-Factions/BSF-Custom-Server/discussions?per_page=100";
// Only pages on GitHub's own API are followed, whatever the list's page links say.
const API_ORIGIN = "https://api.github.com/";
const DEFAULT_CATEGORY = "in-game";
// One address may read from GitHub 60 times an hour without signing in. A refresh reads one to
// three pages, so about 18 an hour, plus up to 3 more each time the server starts.
export const REFRESH_EVERY_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
// Two lines of the red notice in a full-size window: about 125 characters fit on a line (measured
// in the game on 2026-10-14).
export const MAX_LENGTH = 200;
export const NOTICE_SHOWN_MS = 30 * 1000;
// Who may set the message. GitHub says how each author is connected to the project; anyone else's
// post is ignored, in case the category is ever opened to everybody.
const TRUSTED_AUTHORS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

// The category's short name as it appears in its web address, which is always lower case, so a
// display name such as "In-Game" is lowered to match. Read when used rather than when this file
// loads, which happens before the .env file is read (see startingRenown in src/const.ts).
export function messageCategory(): string {
    return (process.env.MOTD_DISCUSSION_CATEGORY?.trim() || DEFAULT_CATEGORY).toLowerCase();
}

// Made safe and short for the game. Chat treats text as formatting code and guards only the first
// `<` and the first `>` in a line, so every one is removed. A numeric character code such as &#10;
// becomes a space: the game's text engine would read it as a line break, or as the end of the text.
// That step comes after the `<` and `>` are removed, so removing them cannot build a new code, and
// the space keeps what is left on either side from joining into one. Line breaks and runs of spaces
// become one space. A title longer than MAX_LENGTH is cut at a space where it can be, and ends in "…".
export function cleanText(text: string): string {
    const flat = text
        .replace(/[<>]/g, "")
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
        .replace(/&#x?[0-9a-f]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (flat.length <= MAX_LENGTH) return flat;
    const cut = flat.slice(0, MAX_LENGTH - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// A post that was closed and then locked is listed with the state "locked", and only its closing
// reason (resolved, outdated or duplicate) says it was closed. A locked post that was never closed
// has no reason, and one that was closed and reopened says "reopened" (measured 2026-10-15: 129 of
// 177 locked posts in a large public repository were closed, the other 48 never were). Any other
// reason counts as closed, so one GitHub adds later cannot bring back a post that was taken down.
function isOpen(d: any): boolean {
    if (d.state === "open") return true;
    return d.state === "locked" && (d.state_reason == null || d.state_reason === "reopened");
}

// The title of the newest open post in the category by a trusted author, or null when there is
// none. A closed post counts as taken down, so closing one is a way to remove the message that can
// be undone. A post locked to stop replies still counts as open. Anything in the list that is not
// shaped like a post is skipped.
export function newestTitle(discussions: readonly unknown[], category: string): string | null {
    let newest: { title: string; at: number } | null = null;
    for (const item of discussions) {
        const d = item as any;
        if (typeof d?.title !== "string" || !isOpen(d)) continue;
        if (d.category?.slug !== category || !TRUSTED_AUTHORS.has(d.author_association)) continue;
        const at = Date.parse(d.created_at);
        if (Number.isNaN(at)) continue;
        if (!newest || at > newest.at) newest = { title: d.title, at };
    }
    return newest ? newest.title : null;
}

// The page links GitHub sends with a list, by name ("next", "prev", "last" and so on).
export function parseLinks(header: string | null): Record<string, string> {
    const links: Record<string, string> = {};
    for (const part of (header ?? "").split(",")) {
        const match = /<([^>]+)>\s*;\s*rel="([^"]+)"/.exec(part);
        if (match) links[match[2]] = match[1];
    }
    return links;
}

async function readPage(url: string): Promise<{ items: unknown[]; links: Record<string, string> }> {
    if (!url.startsWith(API_ORIGIN)) throw new Error(`refusing to follow a page link outside GitHub's API: ${url}`);
    // Give up after REQUEST_TIMEOUT_MS, as the Steam check does (steamTicket.ts).
    const giveUp = new AbortController();
    const timer = setTimeout(() => giveUp.abort(), REQUEST_TIMEOUT_MS);
    try {
        // No token: discussions in a public repository can be read without signing in.
        const res = await fetch(url, {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "BSF-Custom-Server",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            signal: giveUp.signal,
        });
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const body: unknown = await res.json();
        if (!Array.isArray(body)) throw new Error("GitHub's answer was not a list");
        return { items: body, links: parseLinks(res.headers.get("link")) };
    } finally {
        clearTimeout(timer);
    }
}

// The message as it stands on GitHub now, cleaned, or "" when there is none. Throws when GitHub
// cannot be read.
async function readMessage(): Promise<string> {
    const category = messageCategory();
    const first = await readPage(LIST_URL);
    // GitHub lists discussions oldest first whatever order is asked for, so the newest are on the
    // last page (measured 2026-10-14; this list is not in GitHub's published API, so the order could
    // change without notice). With one page there is no "last" link.
    if (!first.links.last) return cleanText(newestTitle(first.items, category) ?? "");
    const last = await readPage(first.links.last);
    const found = newestTitle(last.items, category);
    if (found !== null || !last.links.prev) return cleanText(found ?? "");
    // The last page may hold only a post or two, so look one page further back as well.
    const previous = await readPage(last.links.prev);
    return cleanText(newestTitle(previous.items, category) ?? "");
}

let current = "";
let readOnce = false;

// The message players are shown at sign-in, or "" for none.
export function currentMessage(): string {
    return current;
}

// Reads the message from GitHub and keeps it. Never throws: when GitHub cannot be read, the last
// message read stays in use. Logs the message the first time it is read and whenever it changes.
export async function refreshMessage(): Promise<void> {
    try {
        const next = await readMessage();
        if (!readOnce || next !== current) {
            console.log(next ? `[MOTD] message of the day is now: ${next}` : "[MOTD] no message of the day");
        }
        current = next;
        readOnce = true;
    } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        console.warn(`[MOTD] could not read the message of the day from GitHub (${why}); keeping the last one`);
    }
}

let refreshHandle: NodeJS.Timeout | null = null;

// Reads the message now and every REFRESH_EVERY_MS after. Called from src/index.ts once the server
// is listening, so importing the app, as every route test does, reads nothing from GitHub.
export function startMessageRefresh(): void {
    if (refreshHandle) return;
    void refreshMessage();
    refreshHandle = setInterval(() => void refreshMessage(), REFRESH_EVERY_MS);
    refreshHandle.unref();
}

// For tests only.
export function resetMessageForTests(): void {
    current = "";
    readOnce = false;
}

// The game's red notice. It stayed up on the three screens it was seen on until another notice
// replaced it; an empty one removes it (seen in the game on 2026-10-14). Not exported: send one
// through sendNotice, which records it for the clear.
function systemNotice(text: string): { class: ServerClasses; msg: string } {
    return { class: ServerClasses.SYSTEM_MESSAGE, msg: text };
}

// Sends the red notice and records it as the last one this player was sent, so a clear that is
// due later can tell whether something newer has replaced it.
export function sendNotice(session: Session, text: string): void {
    const notice = systemNotice(text);
    session.lastNotice = notice;
    session.pushData(notice);
}

// At sign-in: the message as a chat line, then as the red notice, which is cleared after
// NOTICE_SHOWN_MS unless another notice has been sent to the player since. Nothing when there is no
// message. Never throws -- the message must not undo a sign-in. Called just before the player
// numbers (sendPlayerNumbers in auth.ts), so its chat line comes first.
export function sendMessageOfTheDay(session: Session): void {
    try {
        const text = current;
        if (!text) return;
        session.pushData(serverChatLine(text));
        sendNotice(session, text);
        const shown = session.lastNotice;
        setTimeout(() => {
            try {
                if (session.lastNotice === shown) sendNotice(session, "");
            } catch (err) {
                console.error("[MOTD] could not clear the message of the day notice:", err);
            }
        }, NOTICE_SHOWN_MS).unref();
    } catch (err) {
        console.error("[MOTD] could not send the message of the day:", err);
    }
}
