// Unmock connection so these tests exercise the real DatabaseSync / SQL routing logic.
// All other test files keep the global mock from test/setup.ts untouched.
vi.unmock("./connection");

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { query, queryOne, queryUpdate } from "./connection";

beforeAll(async () => {
    await queryUpdate("DELETE FROM accounts");
});

afterAll(async () => {
    await queryUpdate("DELETE FROM accounts");
});

describe("query()", () => {
    it("returns an array of typed rows for SELECT", async () => {
        await query(
            "INSERT INTO accounts (user_id, username, roster_json, party_ids_json, roster_rows) VALUES (?, ?, '[]', '[]', 1)",
            ["conn_q1", "player1"]
        );
        const rows = await query<{ user_id: string }>(
            "SELECT user_id FROM accounts WHERE user_id = ?",
            ["conn_q1"]
        );
        expect(Array.isArray(rows)).toBe(true);
        expect(rows[0].user_id).toBe("conn_q1");
    });

    it("returns [] for INSERT / UPDATE statements", async () => {
        const result = await query(
            "INSERT INTO accounts (user_id, username, roster_json, party_ids_json, roster_rows) VALUES (?, ?, '[]', '[]', 1)",
            ["conn_q2", "player2"]
        );
        expect(result).toEqual([]);
    });
});

describe("queryOne()", () => {
    it("returns the first matching row", async () => {
        await query(
            "INSERT INTO accounts (user_id, username, roster_json, party_ids_json, roster_rows) VALUES (?, ?, '[]', '[]', 1)",
            ["conn_qo1", "player3"]
        );
        const row = await queryOne<{ user_id: string }>(
            "SELECT user_id FROM accounts WHERE user_id = ?",
            ["conn_qo1"]
        );
        expect(row).not.toBeNull();
        expect(row!.user_id).toBe("conn_qo1");
    });

    it("returns null when no row matches", async () => {
        const row = await queryOne(
            "SELECT * FROM accounts WHERE user_id = ?",
            ["no_such_user"]
        );
        expect(row).toBeNull();
    });
});

describe("queryUpdate()", () => {
    it("returns the number of affected rows", async () => {
        await query(
            "INSERT INTO accounts (user_id, username, roster_json, party_ids_json, roster_rows) VALUES (?, ?, '[]', '[]', 1)",
            ["conn_qu1", "player4"]
        );
        const count = await queryUpdate(
            "UPDATE accounts SET renown = 999 WHERE user_id = ?",
            ["conn_qu1"]
        );
        expect(count).toBe(1);
    });

    it("returns 0 when the WHERE clause matches nothing", async () => {
        const count = await queryUpdate(
            "UPDATE accounts SET renown = 999 WHERE user_id = ?",
            ["no_such_user"]
        );
        expect(count).toBe(0);
    });
});

// Schema-parity guard: if anyone changes the inline schema in connection.ts OR
// a migration without keeping them in sync, this test fails with a clear diff.
// Intentional schema changes require updating the expected array below — that's
// the point, it forces the developer to acknowledge the change in one place.
describe("accounts table schema (post-migration)", () => {
    it("matches the expected column definition after all migrations", async () => {
        const columns = await query<{
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }>("PRAGMA table_info(accounts)");

        expect(columns).toEqual([
            { cid: 0,  name: "user_id",            type: "TEXT",    notnull: 1, dflt_value: null,              pk: 1 },
            { cid: 1,  name: "username",           type: "TEXT",    notnull: 1, dflt_value: null,              pk: 0 },
            { cid: 2,  name: "renown",             type: "INTEGER", notnull: 1, dflt_value: "0",               pk: 0 },
            { cid: 3,  name: "daily_login_streak", type: "INTEGER", notnull: 1, dflt_value: "1",               pk: 0 },
            { cid: 4,  name: "login_count",        type: "INTEGER", notnull: 1, dflt_value: "1",               pk: 0 },
            { cid: 5,  name: "completed_tutorial", type: "INTEGER", notnull: 1, dflt_value: "0",               pk: 0 },
            { cid: 6,  name: "roster_rows",        type: "INTEGER", notnull: 1, dflt_value: "1",               pk: 0 },
            { cid: 7,  name: "roster_json",        type: "TEXT",    notnull: 1, dflt_value: "'[]'",            pk: 0 },
            { cid: 8,  name: "party_ids_json",     type: "TEXT",    notnull: 1, dflt_value: "'[]'",            pk: 0 },
            { cid: 9,  name: "created_at",         type: "TEXT",    notnull: 1, dflt_value: "datetime('now')", pk: 0 },
            { cid: 10, name: "updated_at",         type: "TEXT",    notnull: 1, dflt_value: "datetime('now')", pk: 0 },
        ]);
    });
});
