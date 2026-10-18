import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations";
import { query, queryOne } from "./connection";
import { accountNumberFor } from "./accountNumbers";
import { seedAccountNumbers } from "./accountNumberSeed";
import { buildLeaderboards } from "./leaderboard";

// test/setup.ts swaps the stored-number module for a stand-in that hands back the usual
// number. This file needs the real one.
vi.unmock("./accountNumbers");

// Stored player numbers (#140, #159, #375) against a real in-memory database: the real
// migration runner, the real claiming statement and the real start-up fill, with the mocked
// connection helpers pointed at it (same pattern as unlocks.integration.test.ts).

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

function firstVerb(sql: string): string {
    return sql
        .replace(/--[^\n]*/g, "")
        .trimStart()
        .split(/\s/)[0]
        .toUpperCase();
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
    vi.mocked(queryOne).mockImplementation(
        async (sql: string, params?: any[]) => (db.prepare(sql).get(...(params ?? [])) as any) ?? null
    );
});

const BASE = BigInt("76561197960265728");
const steam = (offset: number) => (BASE + BigInt(offset)).toString();

async function numberOf(provider: "steam" | "discord", id: string): Promise<number> {
    const result = await accountNumberFor(provider, id);
    if (!("account_id" in result)) throw new Error(`refused: ${JSON.stringify(result)}`);
    return result.account_id;
}

function addAccount(userId: string, username: string, createdAt: string): void {
    db.prepare("INSERT INTO accounts (user_id, username, created_at) VALUES (?, ?, ?)").run(userId, username, createdAt);
}

function storedNumbers(): Record<string, number> {
    const rows = db.prepare("SELECT external_id, account_id FROM account_numbers").all() as {
        external_id: string;
        account_id: number;
    }[];
    return Object.fromEntries(rows.map((r) => [r.external_id, Number(r.account_id)]));
}

describe("migration 006 — the account_numbers table", () => {
    it("creates the table with one number per player", () => {
        const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'account_numbers'").get() as {
            sql: string;
        };
        expect(row.sql).toContain("account_id  INTEGER NOT NULL UNIQUE");
    });

    it("is safe to run again", () => {
        expect(() => runMigrations(db)).not.toThrow();
    });
});

describe("accountNumberFor — handing out a number at sign-in (#140)", () => {
    it("gives a new player their usual number when nobody holds it", async () => {
        expect(await numberOf("steam", steam(1008))).toBe(1008);
        expect(await numberOf("steam", "123456")).toBe(123456);
    });

    it("gives the same player the same number every time", async () => {
        const first = await numberOf("steam", steam(1008));
        await numberOf("steam", "77");
        expect(await numberOf("steam", steam(1008))).toBe(first);
    });

    it("gives a made-up 16 and the Steam number that also works out to 16 different numbers", async () => {
        expect(await numberOf("steam", "16")).toBe(16);
        expect(await numberOf("steam", steam(16))).toBe(1);
    });

    it("keeps two Steam numbers apart that round to one usual number", async () => {
        // base+17 and base+18 both round to base+16 as plain Numbers.
        const a = await numberOf("steam", steam(17));
        const b = await numberOf("steam", steam(18));
        expect(a).toBe(16);
        expect(b).not.toBe(a);
    });

    it("keeps two Discord players apart whose ids share their low 30 bits", async () => {
        const a = await numberOf("discord", "1099511640121"); // 2^40 + 12345
        const b = await numberOf("discord", "2199023267897"); // 2^41 + 12345
        expect(a).toBe(12345);
        expect(b).not.toBe(a);
    });

    it("hands out the smallest free number when the usual one is taken", async () => {
        await numberOf("steam", "1");
        await numberOf("steam", "2");
        await numberOf("steam", "16");
        expect(await numberOf("steam", steam(16))).toBe(3);
    });

    it("never hands out a number too big for the game's signed 32-bit field (#166)", async () => {
        expect(await numberOf("steam", "3000000000")).toBe(1);
    });

    it("never hands out 0, which the game cannot sign in with", async () => {
        // The Steam base itself works out to 0.
        expect(await numberOf("steam", steam(0))).toBe(1);
    });
});

describe("accountNumberFor — one route cannot open the other's account (#375)", () => {
    const EARLY_DISCORD = "41771983423143936"; // below the Steam base, as a 2015 Discord id is

    it("refuses the Steam route an id a Discord player holds", async () => {
        const discordNumber = await numberOf("discord", EARLY_DISCORD);
        expect(await accountNumberFor("steam", EARLY_DISCORD)).toEqual({ ownedBy: "discord" });
        // The Discord player still signs in under their own number.
        expect(await numberOf("discord", EARLY_DISCORD)).toBe(discordNumber);
    });

    it("refuses the Discord route an id a Steam player holds", async () => {
        await numberOf("steam", "123456");
        expect(await accountNumberFor("discord", "123456")).toEqual({ ownedBy: "steam" });
    });
});

describe("seedAccountNumbers — existing accounts at start-up", () => {
    it("gives every existing account its usual number", () => {
        addAccount(steam(39734272), "steamer", "2026-09-01 00:00:00");
        addAccount("123456", "madeup", "2026-09-02 00:00:00");
        seedAccountNumbers(db);
        expect(storedNumbers()).toEqual({ [steam(39734272)]: 39734272, "123456": 123456 });
    });

    it("works Steam numbers out with the same rounding the ranking rows were stored with", () => {
        // base+17 is stored as 16 by the plain-Number rule; exact maths would say 17.
        addAccount(steam(17), "rounded", "2026-09-01 00:00:00");
        seedAccountNumbers(db);
        expect(storedNumbers()[steam(17)]).toBe(16);
    });

    it("lets the newest of two accounts sharing a number keep it", () => {
        addAccount(steam(17), "older", "2026-09-02 00:25:38");
        addAccount(steam(18), "newer", "2026-09-23 16:56:26");
        seedAccountNumbers(db);
        const numbers = storedNumbers();
        expect(numbers[steam(18)]).toBe(16);
        expect(numbers[steam(17)]).toBe(1);
        expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain(`${steam(17)} (16 -> 1)`);
    });

    it("files an id above every Steam number under Discord, with its Discord number", () => {
        addAccount("1122976027140956221", "discorder", "2026-09-01 00:00:00");
        seedAccountNumbers(db);
        const row = db.prepare("SELECT provider, account_id FROM account_numbers").get() as any;
        expect(row.provider).toBe("discord");
        expect(Number(row.account_id)).toBe(Number(BigInt("1122976027140956221") & BigInt(0x3fffffff)));
    });

    it("changes nothing when run a second time", () => {
        addAccount(steam(17), "older", "2026-09-02 00:00:00");
        addAccount(steam(18), "newer", "2026-09-23 00:00:00");
        seedAccountNumbers(db);
        const before = storedNumbers();
        seedAccountNumbers(db);
        expect(storedNumbers()).toEqual(before);
    });

    it("leaves a number already stored at sign-in alone", async () => {
        addAccount("16", "madeup", "2026-09-01 00:00:00");
        await numberOf("steam", "16");
        addAccount(steam(16), "steamer", "2026-09-02 00:00:00");
        seedAccountNumbers(db);
        expect(storedNumbers()).toEqual({ "16": 16, [steam(16)]: 1 });
    });
});

describe("leaderboard names (#159)", () => {
    it("shows a Discord player's real name", async () => {
        const snowflake = "1122976027140956221";
        addAccount(snowflake, "DiscordChamp", "2026-09-01 00:00:00");
        const number = await numberOf("discord", snowflake);
        db.prepare("INSERT INTO ranking (account_id, tourney_id, battle_elo) VALUES (?, 0, 2600)").run(number);

        const data = await buildLeaderboards(number, 0, ["ELO"]);

        expect(data.boards[0].display_names[0]).toBe("DiscordChamp");
        expect(data.boards[0].user_display_name).toBe("DiscordChamp");
    });
});
