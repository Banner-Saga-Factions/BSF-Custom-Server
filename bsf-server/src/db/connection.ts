import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import path from "path";
import { config } from "dotenv";
import { runMigrations } from "./migrations";

config();

const dbPath = process.env.DB_PATH ?? "data/bsf.db";
const isMemory = dbPath === ":memory:";
const ext = path.extname(dbPath).toLowerCase();
if (!isMemory && ext !== ".db" && ext !== ".sqlite") {
    throw new Error(`DB_PATH must point to a .db or .sqlite file, got: "${dbPath}"`);
}
mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

if (!isMemory) {
    db.exec("PRAGMA journal_mode = WAL");
    const { journal_mode } = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    if (journal_mode !== "wal") {
        console.warn(`[DB] WAL mode not active (current: ${journal_mode}); performance may be degraded on this filesystem`);
    }
}

// IMPORTANT — schema drift warning:
// This inline schema is the *base* for fresh installs only (CREATE IF NOT EXISTS).
// Any change to the column list, types, or defaults below MUST also be applied
// via a migration in src/db/migrations/. Fresh installs run the inline CREATE
// first, then apply migrations. Existing installs skip the inline CREATE and
// rely on migrations alone. Changing the inline DDL *without* a migration means
// fresh installs silently get the new schema while existing installs don't.
db.exec(`
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
`);

// Apply file-based migrations after the inline auto-init. New schema
// changes belong under src/db/migrations/ as NNN_*.sql files; the auto-init
// above is kept only so a brand-new DB still gets the base accounts/battles
// tables without going through migration 0.
runMigrations(db);

// Strip SQL comments before inspecting the verb so leading /* */ or -- comments don't fool the check.
function firstSqlVerb(sql: string): string {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--[^\n]*/g, "")
        .trimStart()
        .split(/\s/)[0]
        .toUpperCase();
}

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
    const stmt = db.prepare(sql);
    const verb = firstSqlVerb(sql);
    if (verb === "SELECT" || verb === "WITH") {
        return stmt.all(...(params ?? [])) as T[];
    }
    stmt.run(...(params ?? []));
    return [];
}

export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
    return (db.prepare(sql).get(...(params ?? [])) as T) ?? null;
}

export async function queryUpdate(sql: string, params?: any[]): Promise<number> {
    return (db.prepare(sql).run(...(params ?? [])).changes as number);
}
