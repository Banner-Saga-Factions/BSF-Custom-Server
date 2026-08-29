import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations";
import { query, queryOne } from "./connection";
import { getUnlockIds, grantUnlock, hasUnlock } from "./unlocks";

// The unit tests next door assert on the SQL *strings* these functions build, because
// test/setup.ts replaces the database for the whole suite. That cannot catch a statement that
// reads correctly and SQLite rejects -- a wrong column name, a conflict clause that matches no
// unique index, or migration 004 never being applied at all.
//
// So this file stands a real in-memory database up, runs the real migration runner against it,
// and points the mocked connection helpers at it. Everything below therefore executes actual
// SQLite: the migration, the upsert, and the two reads.

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
`;

let db: DatabaseSync;

// Mirrors src/db/connection.ts's own dispatch: reads return rows, everything else runs.
function firstVerb(sql: string): string {
    return sql.replace(/--[^\n]*/g, "").trimStart().split(/\s/)[0].toUpperCase();
}

beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(INLINE_BASE);
    runMigrations(db);

    vi.mocked(query).mockImplementation(async (sql: string, params?: any[]) => {
        const stmt = db.prepare(sql);
        if (["SELECT", "WITH", "PRAGMA"].includes(firstVerb(sql))) return stmt.all(...(params ?? [])) as any;
        stmt.run(...(params ?? []));
        return [] as any;
    });
    vi.mocked(queryOne).mockImplementation(async (sql: string, params?: any[]) =>
        (db.prepare(sql).get(...(params ?? [])) as any) ?? null
    );
});

const STEAM = "76561197960265999";

describe("migration 004 — the unlocks table", () => {
    it("creates the table with the composite key the reads rely on", () => {
        const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'unlocks'").get() as { sql: string };
        expect(row).toBeTruthy();
        expect(row.sql).toContain("PRIMARY KEY (user_id, unlock_id)");
    });

    it("is safe to apply to a database that already has it", () => {
        // The runner records applied versions, but the file also has to be re-runnable on its own
        // terms -- a fresh install and an upgrade must end up identical.
        expect(() => runMigrations(db)).not.toThrow();
    });

    it("defaults both time columns to zero, which is what 'never expires' means", () => {
        db.exec("INSERT INTO unlocks (user_id, unlock_id) VALUES ('x', 'bst_renown')");
        const row = db.prepare("SELECT unlock_time, unlock_duration FROM unlocks").get() as any;
        expect(row.unlock_time).toBe(0);
        expect(row.unlock_duration).toBe(0);
    });
});

describe("unlocks round-trip against real SQLite", () => {
    it("stores a grant and reads it back both ways", async () => {
        await grantUnlock(STEAM, "bst_renown");

        await expect(getUnlockIds(STEAM)).resolves.toEqual(["bst_renown"]);
        await expect(hasUnlock(STEAM, "bst_renown")).resolves.toBe(true);
    });

    it("really does accept the same grant twice — the conflict clause matches a real index", async () => {
        // This is the case the string-matching unit test cannot reach: a conflict target that does
        // not correspond to a unique index makes SQLite throw at execution time, not at parse time.
        await grantUnlock(STEAM, "bst_renown");
        await expect(grantUnlock(STEAM, "bst_renown")).resolves.toBeUndefined();

        const count = db.prepare("SELECT COUNT(*) AS n FROM unlocks").get() as { n: number };
        expect(count.n).toBe(1);
    });

    it("keeps one account's unlocks away from another's", async () => {
        await grantUnlock(STEAM, "bst_renown");
        await grantUnlock("76561197960265111", "var_thrashers");

        await expect(getUnlockIds(STEAM)).resolves.toEqual(["bst_renown"]);
        await expect(hasUnlock(STEAM, "var_thrashers")).resolves.toBe(false);
    });

    it("treats a lapsed grant as not held, and a running one as held", async () => {
        await grantUnlock(STEAM, "trial_a", 60_000);
        await expect(hasUnlock(STEAM, "trial_a")).resolves.toBe(true);

        db.exec("UPDATE unlocks SET unlock_time = 1 WHERE unlock_id = 'trial_a'");
        await expect(hasUnlock(STEAM, "trial_a")).resolves.toBe(false);
    });

    it("reports nothing for an account that has never been granted anything", async () => {
        await expect(getUnlockIds("76561197960265222")).resolves.toEqual([]);
        await expect(hasUnlock("76561197960265222", "bst_renown")).resolves.toBe(false);
    });
});
