import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations";
import { LEADERBOARD_RANKING_QUERY } from "./leaderboardQuery";

// Drives the REAL migration runner against a throwaway in-memory DB. Imports
// node:sqlite + ./migrations directly (never ./connection), so test/setup.ts's
// connection mock doesn't apply and no real DB file is opened.
//
// INLINE_BASE mirrors what connection.ts creates BEFORE runMigrations: accounts
// (migration 002 rebuilds it, so it must pre-exist) and the legacy battles table
// + its two indexes (so we can prove migration 003 actually drops them). Only the
// columns migration 002 copies actually have to match here; drift surfaces as a
// 002 failure in this test, not a silent pass.
const INLINE_BASE = `
    CREATE TABLE IF NOT EXISTS accounts (
        user_id             TEXT    NOT NULL PRIMARY KEY,
        username            TEXT    NOT NULL,
        renown              INTEGER NOT NULL DEFAULT 0,
        daily_login_streak  INTEGER NOT NULL DEFAULT 1,
        login_count         INTEGER NOT NULL DEFAULT 1,
        completed_tutorial  INTEGER NOT NULL DEFAULT 1,
        roster_rows         INTEGER NOT NULL DEFAULT 1,
        roster_json         TEXT    NOT NULL DEFAULT '[]',
        party_ids_json      TEXT    NOT NULL DEFAULT '[]',
        created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS battles (
        battle_id       TEXT    NOT NULL PRIMARY KEY,
        type            TEXT    NOT NULL,
        winner_user_id  INTEGER,
        loser_user_id   INTEGER,
        renown_awarded  INTEGER NOT NULL DEFAULT 0,
        started_at      TEXT    NOT NULL,
        finished_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_winner ON battles(winner_user_id);
    CREATE INDEX IF NOT EXISTS idx_loser  ON battles(loser_user_id);
`;

function freshDb(): DatabaseSync {
    const db = new DatabaseSync(":memory:");
    db.exec(INLINE_BASE);
    runMigrations(db); // 001 (ranking+battle) -> 002 (rebuild accounts) -> 003 (this change)
    return db;
}

function names(db: DatabaseSync, type: "table" | "index"): string[] {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type = ?").all(type) as {
        name: string;
    }[]).map((r) => r.name);
}

describe("migration 003 — leaderboard index + drop legacy battles", () => {
    it("creates idx_ranking_tourney on ranking", () => {
        expect(names(freshDb(), "index")).toContain("idx_ranking_tourney");
    });

    it("drops the legacy battles table and its indexes", () => {
        const db = freshDb();
        expect(names(db, "table")).not.toContain("battles");
        expect(names(db, "index")).not.toContain("idx_winner");
        expect(names(db, "index")).not.toContain("idx_loser");
    });

    it("makes the leaderboard's per-tournament read use the index, not a full scan", () => {
        // EXPLAIN the *exact* query buildLeaderboards() runs (imported, not copied),
        // so a future reshape that abandons the index fails here. The plan is stable
        // without ANALYZE: SQLite always seeks an index for an equality filter, and
        // the composite PK (account_id, tourney_id) can't serve a tourney_id-only
        // lookup, so an empty, unanalyzed DB deterministically reports the index.
        const plan = freshDb()
            .prepare("EXPLAIN QUERY PLAN " + LEADERBOARD_RANKING_QUERY)
            .all(0) as { detail: string }[];
        expect(plan.map((r) => r.detail).join(" | ")).toContain("idx_ranking_tourney");
    });

    it("is safe to run twice (runner skips already-applied versions)", () => {
        const db = freshDb();
        expect(() => runMigrations(db)).not.toThrow();
        expect(names(db, "index")).toContain("idx_ranking_tourney");
        expect(names(db, "table")).not.toContain("battles");
    });
});
