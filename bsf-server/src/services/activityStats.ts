import { ActivityHourRow, addToHour, getHour, getLastSignInAt, hourKey, setLastSignInAt } from "../db/activity";

// Counts what players do (#267), so we can tell whether anything we try brings them back: sign-ins,
// match searches and how they end, and how many players are online at once. The numbers go into
// one database row per UTC hour (src/db/activity.ts) -- totals only, never who.
//
// Everything here that records is called from a sign-in route, the queue, or a timer, and none of
// those may fail because of a statistic. So each recorder catches its own errors, logs them with
// [STATS], and never rejects. Callers do not wait for them either: node:sqlite runs each statement
// synchronously, so waiting gains nothing, and a failure awaited after a route has replied would
// land in that route's own error handling -- which, for sign-in, removes the session it has just
// handed out.
//
// Deliberately imports nothing from auth.ts, which imports this file. The online count is passed
// in as a function instead (countOnlinePlayers, from src/index.ts).

const DAY_MS = 24 * 60 * 60 * 1000;
// A sign-in counts as a returning player when the one before it was at least this long ago.
const RETURNING_AFTER_MS = 14 * DAY_MS;
const SAMPLE_EVERY_MS = 60 * 1000;

export type SignInKind = {
    isNew: boolean;         // no earlier sign-in on record
    isFirstToday: boolean;  // the first sign-in of this UTC day
    isReturning: boolean;   // the previous sign-in was 14 or more days ago
};

// Days are UTC days, counted as whole days since 1970, so they line up with the hour keys.
export function classifySignIn(previous: number | null, now: number): SignInKind {
    if (previous === null) return { isNew: true, isFirstToday: true, isReturning: false };
    return {
        isNew: false,
        isFirstToday: Math.floor(previous / DAY_MS) !== Math.floor(now / DAY_MS),
        isReturning: now - previous >= RETURNING_AFTER_MS,
    };
}

// Count one successful sign-in.
export async function recordSignIn(user_id: string, now: number = Date.now()): Promise<void> {
    try {
        const previous = await getLastSignInAt(user_id);
        // The date goes in before the totals. If the totals then fail, this one visit goes
        // uncounted; the other order would count it as new, or as first of the day, again next time.
        await setLastSignInAt(user_id, now);
        const kind = classifySignIn(previous, now);
        await addToHour(hourKey(now), {
            sign_ins: 1,
            daily_players: kind.isFirstToday ? 1 : 0,
            new_players: kind.isNew ? 1 : 0,
            returning_players: kind.isReturning ? 1 : 0,
        });
    } catch (err) {
        console.error("[STATS] could not count a sign-in:", err);
    }
}

// Count one search accepted into the match queue. isChallenge: the player named an opponent.
export async function recordQueueJoin(isChallenge: boolean, now: number = Date.now()): Promise<void> {
    try {
        await addToHour(hourKey(now), isChallenge ? { challenge_joins: 1 } : { find_match_joins: 1 });
    } catch (err) {
        console.error("[STATS] could not count a queue join:", err);
    }
}

// Count the searches that have just become one battle: one entry per player, saying whether that
// player's own search named an opponent. Counted per player, like joins, so matched / joins is a
// true rate.
export async function recordSearchesMatched(isChallenge: readonly boolean[], now: number = Date.now()): Promise<void> {
    try {
        const challenges = isChallenge.filter((namedOpponent) => namedOpponent).length;
        await addToHour(hourKey(now), {
            find_match_matched: isChallenge.length - challenges,
            challenge_matched: challenges,
        });
    } catch (err) {
        console.error("[STATS] could not count a match:", err);
    }
}

// Count one search the queue dropped after waiting too long for an opponent.
export async function recordSearchTimeout(now: number = Date.now()): Promise<void> {
    try {
        await addToHour(hourKey(now), { search_timeouts: 1 });
    } catch (err) {
        console.error("[STATS] could not count a search timeout:", err);
    }
}

// The hour the last successful sample went into. Null until the first one.
let lastSampledHour: string | null = null;
let samplerHandle: NodeJS.Timeout | undefined;

// One sample: write how many players are online into the current hour and, once the hour has
// changed since the last sample, print the finished hour's totals as one [STATS] line. The first
// sample prints nothing, because it cannot tell a finished hour from the one the server started in.
export async function sampleActivity(now: number, countOnline: (now: number) => number): Promise<void> {
    try {
        const hour = hourKey(now);
        await addToHour(hour, { peak_online: countOnline(now) });
        const finished = lastSampledHour;
        lastSampledHour = hour;
        if (finished === null || finished === hour) return;

        const row = await getHour(finished);
        if (row) console.log(formatHour(row));
    } catch (err) {
        console.error("[STATS] could not take the online sample:", err);
    }
}

function formatHour(row: ActivityHourRow): string {
    return (
        `[STATS] ${row.hour.slice(0, 16)} UTC sign_ins=${row.sign_ins} daily_players=${row.daily_players} ` +
        `new=${row.new_players} returning=${row.returning_players} find_match=${row.find_match_joins} ` +
        `challenges=${row.challenge_joins} find_match_matched=${row.find_match_matched} ` +
        `challenges_matched=${row.challenge_matched} timeouts=${row.search_timeouts} peak_online=${row.peak_online}`
    );
}

// Sample once a minute for as long as the process runs. src/index.ts starts it once the server is
// listening, and no other file does, so importing this module starts no timer. A second call does
// nothing. The timer never keeps the process alive by itself, the same as the matchmaker pump and
// the session reaper.
export function startActivitySampler(countOnline: (now: number) => number): void {
    if (samplerHandle) return;
    samplerHandle = setInterval(() => void sampleActivity(Date.now(), countOnline), SAMPLE_EVERY_MS);
    samplerHandle.unref();
}

// Stop sampling, and forget the last hour seen so that a later start's first sample prints nothing.
export function stopActivitySampler(): void {
    if (samplerHandle) {
        clearInterval(samplerHandle);
        samplerHandle = undefined;
    }
    lastSampledHour = null;
}
