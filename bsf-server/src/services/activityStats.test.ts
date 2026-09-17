import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addToHour, getHour, getLastSignInAt, setLastSignInAt } from "../db/activity";
import {
    classifySignIn,
    recordQueueJoin,
    recordSearchesMatched,
    recordSearchTimeout,
    recordSignIn,
    sampleActivity,
    startActivitySampler,
    stopActivitySampler,
} from "./activityStats";

// The database functions are replaced, so each test decides what the database says and whether it
// fails. hourKey stays real: which hour a count lands in is part of what these tests check.
// src/db/activity.integration.test.ts runs the same counting against a real database.
vi.mock("../db/activity", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../db/activity")>()),
    getLastSignInAt: vi.fn(),
    setLastSignInAt: vi.fn(),
    addToHour: vi.fn(),
    getHour: vi.fn(),
}));

const STEAM = "76561197960265999";
// 2026-09-16 13:20 UTC, so every count below belongs to the 13:00 hour.
const NOW = Date.UTC(2026, 8, 16, 13, 20, 0);
// A different number in every column, so a label printed beside the wrong number shows up.
const FINISHED_HOUR = {
    hour: "2026-09-16 13:00:00",
    sign_ins: 1, daily_players: 2, new_players: 3, returning_players: 4, find_match_joins: 5,
    challenge_joins: 6, find_match_matched: 7, challenge_matched: 8, search_timeouts: 9, peak_online: 10,
};

beforeEach(() => {
    vi.mocked(getLastSignInAt).mockReset().mockResolvedValue(null);
    vi.mocked(setLastSignInAt).mockReset().mockResolvedValue(undefined);
    vi.mocked(addToHour).mockReset().mockResolvedValue(undefined);
    vi.mocked(getHour).mockReset().mockResolvedValue(null);
    // test/setup.ts silences both; clear what earlier tests printed.
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
    stopActivitySampler();
});

afterEach(() => {
    stopActivitySampler();
    vi.useRealTimers();
});

describe("classifySignIn", () => {
    it.each([
        {
            case: "no earlier sign-in on record",
            previous: null,
            now: Date.UTC(2026, 8, 16, 13, 0, 0),
            want: { isNew: true, isFirstToday: true, isReturning: false },
        },
        {
            case: "an earlier sign-in the same UTC day",
            previous: Date.UTC(2026, 8, 16, 0, 0, 1),
            now: Date.UTC(2026, 8, 16, 23, 59, 59),
            want: { isNew: false, isFirstToday: false, isReturning: false },
        },
        {
            case: "one second before UTC midnight, then one second after",
            previous: Date.UTC(2026, 8, 16, 23, 59, 59),
            now: Date.UTC(2026, 8, 17, 0, 0, 1),
            want: { isNew: false, isFirstToday: true, isReturning: false },
        },
        {
            case: "exactly 14 days later",
            previous: Date.UTC(2026, 8, 1, 12, 0, 0),
            now: Date.UTC(2026, 8, 15, 12, 0, 0),
            want: { isNew: false, isFirstToday: true, isReturning: true },
        },
        {
            case: "one millisecond short of 14 days",
            previous: Date.UTC(2026, 8, 1, 12, 0, 0),
            now: Date.UTC(2026, 8, 15, 11, 59, 59, 999),
            want: { isNew: false, isFirstToday: true, isReturning: false },
        },
    ])("$case", ({ previous, now, want }) => {
        expect(classifySignIn(previous, now)).toEqual(want);
    });
});

describe("recordSignIn", () => {
    it("writes the new sign-in date before it adds to the hour", async () => {
        await recordSignIn(STEAM, NOW);

        expect(setLastSignInAt).toHaveBeenCalledWith(STEAM, NOW);
        expect(addToHour).toHaveBeenCalledTimes(1);
        expect(vi.mocked(setLastSignInAt).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(addToHour).mock.invocationCallOrder[0]);
    });

    it.each([
        {
            case: "a brand-new player",
            previous: null,
            want: { sign_ins: 1, daily_players: 1, new_players: 1, returning_players: 0 },
        },
        {
            case: "a second visit the same day",
            previous: Date.UTC(2026, 8, 16, 9, 0, 0),
            want: { sign_ins: 1, daily_players: 0, new_players: 0, returning_players: 0 },
        },
        {
            case: "a player back after 15 days",
            previous: Date.UTC(2026, 8, 1, 13, 20, 0),
            want: { sign_ins: 1, daily_players: 1, new_players: 0, returning_players: 1 },
        },
    ])("counts $case in the hour the sign-in happened", async ({ previous, want }) => {
        vi.mocked(getLastSignInAt).mockResolvedValue(previous);

        await recordSignIn(STEAM, NOW);

        expect(getLastSignInAt).toHaveBeenCalledWith(STEAM);
        expect(addToHour).toHaveBeenCalledWith("2026-09-16 13:00:00", want);
    });

    it("adds nothing to the hour when the new sign-in date cannot be written", async () => {
        // Adding anyway would count this same visit as new, or as the first of the day, a second
        // time at the next sign-in, because the old date would still be on record.
        vi.mocked(setLastSignInAt).mockRejectedValue(new Error("disk I/O error"));

        await recordSignIn(STEAM, NOW);

        expect(addToHour).not.toHaveBeenCalled();
    });
});

describe("the queue recorders", () => {
    it.each([
        { case: "a Find Match join", record: () => recordQueueJoin(false, NOW), want: { find_match_joins: 1 } },
        { case: "a challenge join", record: () => recordQueueJoin(true, NOW), want: { challenge_joins: 1 } },
        {
            case: "two Find Match searches paired together",
            record: () => recordSearchesMatched([false, false], NOW),
            want: { find_match_matched: 2, challenge_matched: 0 },
        },
        {
            case: "a challenge paired with a Find Match search",
            record: () => recordSearchesMatched([true, false], NOW),
            want: { find_match_matched: 1, challenge_matched: 1 },
        },
        {
            case: "two challenges paired together",
            record: () => recordSearchesMatched([true, true], NOW),
            want: { find_match_matched: 0, challenge_matched: 2 },
        },
        { case: "a search timing out", record: () => recordSearchTimeout(NOW), want: { search_timeouts: 1 } },
    ])("adds $case to the right columns of its hour", async ({ record, want }) => {
        await record();

        expect(addToHour).toHaveBeenCalledTimes(1);
        expect(addToHour).toHaveBeenCalledWith("2026-09-16 13:00:00", want);
    });
});

describe("a database failure never escapes a recorder", () => {
    // No caller waits for a recorder, so a failure that escaped one would not reach the sign-in or
    // search it counts: it would be logged as an unhandled rejection instead.
    it.each([
        { case: "recordSignIn, when reading the last sign-in fails", fail: getLastSignInAt, run: () => recordSignIn(STEAM, NOW) },
        { case: "recordSignIn, when adding to the hour fails", fail: addToHour, run: () => recordSignIn(STEAM, NOW) },
        { case: "recordQueueJoin", fail: addToHour, run: () => recordQueueJoin(false, NOW) },
        { case: "recordSearchesMatched", fail: addToHour, run: () => recordSearchesMatched([false, false], NOW) },
        { case: "recordSearchTimeout", fail: addToHour, run: () => recordSearchTimeout(NOW) },
        { case: "sampleActivity", fail: addToHour, run: () => sampleActivity(NOW, () => 1) },
    ])("$case resolves and logs a [STATS] error", async ({ fail, run }) => {
        vi.mocked(fail as typeof addToHour).mockRejectedValue(new Error("database is locked"));

        await expect(run()).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[STATS]"), expect.any(Error));
    });
});

describe("sampleActivity", () => {
    it("writes the number of players online into the hour it was counted in", async () => {
        const countOnline = vi.fn(() => 7);

        await sampleActivity(NOW, countOnline);

        expect(countOnline).toHaveBeenCalledWith(NOW);
        expect(addToHour).toHaveBeenCalledWith("2026-09-16 13:00:00", { peak_online: 7 });
    });

    it("prints nothing on its first sample", async () => {
        // It cannot tell a finished hour from the one the server happened to start in.
        await sampleActivity(Date.UTC(2026, 8, 16, 14, 0, 30), () => 0);

        expect(getHour).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
    });

    it("prints the finished hour exactly once when the hour changes", async () => {
        vi.mocked(getHour).mockResolvedValue(FINISHED_HOUR);

        await sampleActivity(Date.UTC(2026, 8, 16, 13, 58, 30), () => 0);
        await sampleActivity(Date.UTC(2026, 8, 16, 13, 59, 30), () => 0);
        await sampleActivity(Date.UTC(2026, 8, 16, 14, 0, 30), () => 0);
        await sampleActivity(Date.UTC(2026, 8, 16, 14, 1, 30), () => 0);

        expect(getHour).toHaveBeenCalledTimes(1);
        expect(getHour).toHaveBeenCalledWith("2026-09-16 13:00:00");
        expect(console.log).toHaveBeenCalledTimes(1);
        expect(console.log).toHaveBeenCalledWith(
            "[STATS] 2026-09-16 13:00 UTC sign_ins=1 daily_players=2 new=3 returning=4 find_match=5 " +
                "challenges=6 find_match_matched=7 challenges_matched=8 timeouts=9 peak_online=10"
        );
    });

    it("prints the previous day's last hour when the day changes at midnight", async () => {
        vi.mocked(getHour).mockResolvedValue({ ...FINISHED_HOUR, hour: "2026-09-16 23:00:00" });

        await sampleActivity(Date.UTC(2026, 8, 16, 23, 59, 30), () => 0);
        await sampleActivity(Date.UTC(2026, 8, 17, 0, 0, 30), () => 0);

        expect(getHour).toHaveBeenCalledWith("2026-09-16 23:00:00");
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[STATS\] 2026-09-16 23:00 UTC sign_ins=1 /));
    });
});

describe("startActivitySampler and stopActivitySampler", () => {
    it("samples once a minute, and a second start adds no second timer", () => {
        vi.useFakeTimers();
        const countOnline = vi.fn(() => 0);

        startActivitySampler(countOnline);
        startActivitySampler(countOnline);
        vi.advanceTimersByTime(60_000);
        expect(countOnline).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(60_000);
        expect(countOnline).toHaveBeenCalledTimes(2);
    });

    it("takes no more samples once stopped", () => {
        vi.useFakeTimers();
        const countOnline = vi.fn(() => 0);

        startActivitySampler(countOnline);
        stopActivitySampler();
        vi.advanceTimersByTime(120_000);

        expect(countOnline).not.toHaveBeenCalled();
    });

    it("forgets the hour it last sampled once stopped, so the next first sample prints nothing", async () => {
        vi.mocked(getHour).mockResolvedValue(FINISHED_HOUR);

        await sampleActivity(Date.UTC(2026, 8, 16, 13, 59, 30), () => 0);
        stopActivitySampler();
        await sampleActivity(Date.UTC(2026, 8, 16, 14, 0, 30), () => 0);

        expect(console.log).not.toHaveBeenCalled();
    });
});
