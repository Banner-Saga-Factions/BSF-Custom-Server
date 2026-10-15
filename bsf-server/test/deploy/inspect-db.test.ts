import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { runMigrations } from "../../src/db/migrations";

// Runs the real inspection script as a command, the way an operator does, against database files
// made for the test. What it guards (#283): the player numbers can be printed without any account
// beside them, and a mistyped switch stops instead of printing every account.
const script = resolve(__dirname, "../../deploy/inspect-db.mjs");
const baseTables = readFileSync(resolve(__dirname, "../../src/db/schema.sql"), "utf8");

// One account whose name and id could not turn up by accident in a table of totals.
const NAME = "Ragnhild-Fixture";
const ID = "76561197960265999";

let folder: string;
let full: string; // an account, and two days of player numbers
let quiet: string; // an account, and the numbers table with nothing in it
let old: string; // an account, in a file from before the numbers were kept
let junk: string; // starts like a database and is not one

function makeDatabase(name: string, fill: (db: DatabaseSync) => void): string {
    const file = join(folder, name);
    const db = new DatabaseSync(file);
    db.exec(baseTables);
    db.prepare("INSERT INTO accounts (user_id, username, renown) VALUES (?, ?, 777)").run(ID, NAME);
    fill(db);
    db.close();
    return file;
}

// The suite's own settings point DB_PATH at a database held in memory, and a command started from
// a test inherits them. Each run here names its file, or sets DB_PATH itself.
function run(args: string[], dbPath?: string) {
    const env = { ...process.env };
    delete env.DB_PATH;
    if (dbPath !== undefined) env.DB_PATH = dbPath;
    // A timeout, because a command that hangs would otherwise block the suite's own timer.
    const done = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env, timeout: 10_000 });
    return { status: done.status, out: done.stdout, err: done.stderr, all: done.stdout + done.stderr };
}

beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "bsf-inspect-db-"));
    full = makeDatabase("full.db", (db) => {
        runMigrations(db);
        const add = db.prepare(
            "INSERT INTO activity_hourly (hour, sign_ins, daily_players, find_match_joins, peak_online) VALUES (?, ?, ?, ?, ?)"
        );
        add.run("2026-09-15 18:00:00", 11, 3, 5, 2);
        add.run("2026-09-15 19:00:00", 13, 4, 6, 3);
        add.run("2026-09-16 19:00:00", 20, 9, 8, 6);
    });
    quiet = makeDatabase("quiet.db", (db) => runMigrations(db));
    old = makeDatabase("old.db", () => {});
    junk = join(folder, "junk.db");
    writeFileSync(junk, Buffer.concat([Buffer.from("SQLite format 3\0", "latin1"), Buffer.alloc(4080, 0x41)]));
});

afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
});

describe("the database inspection script, run as a command", () => {
    it("prints the account list when no switch is given, so this file would show a leak", () => {
        const { status, out } = run([full]);
        expect(status).toBe(0);
        expect(out).toContain(NAME);
        expect(out).toContain(ID);
        expect(out).toContain("header bytes 18,19");
        expect(out).toContain("Players per day");
    });

    it.each([
        ["before the file", () => ["--numbers", full]],
        ["after the file", () => [full, "--numbers"]],
    ])("prints only the player numbers with --numbers %s", (_where, args) => {
        const { status, out, all } = run(args());
        expect(status).toBe(0);
        expect(all).not.toContain(NAME);
        expect(all).not.toContain(ID);
        for (const backupCheck of [
            "header bytes",
            "integrity",
            "journal mode",
            "schema version",
            "tables",
            "accounts",
            "user_id",
            "ranking",
            "battle",
            "unlocks",
            "activity_hourly",
        ]) {
            expect(out).not.toContain(backupCheck);
        }
        expect(out).toContain("Players per day");
        expect(out).toContain("Match searches per day");
        expect(out).toContain("Busiest hours");
        expect(out).toContain("2026-09-15");
        expect(out).toContain("2026-09-16");
    });

    it("reads the file DB_PATH names when --numbers is given with no file", () => {
        const { status, out, all } = run(["--numbers"], full);
        expect(status).toBe(0);
        expect(out).toContain("Players per day");
        expect(all).not.toContain(NAME);
    });

    it.each([
        ["before the file", () => ["--number", full]],
        ["after the file", () => [full, "--number"]],
        ["with the real switch beside it", () => ["--numbers", "--acounts", full]],
    ])("stops at a mistyped switch %s, and prints no account", (_where, args) => {
        const { status, out, err, all } = run(args());
        expect(status).toBe(1);
        expect(err).toContain("usage: node inspect-db.mjs");
        expect(err).toContain("unknown option");
        expect(out).toBe("");
        expect(all).not.toContain(NAME);
        expect(all).not.toContain(ID);
    });

    it("stops when given two files, rather than quietly reading the first", () => {
        const { status, out, err } = run(["--numbers", full, quiet]);
        expect(status).toBe(1);
        expect(err).toContain("usage: node inspect-db.mjs");
        expect(out).toBe("");
    });

    it.each(["--help", "-h"])("prints the usage line for %s and finishes normally", (flag) => {
        const { status, out, all } = run([flag, full]);
        expect(status).toBe(0);
        expect(out).toContain("usage: node inspect-db.mjs [--numbers] [path]");
        expect(all).not.toContain(NAME);
    });

    it("says so in one line, and finishes normally, when no numbers have been recorded", () => {
        const { status, out, all } = run(["--numbers", quiet]);
        expect(status).toBe(0);
        expect(out.trim()).toMatch(/^player numbers\s*: none recorded yet$/);
        expect(all).not.toContain(NAME);
    });

    it("says ABSENT, and finishes normally, for a file from before the numbers were kept", () => {
        const { status, out, all } = run(["--numbers", old]);
        expect(status).toBe(0);
        expect(out.trim()).toMatch(/^player numbers\s*: ABSENT$/);
        expect(all).not.toContain(NAME);
    });

    it("still refuses a file that is not a database when --numbers is given", () => {
        const { status, out, err } = run(["--numbers", script]);
        expect(status).toBe(1);
        expect(err).toContain("not a database");
        expect(out).toBe("");
    });

    it("fails, rather than reporting success, for a file that starts like a database and is not one", () => {
        const { status, all } = run(["--numbers", junk]);
        expect(status).toBe(1);
        expect(all).toContain("could not read");
        expect(all).not.toContain(NAME);
    });

    it("stops with the usage line when --numbers is given and no file can be found", () => {
        const { status, out, err } = run(["--numbers"]);
        expect(status).toBe(1);
        expect(err).toContain("usage: node inspect-db.mjs [--numbers] [path]");
        expect(out).toBe("");
    });
});
