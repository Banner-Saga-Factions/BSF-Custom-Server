import { describe, it, expect, vi, beforeEach } from "vitest";
import { query } from "./connection";
import { buildLeaderboards } from "./leaderboard";

// These tests use the real data/lboard.json baseline (loaded by leaderboard.ts
// at import). The ELO board there has 20 entries led by "Hipsterfred" (2500),
// with the lowest at 1610 — the assertions below lean on those fixture facts.

function rankRow(
    account_id: number,
    over: Partial<{
        battle_elo: number;
        battle_wins: number;
        battle_losses: number;
        win_streak: number;
        best_win_streak: number;
    }> = {},
) {
    return {
        account_id,
        battle_elo: 1000,
        battle_wins: 0,
        battle_losses: 0,
        win_streak: 0,
        best_win_streak: 0,
        ...over,
    };
}

// An accounts row for a given account_id. These fixtures use small (sub-base)
// ids, where account_id == user_id, so the production Number-based conversion
// (see leaderboard.ts) maps them back precisely without any rounding.
function acctRow(account_id: number, username: string) {
    return { user_id: String(account_id), username };
}

function mockDb(ranking: any[], accounts: any[]) {
    vi.mocked(query).mockImplementation(async (sql: string) => {
        if (/FROM ranking/i.test(sql)) return ranking as any;
        if (/FROM accounts/i.test(sql)) return accounts as any;
        return [] as any;
    });
}

beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(query).mockResolvedValue([] as any);
});

describe("buildLeaderboards", () => {
    it("merges a top real player above the historical leader and ranks them #1", async () => {
        mockDb([rankRow(5, { battle_elo: 2600 })], [acctRow(5, "NewChamp")]);

        const data = await buildLeaderboards(5, 0, ["ELO"]);

        expect(data.class).toBe("tbs.srv.data.LeaderboardsData");
        expect(data.boards).toHaveLength(1);
        const elo = data.boards[0];
        expect(elo.leaderboard_type).toBe("ELO");
        // 2600 beats the static top (Hipsterfred, 2500)
        expect(elo.display_names[0]).toBe("NewChamp");
        expect(elo.values[0]).toBe(2600);
        expect(elo.display_names[1]).toBe("Hipsterfred");
        expect(elo.user_value).toBe(2600);
        expect(elo.user_rank).toBe(1);
        expect(elo.user_display_name).toBe("NewChamp");
    });

    it("preserves the original top when a real player is below it, but still ranks them", async () => {
        mockDb([rankRow(7, { battle_elo: 1200 })], [acctRow(7, "Rookie")]);

        const elo = (await buildLeaderboards(7, 0, ["ELO"])).boards[0];

        expect(elo.display_names[0]).toBe("Hipsterfred"); // historical leader stays on top
        expect(elo.display_names).not.toContain("Rookie"); // 1200 is below all 20 historical entries
        expect(elo.user_value).toBe(1200);
        expect(elo.user_rank).toBe(21); // 20 historical entries all exceed 1200
    });

    it("treats WINLOSS with zero losses as the win count", async () => {
        mockDb([rankRow(9, { battle_wins: 3, battle_losses: 0 })], [acctRow(9, "Flawless")]);

        const winloss = (await buildLeaderboards(9, 0, ["WINLOSS"])).boards[0];

        expect(winloss.user_value).toBe(3);
    });

    it("defaults a player with no ranking row to the starting Elo", async () => {
        mockDb([], []);

        const elo = (await buildLeaderboards(999, 0, ["ELO"])).boards[0];

        expect(elo.user_value).toBe(1000); // ELO_BEGIN
        expect(elo.user_rank).toBe(21); // below all 20 historical entries
        expect(elo.user_display_name).toBeNull();
        expect(elo.display_names[0]).toBe("Hipsterfred"); // baseline preserved
    });

    it("returns only the requested boards and ignores unknown ids", async () => {
        mockDb([], []);

        const data = await buildLeaderboards(1, 0, ["ELO", "BOGUS"]);

        expect(data.boards).toHaveLength(1);
        expect(data.boards[0].leaderboard_type).toBe("ELO");
    });

    it("defaults to the six standard boards when none are requested", async () => {
        mockDb([], []);

        const data = await buildLeaderboards(1, 0);

        expect(data.boards.map((b) => b.leaderboard_type)).toEqual([
            "ELO",
            "WINS",
            "WINLOSS",
            "TOTAL",
            "BEST_WIN_STREAK",
            "WIN_STREAK",
        ]);
    });
});
