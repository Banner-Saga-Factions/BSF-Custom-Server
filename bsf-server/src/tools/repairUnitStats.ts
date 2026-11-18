// A one-time repair of saved units whose numbers sit outside their class's range (#409).
//
// Units promoted before #410 kept the numbers of the class they came from: a Strongarm promoted
// from a Shieldbanger still had the Shieldbanger's RANGE of 1, where a Strongarm is allowed 2 to 4.
// The game corrects each one when it loads the unit and writes an error line to the player's log
// for it. This brings the saved numbers up to what the game expects, using the same rule a
// promotion uses (planUnitRepair in src/unitStats.ts). It only ever raises a number; anything it
// would have to lower, and any unit it cannot judge, is left as stored and listed.
//
// Run it inside the app's container, where it is built to /app/tools/repairUnitStats.js:
//
//     node tools/repairUnitStats.js                    # count only: what would change
//     node tools/repairUnitStats.js --account 1234     # one account's units, before and after
//     node tools/repairUnitStats.js --apply            # snapshot, then repair (app stopped!)
//
// With no file named it reads whatever DB_PATH points at, which is the live database. The full
// runbook, with where each command runs, is docs/Deployment.md -> "Repairing saved units (#409)".
//
// Count mode opens the file read-only, so it cannot change it. --apply must run with the app
// stopped: a signed-in player's roster is held in the server's memory and written back whole on
// their next promotion, battle or rename, over the repair. --apply asks for "yes", copies the
// database to before-unit-repair-<UTC time>.db beside it, opens that copy to prove it reads and
// holds every account, and only then writes, every change in one transaction. It then counts again.
//
// The report names an account by its in-game account number and a unit by its id, never by the
// Steam or Discord id or the username, so it can be pasted into the issue.
//
// It opens the database file itself rather than through src/db/connection.ts, because that module
// creates a missing database and upgrades an old one, and a repair script should do neither.

import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync, readSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { HeldBackStat, planUnitRepair, RaisedStat } from "../unitStats";

export interface RepairIo {
    out(line: string): void;
    err(line: string): void;
    // Ask a question and resolve with what was typed ("" when nothing can be read).
    confirm(question: string): Promise<string>;
    env: Record<string, string | undefined>;
    now(): Date;
}

const USAGE = "usage: node tools/repairUnitStats.js [--apply | --account <number>] [path]   (or set DB_PATH)";

interface Options {
    path: string;
    apply: boolean;
    account?: number;
}

type Parsed = { options: Options } | { exit: number; out?: string; err?: string[] };

// Sort the arguments before anything is opened. A switch the script does not know is refused, so
// a typo such as --aply cannot fall through to a run that does something else.
export function parseArgs(args: string[], env: RepairIo["env"]): Parsed {
    if (args.includes("--help") || args.includes("-h")) return { exit: 0, out: USAGE };
    const refuse = (why: string): Parsed => ({ exit: 1, err: [why, USAGE] });
    let apply = false;
    let account: number | undefined;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--apply") apply = true;
        else if (a === "--account") {
            const value = args[++i];
            if (value === undefined || !/^[1-9]\d{0,9}$/.test(value))
                return refuse("--account needs an account number");
            account = Number(value);
        } else if (a.startsWith("-")) return refuse(`unknown option: ${a}`);
        else files.push(a);
    }
    if (apply && account !== undefined) return refuse("--account only counts; it cannot be used with --apply");
    if (files.length > 1) return refuse(`expected one file, got ${files.length}: ${files.join(", ")}`);
    const path = files[0] ?? env.DB_PATH;
    if (!path) return refuse("no database named, and DB_PATH is not set");
    return { options: { path, apply, account } };
}

// Is this a database at all? Asked before opening it, so the answer is a sentence.
function notADatabase(path: string): string | undefined {
    try {
        const fd = openSync(path, "r");
        const head = Buffer.alloc(16);
        const got = readSync(fd, head, 0, 16, 0);
        closeSync(fd);
        if (got < 16 || head.toString("latin1") !== "SQLite format 3\0") return `not a database: ${path}`;
        return undefined;
    } catch (err: any) {
        return `cannot read ${path}: ${err?.code || err?.message}`;
    }
}

interface Where {
    account: string;
    unit: string;
    cls: string;
}

interface Scan {
    accounts: number;
    // The new roster text for each account that changes. Holds user_id, so it is never printed.
    changes: { userId: string; roster: string }[];
    unitsToChange: number;
    raisedOn: Map<string, number>;
    heldBack: (Where & HeldBackStat)[];
    rankOutOfRange: (Where & { rank: unknown; minRank: number; maxRank: number })[];
    unknownClass: Where[];
    badShape: Where[];
    unreadable: { account: string; reason: string }[];
    // One line per unit, filled only for --account.
    detail: string[];
}

// Print a stored value without letting it carry anything odd onto the operator's screen.
const show = (value: unknown): string =>
    value === undefined
        ? "(none)"
        : String(value)
              .replace(/[^\x20-\x7e]/g, "?")
              .slice(0, 64);

const statList = (stats: any[]): string => stats.map((s: any) => `${show(s?.stat)} ${show(s?.value)}`).join(", ");

const raisedText = (r: RaisedStat): string => `${r.stat} ${r.from === undefined ? "(none)" : r.from} -> ${r.to}`;

interface AccountRow {
    user_id: string;
    roster_json: string;
    account_id: number | null;
}

function readAccounts(db: DatabaseSync, account?: number): AccountRow[] {
    const hasNumbers = db
        .prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'account_numbers'")
        .get();
    if (!hasNumbers) {
        if (account !== undefined) throw new Error("this database has no account numbers, so --account cannot work");
        return db
            .prepare("SELECT user_id, roster_json, NULL AS account_id FROM accounts ORDER BY rowid")
            .all() as unknown as AccountRow[];
    }
    const sql = `SELECT a.user_id, a.roster_json, n.account_id FROM accounts a
                 LEFT JOIN account_numbers n ON n.external_id = a.user_id`;
    if (account !== undefined) {
        return db.prepare(`${sql} WHERE n.account_id = ?`).all(account) as unknown as AccountRow[];
    }
    return db.prepare(`${sql} ORDER BY n.account_id, a.rowid`).all() as unknown as AccountRow[];
}

function emptyScan(accounts: number): Scan {
    return {
        accounts,
        changes: [],
        unitsToChange: 0,
        raisedOn: new Map(),
        heldBack: [],
        rankOutOfRange: [],
        unknownClass: [],
        badShape: [],
        unreadable: [],
        detail: [],
    };
}

// Work out what the repair would do to every account (or one), changing nothing.
function scan(db: DatabaseSync, account?: number): Scan {
    const rows = readAccounts(db, account);
    const result = emptyScan(rows.length);
    for (const row of rows) {
        const label = row.account_id === null ? "account (no number)" : `account ${row.account_id}`;
        let roster: unknown;
        try {
            roster = JSON.parse(row.roster_json);
        } catch {
            result.unreadable.push({ account: label, reason: "roster is not valid JSON" });
            continue;
        }
        if (!Array.isArray(roster)) {
            result.unreadable.push({ account: label, reason: "roster is not a list" });
            continue;
        }
        let changed = false;
        const repaired = roster.map((unit: any) => {
            const next = scanUnit(unit, label, result, account !== undefined);
            if (next !== unit) changed = true;
            return next;
        });
        if (changed) result.changes.push({ userId: row.user_id, roster: JSON.stringify(repaired) });
    }
    return result;
}

// One unit: record what the repair finds, and return the unit to save (the same object if unchanged).
function scanUnit(unit: any, account: string, result: Scan, withDetail: boolean): any {
    const where: Where = { account, unit: show(unit?.id), cls: show(unit?.entityClass) };
    const plan = planUnitRepair(unit);
    const head = `  ${where.unit} (${where.cls})`;
    if (plan.kind === "unknown-class") result.unknownClass.push(where);
    else if (plan.kind === "bad-shape") result.badShape.push(where);
    else if (plan.kind === "rank-out-of-range") {
        result.rankOutOfRange.push({ ...where, rank: plan.rank, minRank: plan.minRank, maxRank: plan.maxRank });
    }
    if (plan.kind !== "ok") {
        if (withDetail) result.detail.push(`${head}: left alone (${plan.kind})`);
        return unit;
    }
    for (const h of plan.heldBack) result.heldBack.push({ ...where, ...h });
    if (withDetail) {
        result.detail.push(`${head}: stored ${statList(unit.stats)}`);
        const changes = plan.raised.length === 0 ? "no change" : plan.raised.map(raisedText).join(", ");
        result.detail.push(`      repair: ${changes}`);
        for (const h of plan.heldBack) {
            result.detail.push(`      kept: ${h.stat} ${h.stored} (the rule would lower it to ${h.ruleWants})`);
        }
    }
    if (plan.raised.length === 0) return unit;
    result.unitsToChange++;
    for (const stat of new Set(plan.raised.map((r) => r.stat))) {
        result.raisedOn.set(stat, (result.raisedOn.get(stat) ?? 0) + 1);
    }
    return { ...unit, stats: plan.stats };
}

function report(s: Scan, out: (line: string) => void): void {
    out(`Accounts read: ${s.accounts}`);
    out(`Accounts that would change: ${s.changes.length}`);
    out(`Units that would change: ${s.unitsToChange}`);
    for (const [stat, n] of [...s.raisedOn].sort(([a], [b]) => a.localeCompare(b))) {
        out(`  ${stat} raised on ${n} unit${n === 1 ? "" : "s"}`);
    }
    const list = <T>(title: string, items: T[], line: (item: T) => string) => {
        out(`${title}: ${items.length}`);
        for (const item of items) out(`  ${line(item)}`);
    };
    const at = (w: Where) => `${w.account}, unit ${w.unit} (${w.cls})`;
    list("Numbers kept as stored, because the rule would lower them", s.heldBack, (h) => {
        return `${at(h)}: ${h.stat} stored ${h.stored}, the rule wants ${h.ruleWants}`;
    });
    list("Units left alone, because their rank is missing or outside their class's range", s.rankOutOfRange, (r) => {
        return `${at(r)}: RANK ${show(r.rank)}, the class allows ${r.minRank} to ${r.maxRank}`;
    });
    list("Units left alone, because the class table does not know their class", s.unknownClass, at);
    list("Units left alone, because they are not shaped as expected", s.badShape, at);
    list("Rosters left alone, because they could not be read", s.unreadable, (u) => `${u.account}: ${u.reason}`);
}

const count = (db: DatabaseSync): number => (db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as any).n;

// Copy the database beside itself, then open the copy and check it: that it passes SQLite's own
// check and holds as many accounts as the live file. Returns the copy's path, or why it failed.
function takeSnapshot(db: DatabaseSync, path: string, now: Date): { file: string } | { error: string } {
    const stamp = now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z");
    const file = join(dirname(path), `before-unit-repair-${stamp}.db`);
    try {
        db.prepare("VACUUM INTO ?").run(file);
        const copy = new DatabaseSync(file, { readOnly: true });
        try {
            const check = copy.prepare("PRAGMA quick_check").all() as any[];
            if (check.length !== 1 || Object.values(check[0])[0] !== "ok") {
                return { error: `the snapshot ${file} failed its check: ${JSON.stringify(check)}` };
            }
            const inCopy = count(copy);
            const inLive = count(db);
            if (inCopy !== inLive) return { error: `the snapshot holds ${inCopy} accounts, the live file ${inLive}` };
        } finally {
            copy.close();
        }
        return { file };
    } catch (err: any) {
        return { error: `the snapshot ${file} could not be made or opened: ${err?.message}` };
    }
}

// Write every change in one transaction, after checking inside it that the database still says
// what the operator agreed to. Returns undefined on success, or why nothing was written.
function writeChanges(db: DatabaseSync, agreed: Scan): string | undefined {
    db.exec("BEGIN IMMEDIATE");
    try {
        const now = scan(db);
        if (JSON.stringify(now.changes) !== JSON.stringify(agreed.changes)) {
            db.exec("ROLLBACK");
            return "the database changed after the count. Is the app still running? Stop it and start again.";
        }
        const update = db.prepare("UPDATE accounts SET roster_json = ? WHERE user_id = ?");
        for (const change of now.changes) update.run(change.roster, change.userId);
        db.exec("COMMIT");
        return undefined;
    } catch (err: any) {
        try {
            db.exec("ROLLBACK");
        } catch {
            // Already rolled back by SQLite itself.
        }
        return `the write failed: ${err?.message}`;
    }
}

async function apply(db: DatabaseSync, path: string, io: RepairIo): Promise<number> {
    const before = scan(db);
    io.out("Before the repair:");
    report(before, io.out);
    if (before.changes.length === 0) {
        io.out("Nothing to repair. Nothing was written, and no snapshot was taken.");
        return 0;
    }
    io.out("");
    io.out("The app must be stopped before this writes: a signed-in player's units would be written back over it.");
    const answer = await io.confirm(
        `Type yes to repair ${before.unitsToChange} units in ${before.changes.length} accounts: `
    );
    if (answer.trim() !== "yes") {
        io.out("cancelled, nothing changed");
        return 1;
    }
    const snapshot = takeSnapshot(db, path, io.now());
    if ("error" in snapshot) {
        io.err(`Stopped before writing anything: ${snapshot.error}`);
        return 1;
    }
    io.out(`Snapshot: ${snapshot.file} (opened, passed its check, holds every account)`);
    const failed = writeChanges(db, before);
    if (failed) {
        io.err(`Stopped, and nothing was written: ${failed}`);
        return 1;
    }
    io.out(`Repaired ${before.unitsToChange} units in ${before.changes.length} accounts.`);
    io.out("");
    const after = scan(db);
    io.out("After the repair:");
    report(after, io.out);
    return after.changes.length === 0 ? 0 : 1;
}

export async function main(args: string[], io: RepairIo): Promise<number> {
    const parsed = parseArgs(args, io.env);
    if ("exit" in parsed) {
        if (parsed.out) io.out(parsed.out);
        for (const line of parsed.err ?? []) io.err(line);
        return parsed.exit;
    }
    const { path, account } = parsed.options;
    const problem = notADatabase(path);
    if (problem) {
        io.err(problem);
        return 1;
    }
    let db: DatabaseSync | undefined;
    try {
        db = new DatabaseSync(path, { readOnly: !parsed.options.apply });
        if (parsed.options.apply) return await apply(db, path, io);
        const result = scan(db, account);
        if (account !== undefined && result.accounts === 0) {
            io.err(`no account has the number ${account}`);
            return 1;
        }
        io.out("Count only; nothing is written.");
        report(result, io.out);
        if (account !== undefined) {
            io.out(`Units of account ${account}:`);
            for (const line of result.detail) io.out(line);
        }
        return 0;
    } catch (err: any) {
        io.err(`could not read the database: ${err?.message}`);
        return 1;
    } finally {
        db?.close();
    }
}

function askOnTerminal(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        let answered = false;
        rl.question(question, (answer) => {
            answered = true;
            rl.close();
            resolve(answer);
        });
        rl.on("close", () => {
            if (!answered) resolve("");
        });
    });
}

if (require.main === module) {
    const io: RepairIo = {
        out: (line) => console.log(line),
        err: (line) => console.error(line),
        confirm: askOnTerminal,
        env: process.env,
        now: () => new Date(),
    };
    main(process.argv.slice(2), io).then(
        (code) => {
            process.exitCode = code;
        },
        (err) => {
            console.error(err);
            process.exitCode = 1;
        }
    );
}
