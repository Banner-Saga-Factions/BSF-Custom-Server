import { ServerClasses } from "../const";
import { hourKey } from "../db/activity";
// Type only, so nothing is loaded: chat.ts imports auth.ts, and auth.ts imports this file.
import type { ChatMessage } from "./chat";

// #337: the chat lines that tell players how many others are online and when the game is busy.
// With few players a match needs two people online at once, and a player looking at an empty
// queue cannot otherwise tell whether to wait or come back later.
//
// Everything here only builds text. The sending is done by sendPlayerNumbers in auth.ts, which
// holds the session list; this file imports nothing from it.
//
// Numbers only, never a name. The game already prints "<name> has logged in" by itself, from the
// presence message friends.ts sends, so the line to everyone else carries just the new count.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// How far back the busy hours look.
const BUSY_HOURS_DAYS = 28;
// How many of the busiest hours the sign-in line names.
const BUSY_HOURS_SHOWN = 3;
// At most one line to everyone else in this time, so a restart, when everyone signs back in at
// once, does not flood the chat. The player signing in always gets their own line.
const ARRIVAL_LINE_GAP_MS = MINUTE_MS;

// The first hour the busy-hours count includes, as the hour key the activity table uses.
export function busyHoursSince(now: number): string {
    return hourKey(now - BUSY_HOURS_DAYS * DAY_MS);
}

// The hours of the day with the most busy days, at most three of them, in clock order. Ties go to
// the earlier hour, so the same history always gives the same line.
export function pickBusiestHours(rows: readonly { utc_hour: number; days: number }[]): number[] {
    return [...rows]
        .filter((row) => row.days > 0)
        .sort((a, b) => b.days - a.days || a.utc_hour - b.utc_hour)
        .slice(0, BUSY_HOURS_SHOWN)
        .map((row) => row.utc_hour)
        .sort((a, b) => a - b);
}

const clock = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

// Hours of the day (0 to 23, in clock order) as ranges, with neighbouring hours joined:
// [19, 20, 21] gives "19:00 to 22:00". 23 and 0 are neighbours too, so [0, 23] gives
// "23:00 to 01:00".
export function formatHourRanges(hours: readonly number[]): string {
    const runs: number[][] = [];
    for (const hour of hours) {
        const last = runs[runs.length - 1];
        if (last && hour === last[last.length - 1] + 1) last.push(hour);
        else runs.push([hour]);
    }
    // A run ending at 23 carries on into one starting at 0.
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].slice(-1)[0] === 23) {
        runs[runs.length - 1].push(...runs.shift()!);
    }
    const ranges = runs.map((run) => `${clock(run[0])} to ${clock(run[run.length - 1] + 1)}`);
    if (ranges.length === 1) return ranges[0];
    return `${ranges.slice(0, -1).join(", ")} and ${ranges[ranges.length - 1]}`;
}

const players = (count: number) => `${count} ${count === 1 ? "player" : "players"}`;

// To the player signing in: "3 players online. Busiest hours: 19:00 to 22:00 UTC." The busy
// hours are left out when no hour has had two or more players online.
export function signInLine(online: number, busyHours: readonly number[]): string {
    const busy = busyHours.length > 0 ? ` Busiest hours: ${formatHourRanges(busyHours)} UTC.` : "";
    return `${players(online)} online.${busy}`;
}

// To everyone else: "3 players online now."
export function arrivalLine(online: number): string {
    return `${players(online)} online now.`;
}

// A line in the game's global chat that comes from the server rather than a player. Same sender
// as the battle-results fallback in Battle.ts.
export function serverChatLine(text: string): ChatMessage {
    return { class: ServerClasses.CHAT_MESSAGE, msg: text, room: "global", user: 0, username: "[server]" };
}

let lastArrivalLineAt: number | null = null;

// True when a line to everyone else may go out now, and if so, counts it as sent. Kept in memory,
// so a restart clears it. A line held back is dropped, not sent later.
export function claimArrivalLine(now: number): boolean {
    if (lastArrivalLineAt !== null && now - lastArrivalLineAt < ARRIVAL_LINE_GAP_MS) return false;
    lastArrivalLineAt = now;
    return true;
}

// For tests only.
export function resetArrivalLineClock(): void {
    lastArrivalLineAt = null;
}
