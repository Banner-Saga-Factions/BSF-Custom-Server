import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations";
import { query, queryOne } from "./connection";
import { addToHour, getHour, getLastSignInAt, hourKey, setLastSignInAt } from "./activity";
import { recordSignIn } from "../services/activityStats";

// test/setup.ts replaces the database for the whole suite, so a test that goes through it can only
// check the text of the SQL. That cannot catch a statement SQLite rejects, a conflict clause that
// matches no unique key, or migration 005 never being applied. Same approach as
// unlocks.integration.test.ts: stand a real in-memory database up, run the real migration runner
// on it, and point the mocked connection helpers at it.

// The fresh-install base from src/db/connection.ts. The migrations expect it to exist already.
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

const DAY_MS = 86_400_000;
const STEAM = "76561197960265999";
const OTHER_STEAM = "76561197960265111";

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

describe("migration 005 — dating the accounts that already exist", () => {
    it("dates each account that existed before it ran to a day earlier, and leaves later accounts empty", () => {
        // Its own database, because the account has to exist BEFORE the migration runs.
        const upgraded = new DatabaseSync(":memory:");
        upgraded.exec(INLINE_BASE);
        upgraded.exec("INSERT INTO accounts (user_id, username) VALUES ('existing', 'old hand')");

        const before = Date.now();
        runMigrations(upgraded);
        const after = Date.now();

        upgraded.exec("INSERT INTO accounts (user_id, username) VALUES ('newcomer', 'new face')");
        const stamp = (user_id: string) =>
            (upgraded.prepare("SELECT last_sign_in_at FROM accounts WHERE user_id = ?").get(user_id) as {
                last_sign_in_at: number | null;
            }).last_sign_in_at;

        // The migration reads SQLite's clock, rounded down to a whole second; this test reads Node's.
        // The two are read separately and can disagree by a few milliseconds -- on Windows, SQLite's
        // once came out 8 ms ahead of a Node reading taken after the migration had finished -- so
        // allow a margin on both sides. The mistakes this guards against are far bigger than that:
        // seconds instead of milliseconds, or a missing day.
        expect(stamp("existing")).toBeGreaterThanOrEqual(before - DAY_MS - 2000);
        expect(stamp("existing")).toBeLessThanOrEqual(after - DAY_MS + 1000);
        expect(stamp("newcomer")).toBeNull();
    });
});

describe("hourKey", () => {
    it("files a moment under the UTC hour it falls in", () => {
        expect(hourKey(Date.UTC(2026, 8, 16, 13, 59, 59, 999))).toBe("2026-09-16 13:00:00");
    });

    it("files exactly midnight under the new day", () => {
        expect(hourKey(Date.UTC(2026, 8, 17, 0, 0, 0, 0))).toBe("2026-09-17 00:00:00");
    });
});

describe("hourly totals against real SQLite", () => {
    const HOUR = "2026-09-16 13:00:00";

    it("adds each count to the same column of an hour that already has a row", async () => {
        // A different number in every column, so a count landing in the wrong column shows up.
        await addToHour(HOUR, {
            sign_ins: 1, daily_players: 2, new_players: 3, returning_players: 4, find_match_joins: 5,
            challenge_joins: 6, find_match_matched: 7, challenge_matched: 8, search_timeouts: 9,
        });
        await addToHour(HOUR, {
            sign_ins: 10, daily_players: 20, new_players: 30, returning_players: 40, find_match_joins: 50,
            challenge_joins: 60, find_match_matched: 70, challenge_matched: 80, search_timeouts: 90,
        });

        expect(await getHour(HOUR)).toEqual({
            hour: HOUR,
            sign_ins: 11, daily_players: 22, new_players: 33, returning_players: 44, find_match_joins: 55,
            challenge_joins: 66, find_match_matched: 77, challenge_matched: 88, search_timeouts: 99,
            peak_online: 0,
        });
    });

    it("keeps the hour's highest online count, whether a later sample is higher or lower", async () => {
        // A restart starts sampling again from nothing, so a lower sample must never replace a
        // higher one already stored.
        await addToHour(HOUR, { peak_online: 3 });
        await addToHour(HOUR, { peak_online: 5 });
        await addToHour(HOUR, { peak_online: 4 });

        expect((await getHour(HOUR))?.peak_online).toBe(5);
    });

    it("finds no row for an hour nothing was written to", async () => {
        await addToHour(HOUR, { sign_ins: 1 });

        await expect(getHour("2026-09-16 14:00:00")).resolves.toBeNull();
    });
});

describe("sign-in dates against real SQLite", () => {
    const SIGNED_IN = Date.UTC(2026, 8, 16, 13, 0, 0);

    it("reads back the sign-in time it stored, for that account only", async () => {
        db.exec(`INSERT INTO accounts (user_id, username) VALUES ('${STEAM}', 'first'), ('${OTHER_STEAM}', 'second')`);

        await setLastSignInAt(STEAM, SIGNED_IN);

        await expect(getLastSignInAt(STEAM)).resolves.toBe(SIGNED_IN);
        await expect(getLastSignInAt(OTHER_STEAM)).resolves.toBeNull();
    });

    it("gives nothing for an account with no sign-in on record, or no account at all", async () => {
        db.exec(`INSERT INTO accounts (user_id, username) VALUES ('${STEAM}', 'first')`);

        await expect(getLastSignInAt(STEAM)).resolves.toBeNull();
        await expect(getLastSignInAt("76561197960265222")).resolves.toBeNull();
    });
});

describe("one player's sign-ins, counted against real SQLite", () => {
    it("counts a first visit as new, a second that day as neither, and one 15 days later as returning", async () => {
        db.exec(`INSERT INTO accounts (user_id, username) VALUES ('${STEAM}', 'first')`);

        await recordSignIn(STEAM, Date.UTC(2026, 8, 1, 10, 15, 0));
        await recordSignIn(STEAM, Date.UTC(2026, 8, 1, 11, 15, 0));
        await recordSignIn(STEAM, Date.UTC(2026, 8, 16, 11, 15, 0));

        expect(await getHour("2026-09-01 10:00:00")).toMatchObject({
            sign_ins: 1, daily_players: 1, new_players: 1, returning_players: 0,
        });
        expect(await getHour("2026-09-01 11:00:00")).toMatchObject({
            sign_ins: 1, daily_players: 0, new_players: 0, returning_players: 0,
        });
        expect(await getHour("2026-09-16 11:00:00")).toMatchObject({
            sign_ins: 1, daily_players: 1, new_players: 0, returning_players: 1,
        });
    });
});
