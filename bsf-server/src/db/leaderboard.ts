// Builds the /game/leaderboards response live from the DB.
//
// Real players (the `ranking` table) are merged *into* the preserved historical
// baseline from data/lboard.json — so the original 2013 leaderboard names stay
// on the board and live players climb in by value. Each requester also gets
// their own true value + rank against the combined set (the static file used to
// hardcode user_value/user_rank, so nobody ever saw their real standing).
//
// Metric-per-board mapping is ported verbatim from the Java reference
// `tbs.srv.data.LeaderboardData.getLeaderboard` switch.

import { readFileSync } from "fs";
import { query } from "./connection";
import { ServerClasses } from "../const";
import { ELO_BEGIN } from "../services/battle/ranking";

// Steam IDs are very large numbers, all greater than this base constant. A
// Steam player's in-game account_id is their Steam ID minus the base. Smaller
// (non-Steam) ids are below the base and are used unchanged.
//
// This MUST match how Session derives account_id in auth.ts (plain Number math,
// not BigInt): every ranking.account_id was stored that way, so converting a
// user_id any other way here would produce a different number and the name
// lookup would miss. The base is exactly representable in IEEE 754, so applying
// the same conversion to the same stored user_id always lands on the same value.
const STEAM_ID_BASE = 76561197960265728;

function accountIdFromUserId(user_id: string): number {
    const uid = Number(user_id);
    // Steam id → subtract the base; non-Steam id → use as-is.
    return uid >= STEAM_ID_BASE ? uid - STEAM_ID_BASE : uid;
}

export type LeaderboardType =
    | "ELO"
    | "WINS"
    | "LOSSES"
    | "WINLOSS"
    | "TOTAL"
    | "WIN_STREAK"
    | "BEST_WIN_STREAK";

// Every board the server knows how to build.
const ALL_TYPES: readonly LeaderboardType[] = [
    "ELO",
    "WINS",
    "LOSSES",
    "WINLOSS",
    "TOTAL",
    "WIN_STREAK",
    "BEST_WIN_STREAK",
];

// What the client requests when it doesn't specify (matches capture 0003_c.txt).
const DEFAULT_BOARD_IDS: readonly LeaderboardType[] = [
    "ELO",
    "WINS",
    "WINLOSS",
    "TOTAL",
    "BEST_WIN_STREAK",
    "WIN_STREAK",
];

const BOARD_DISPLAY_LEN = 20; // GET_BOARD_LEN in the Java reference
const MAX_ENTRIES = 1000;

type RankingRow = {
    account_id: number;
    battle_elo: number;
    battle_wins: number;
    battle_losses: number;
    win_streak: number;
    best_win_streak: number;
};

// A player with no ranking row yet ranks at the starting Elo, zero everything
// else — mirrors getOrCreateRanking's default row.
const DEFAULT_RANKING: Omit<RankingRow, "account_id"> = {
    battle_elo: ELO_BEGIN,
    battle_wins: 0,
    battle_losses: 0,
    win_streak: 0,
    best_win_streak: 0,
};

// The single value a given board ranks on, for one ranking row.
function metricValue(type: LeaderboardType, r: RankingRow): number {
    switch (type) {
        case "ELO":
            return r.battle_elo;
        case "WINS":
            return r.battle_wins;
        case "LOSSES":
            return r.battle_losses;
        case "TOTAL":
            return r.battle_wins + r.battle_losses;
        case "WINLOSS":
            return r.battle_losses > 0 ? r.battle_wins / r.battle_losses : r.battle_wins;
        case "WIN_STREAK":
            return r.win_streak;
        case "BEST_WIN_STREAK":
            return r.best_win_streak;
    }
    // Unreachable — every LeaderboardType is handled above.
    throw new Error(`unknown leaderboard type: ${type as string}`);
}

// --- Historical baseline, loaded once from data/lboard.json on module load ---

type Entry = { display_name: string; value: number };

// The raw parsed file, re-exported so the route can serve it verbatim as a
// last-resort fallback if the DB build throws.
export let STATIC_LEADERBOARDS_RAW: any = null;

// leaderboard_type -> the 20 original name/value pairs.
const STATIC_BASELINE: Map<string, Entry[]> = new Map();

try {
    STATIC_LEADERBOARDS_RAW = JSON.parse(readFileSync("./data/lboard.json", "utf-8"));
    for (const board of STATIC_LEADERBOARDS_RAW.boards ?? []) {
        const names: string[] = board.display_names ?? [];
        const values: number[] = board.values ?? [];
        STATIC_BASELINE.set(
            board.leaderboard_type,
            names.map((display_name, i) => ({ display_name, value: values[i] ?? 0 })),
        );
    }
} catch (err) {
    console.error("[LEADERBOARD] Failed to load data/lboard.json baseline:", err);
}

// account_id -> display name, resolved from the accounts table (keyed on the
// full 64-bit user_id). See accountIdFromUserId above for why this uses Number.
async function loadNameMap(): Promise<Map<number, string>> {
    const rows = await query<{ user_id: string; username: string }>(
        `SELECT user_id, username FROM accounts`,
    );
    const map = new Map<number, string>();
    for (const { user_id, username } of rows) {
        if (user_id == null) continue;
        const account_id = accountIdFromUserId(String(user_id));
        if (Number.isFinite(account_id)) map.set(account_id, username);
    }
    return map;
}

export type LeaderboardData = {
    class: ServerClasses;
    leaderboard_type: string;
    display_names: string[];
    values: number[];
    user_value: number;
    user_rank: number;
    user_display_name: string | null;
    tourney_id: number;
    account_ids: null;
    tourney_name: null;
};

export type LeaderboardsData = {
    class: ServerClasses;
    boards: LeaderboardData[];
    max_entries: number;
};

export async function buildLeaderboards(
    account_id: number,
    tourney_id: number,
    board_ids?: string[],
): Promise<LeaderboardsData> {
    const requested: readonly string[] =
        board_ids && board_ids.length ? board_ids : DEFAULT_BOARD_IDS;
    const types = requested.filter((t): t is LeaderboardType =>
        (ALL_TYPES as readonly string[]).includes(t),
    );

    // One pass over the ranking table + the name lookup; everything else is in-memory.
    const [rankingRows, nameMap] = await Promise.all([
        query<RankingRow>(
            `SELECT account_id, battle_elo, battle_wins, battle_losses, win_streak, best_win_streak
             FROM ranking WHERE tourney_id = ?`,
            [tourney_id],
        ),
        loadNameMap(),
    ]);

    const myRow = rankingRows.find((r) => r.account_id === account_id);
    const myRanking: RankingRow = myRow ?? { account_id, ...DEFAULT_RANKING };

    const boards: LeaderboardData[] = types.map((type) => {
        const dbEntries: Entry[] = rankingRows.map((r) => ({
            display_name: nameMap.get(r.account_id) ?? `Player ${r.account_id}`,
            value: metricValue(type, r),
        }));

        // Merge live players into the preserved historical baseline, highest first.
        const merged = [...(STATIC_BASELINE.get(type) ?? []), ...dbEntries].sort(
            (a, b) => b.value - a.value,
        );

        const top = merged.slice(0, BOARD_DISPLAY_LEN);
        const userValue = metricValue(type, myRanking);
        // Rank = 1 + everyone strictly above you (ties share a rank).
        const userRank = merged.filter((e) => e.value > userValue).length + 1;

        return {
            class: ServerClasses.LEADERBOARD_DATA,
            leaderboard_type: type,
            display_names: top.map((e) => e.display_name),
            values: top.map((e) => e.value),
            user_value: userValue,
            user_rank: userRank,
            user_display_name: nameMap.get(account_id) ?? null,
            tourney_id,
            account_ids: null,
            tourney_name: null,
        };
    });

    return {
        class: ServerClasses.LEADERBOARDS_DATA,
        boards,
        max_entries: MAX_ENTRIES,
    };
}
