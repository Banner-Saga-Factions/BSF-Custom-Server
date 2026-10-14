import { describe, it, expect, beforeEach } from "vitest";
import {
    arrivalLine,
    busyHoursSince,
    claimArrivalLine,
    formatHourRanges,
    pickBusiestHours,
    resetArrivalLineClock,
    serverChatLine,
    signInLine,
} from "./playerNumbers";

const DAY_MS = 86_400_000;

describe("pickBusiestHours (#337)", () => {
    it("keeps the three hours with the most busy days, in clock order", () => {
        // The most days belong to the latest hour, so picking by days alone would give [21, 20, 19].
        const rows = [
            { utc_hour: 21, days: 12 },
            { utc_hour: 3, days: 1 },
            { utc_hour: 19, days: 9 },
            { utc_hour: 20, days: 10 },
        ];
        expect(pickBusiestHours(rows)).toEqual([19, 20, 21]);
    });

    it("gives a tie to the earlier hour, so the same history always gives the same line", () => {
        const rows = [
            { utc_hour: 22, days: 4 },
            { utc_hour: 5, days: 4 },
            { utc_hour: 14, days: 4 },
            { utc_hour: 9, days: 4 },
        ];
        expect(pickBusiestHours(rows)).toEqual([5, 9, 14]);
    });

    it("gives nothing when no hour has been busy", () => {
        expect(pickBusiestHours([])).toEqual([]);
    });
});

describe("formatHourRanges (#337)", () => {
    it("joins neighbouring hours into one range that ends when the last hour does", () => {
        expect(formatHourRanges([19, 20, 21])).toBe("19:00 to 22:00");
    });

    it("writes a single hour as a one-hour range", () => {
        expect(formatHourRanges([7])).toBe("07:00 to 08:00");
    });

    it("carries a range on past midnight", () => {
        expect(formatHourRanges([0, 23])).toBe("23:00 to 01:00");
        expect(formatHourRanges([0, 1, 23])).toBe("23:00 to 02:00");
    });

    it("joins 23:00 and 00:00 only when both are there", () => {
        // 23 alone runs on to midnight, and 0 alone is a range of its own.
        expect(formatHourRanges([5, 23])).toBe("05:00 to 06:00 and 23:00 to 00:00");
        expect(formatHourRanges([0, 5])).toBe("00:00 to 01:00 and 05:00 to 06:00");
    });

    it("lists separate ranges with a comma and an 'and'", () => {
        expect(formatHourRanges([2, 19, 20])).toBe("02:00 to 03:00 and 19:00 to 21:00");
        expect(formatHourRanges([2, 9, 19])).toBe("02:00 to 03:00, 09:00 to 10:00 and 19:00 to 20:00");
    });
});

describe("the chat lines (#337)", () => {
    it("tells the newcomer the count and the busy hours", () => {
        expect(signInLine(3, [19, 20, 21])).toBe("3 players online. Busiest hours: 19:00 to 22:00 UTC.");
    });

    it("says 1 player, not 1 players, and leaves busy hours out when there are none", () => {
        expect(signInLine(1, [])).toBe("1 player online.");
    });

    it("tells everyone else only the new count, never a name", () => {
        expect(arrivalLine(3)).toBe("3 players online now.");
    });

    it("comes from the server, in the global room", () => {
        expect(serverChatLine("hi")).toEqual({
            class: "tbs.srv.chat.ChatMsg",
            msg: "hi",
            room: "global",
            user: 0,
            username: "[server]",
        });
    });

    it("looks back 28 days, to the hour", () => {
        const now = Date.UTC(2026, 9, 14, 18, 42);
        expect(busyHoursSince(now)).toBe("2026-09-16 18:00:00");
        expect(busyHoursSince(now + DAY_MS)).toBe("2026-09-17 18:00:00");
    });
});

describe("claimArrivalLine (#337)", () => {
    beforeEach(() => resetArrivalLineClock());

    it("lets one line to everyone else out a minute, and drops the rest", () => {
        const t = 1_000_000;
        expect(claimArrivalLine(t)).toBe(true);
        expect(claimArrivalLine(t + 1_000)).toBe(false);
        expect(claimArrivalLine(t + 59_999)).toBe(false);
        expect(claimArrivalLine(t + 60_000)).toBe(true);
        // Counted from the last line that went out, not from the ones held back.
        expect(claimArrivalLine(t + 119_999)).toBe(false);
        expect(claimArrivalLine(t + 120_000)).toBe(true);
    });
});
