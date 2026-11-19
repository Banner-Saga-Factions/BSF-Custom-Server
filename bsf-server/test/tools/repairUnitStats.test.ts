import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { runMigrations } from "../../src/db/migrations";
import { main, RepairIo } from "../../src/tools/repairUnitStats";

// The one-time repair of saved units (#409), run against database files made for the test, the
// way the operator runs it on the server. What it guards: count mode never writes; --apply takes
// a snapshot that opens before it writes anything, and a failed snapshot stops it; it writes
// nothing if a roster it counted changed before the write; afterwards a count finds nothing left; and the report never names a player by Steam or Discord id or username.

const baseTables = readFileSync(resolve(__dirname, "../../src/db/schema.sql"), "utf8");

// Ids and names that could not turn up in a report by accident.
const AFFECTED = { id: "76561197960265999", name: "Ragnhild-Fixture", number: 4001 };
const RIGHT = { id: "76561197960266111", name: "Sigrun-Fixture", number: 4002 };
const UNKNOWN = { id: "1098765432109876543", name: "Discord-Fixture", number: 4003 };

const statsOf = (pairs: Record<string, number>) => Object.entries(pairs).map(([stat, value]) => ({ stat, value }));

// Fish's case: a Strongarm saved with the Shieldbanger's RANGE of 1 and ability rank 0.
const strongarm = {
    id: "shieldbanger_vet_2",
    name: "Bjorn",
    entityClass: "strongarm",
    kills: 17,
    appearanceIndex: 2,
    stats: statsOf({
        RANK: 2,
        RANGE: 1,
        STRENGTH: 10,
        ARMOR: 12,
        WILLPOWER: 4,
        EXERTION: 1,
        ARMOR_BREAK: 1,
        MOVEMENT: 3,
        ABILITY_0: 0,
    }),
};
const rightStrongarm = {
    ...strongarm,
    id: "strongarm_ok",
    stats: statsOf({ ...Object.fromEntries(strongarm.stats.map((s) => [s.stat, s.value])), RANGE: 2, ABILITY_0: 1 }),
};
const mystery = { id: "mystery_0", name: "Odd", entityClass: "mystery_class", stats: statsOf({ RANK: 1 }) };

let folder: string;
let dbFile: string;

function makeDatabase(): string {
    const file = join(folder, "bsf.db");
    const db = new DatabaseSync(file);
    db.exec(baseTables);
    runMigrations(db);
    const addAccount = db.prepare("INSERT INTO accounts (user_id, username, roster_json) VALUES (?, ?, ?)");
    const addNumber = db.prepare("INSERT INTO account_numbers (external_id, provider, account_id) VALUES (?, ?, ?)");
    addAccount.run(AFFECTED.id, AFFECTED.name, JSON.stringify([strongarm, rightStrongarm]));
    addAccount.run(RIGHT.id, RIGHT.name, JSON.stringify([rightStrongarm]));
    addAccount.run(UNKNOWN.id, UNKNOWN.name, JSON.stringify([mystery]));
    addNumber.run(AFFECTED.id, "steam", AFFECTED.number);
    addNumber.run(RIGHT.id, "steam", RIGHT.number);
    addNumber.run(UNKNOWN.id, "discord", UNKNOWN.number);
    db.close();
    return file;
}

const NOW = new Date("2026-11-18T12:34:56.789Z");
const SNAPSHOT = "before-unit-repair-20261118T123456Z.db";

// `whileAsking` runs while the script waits for the typed answer, as a running app might write.
async function run(args: string[], answer = "yes", whileAsking?: () => void) {
    const out: string[] = [];
    const err: string[] = [];
    const asked: string[] = [];
    const io: RepairIo = {
        out: (line) => out.push(line),
        err: (line) => err.push(line),
        confirm: async (question) => {
            asked.push(question);
            whileAsking?.();
            return answer;
        },
        env: {},
        now: () => NOW,
    };
    const status = await main(args, io);
    return { status, out: out.join("\n"), err: err.join("\n"), all: [...out, ...err].join("\n"), asked };
}

function rosterOf(file: string, userId: string): any[] {
    const db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare("SELECT roster_json FROM accounts WHERE user_id = ?").get(userId) as any;
    db.close();
    return JSON.parse(row.roster_json);
}

const valueOf = (unit: any, stat: string) => unit.stats.find((s: any) => s.stat === stat)?.value;

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "bsf-repair-units-"));
    dbFile = makeDatabase();
});

afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
});

describe("the unit repair script", () => {
    it("counts what would change, and leaves the file byte-for-byte the same", async () => {
        const before = readFileSync(dbFile);
        const { status, out, asked } = await run([dbFile]);
        expect(status).toBe(0);
        expect(readFileSync(dbFile).equals(before)).toBe(true);
        expect(asked).toEqual([]);
        expect(out).toContain("Accounts read: 3");
        expect(out).toContain("Accounts that would change: 1");
        expect(out).toContain("Units that would change: 1");
        expect(out).toContain("RANGE raised on 1 unit");
        expect(out).toContain("ABILITY_0 raised on 1 unit");
        expect(out).toContain("Units left alone, because the class table does not know their class: 1");
        expect(out).toContain(`account ${UNKNOWN.number}, unit mystery_0 (mystery_class)`);
    });

    it("never prints a Steam or Discord id or a username", async () => {
        for (const args of [[dbFile], ["--account", String(AFFECTED.number), dbFile], ["--apply", dbFile]]) {
            const { all } = await run(args);
            for (const secret of [AFFECTED, RIGHT, UNKNOWN]) {
                expect(all).not.toContain(secret.id);
                expect(all).not.toContain(secret.name);
            }
        }
    });

    it("shows one account's units, before and after, with --account", async () => {
        const { status, out } = await run(["--account", String(AFFECTED.number), dbFile]);
        expect(status).toBe(0);
        expect(out).toContain("Accounts read: 1");
        expect(out).toContain("shieldbanger_vet_2 (strongarm): stored RANK 2, RANGE 1");
        expect(out).toContain("repair: RANGE 1 -> 2, ABILITY_0 0 -> 1");
        expect(out).toContain("strongarm_ok (strongarm)");
        expect(out).toContain("repair: no change");
    });

    it("repairs after a typed yes: snapshot first, then every change, then a count that finds nothing", async () => {
        const { status, out, asked } = await run(["--apply", dbFile]);
        expect(asked).toEqual(["Type yes to repair 1 units in 1 accounts: "]);
        expect(status).toBe(0);
        expect(out).toContain(`Snapshot: ${join(folder, SNAPSHOT)}`);
        expect(out).toContain("Repaired 1 units in 1 accounts.");
        expect(out.split("After the repair:")[1]).toContain("Accounts that would change: 0");

        const [fish, other] = rosterOf(dbFile, AFFECTED.id);
        expect(valueOf(fish, "RANGE")).toBe(2);
        expect(valueOf(fish, "ABILITY_0")).toBe(1);
        expect(valueOf(fish, "RANK")).toBe(2);
        const { stats: _s, ...fishRest } = fish;
        const { stats: _t, ...storedRest } = strongarm;
        expect(fishRest).toEqual(storedRest);
        expect(other).toEqual(rightStrongarm);
        expect(rosterOf(dbFile, RIGHT.id)).toEqual([rightStrongarm]);
        expect(rosterOf(dbFile, UNKNOWN.id)).toEqual([mystery]);

        // The snapshot opens, and holds the units as they were before the repair.
        const snapshot = join(folder, SNAPSHOT);
        expect(valueOf(rosterOf(snapshot, AFFECTED.id)[0], "RANGE")).toBe(1);

        const again = await run([dbFile]);
        expect(again.out).toContain("Accounts that would change: 0");
        expect(again.out).toContain("Units that would change: 0");
    });

    it("writes nothing, and takes no snapshot, without a yes", async () => {
        const before = readFileSync(dbFile);
        const { status, out } = await run(["--apply", dbFile], "y");
        expect(status).toBe(1);
        expect(out).toContain("cancelled, nothing changed");
        expect(readFileSync(dbFile).equals(before)).toBe(true);
        expect(readdirSync(folder).filter((f) => f.startsWith("before-unit-repair"))).toEqual([]);
    });

    it("writes nothing when the snapshot cannot be made", async () => {
        // SQLite refuses to copy over a file that already exists.
        writeFileSync(join(folder, SNAPSHOT), "in the way");
        const { status, err } = await run(["--apply", dbFile]);
        expect(status).toBe(1);
        expect(err).toContain("Stopped before writing anything");
        expect(valueOf(rosterOf(dbFile, AFFECTED.id)[0], "RANGE")).toBe(1);
    });

    it("writes nothing when a roster it counted changes before the write", async () => {
        // Stands in for a player the app saved after the count: the repair would now differ.
        const meanwhile = JSON.stringify([{ ...strongarm, kills: 18 }, rightStrongarm]);
        const { status, err } = await run(["--apply", dbFile], "yes", () => {
            const db = new DatabaseSync(dbFile);
            db.prepare("UPDATE accounts SET roster_json = ? WHERE user_id = ?").run(meanwhile, AFFECTED.id);
            db.close();
        });
        expect(status).toBe(1);
        expect(err).toContain("nothing was written: the database changed after the count");
        const check = new DatabaseSync(dbFile, { readOnly: true });
        const row = check.prepare("SELECT roster_json FROM accounts WHERE user_id = ?").get(AFFECTED.id) as any;
        check.close();
        expect(row.roster_json).toBe(meanwhile);
    });

    it("takes no snapshot when there is nothing to repair", async () => {
        await run(["--apply", dbFile]);
        rmSync(join(folder, SNAPSHOT));
        const { status, out, asked } = await run(["--apply", dbFile]);
        expect(status).toBe(0);
        expect(asked).toEqual([]);
        expect(out).toContain("Nothing to repair");
        expect(existsSync(join(folder, SNAPSHOT))).toBe(false);
    });

    it("lists a roster it cannot read, and leaves it alone", async () => {
        const db = new DatabaseSync(dbFile);
        db.prepare("UPDATE accounts SET roster_json = ? WHERE user_id = ?").run("{not json", RIGHT.id);
        db.close();
        const { status, out } = await run(["--apply", dbFile]);
        expect(status).toBe(0);
        expect(out).toContain(`account ${RIGHT.number}: roster is not valid JSON`);
        const check = new DatabaseSync(dbFile, { readOnly: true });
        expect(
            (check.prepare("SELECT roster_json FROM accounts WHERE user_id = ?").get(RIGHT.id) as any).roster_json
        ).toBe("{not json");
        check.close();
    });

    it.each([
        [["--aply"], "unknown option: --aply"],
        [["--apply", "--account", "4001"], "cannot be used with --apply"],
        [["--account"], "--account needs an account number"],
        [["--account", "abc"], "--account needs an account number"],
        [["a.db", "b.db"], "expected one file"],
        [[], "no database named"],
    ])("refuses %j before opening anything", async (args, message) => {
        const before = readFileSync(dbFile);
        const { status, out, err } = await run(args.map((a) => (a === "a.db" ? dbFile : a)));
        expect(status).toBe(1);
        expect(err).toContain(message);
        expect(err).toContain("usage: node tools/repairUnitStats.js");
        expect(out).toBe("");
        expect(readFileSync(dbFile).equals(before)).toBe(true);
    });

    it("refuses a file that is not a database", async () => {
        const junk = join(folder, "junk.db");
        writeFileSync(junk, "hello");
        const { status, err } = await run(["--apply", junk]);
        expect(status).toBe(1);
        expect(err).toContain("not a database");
    });

    it("says so when no account has the number asked for", async () => {
        const { status, err } = await run(["--account", "999999", dbFile]);
        expect(status).toBe(1);
        expect(err).toContain("no account has the number 999999");
    });
});
