// Read a database file and say what is in it, without changing it at all. Used
// when restoring a backup, to answer three questions in order: is this file
// really a database, where did it come from, and does it hold the players you
// expected? It ends with the player numbers the server keeps (#267): the last
// week the file holds, day by day, and the busiest hours of the day.
//
// Run it inside the app container, which already has the database software:
//
//     docker compose exec -T app node /tmp/inspect-db.mjs            # the live database
//     docker compose exec -T app node /tmp/inspect-db.mjs /tmp/candidate.db
//
// With no argument it reads whatever DB_PATH points at, which is the live one.
//
// It opens the file read-only, so the database file itself cannot change. Reading it
// still creates two small companion files beside it (`-wal` and `-shm`) which stay
// there afterwards, so when you have finished with a candidate delete all three
// rather than just the one. That
// is not a nicety: opened for writing, a database with a companion log beside it
// folds that log in and deletes it, which alters the very file you were deciding
// whether to trust. Measured 2026-09-03 — the file grew from 4,096 to 8,192
// bytes and its fingerprint changed.
//
// If you ever move this somewhere the folder cannot be written to, it stops working
// for exactly the files most worth checking: a database in the running-server format
// cannot be opened even for reading without creating a companion file next to it, so
// it fails with "unable to open database file" while a backup-format one still opens.
// Demonstrated 2026-09-03. Nowhere the guide sends you is read-only, so this is a note
// for whoever changes it, not a live fault.
//
// Proven during the disaster-recovery exercise of 2026-09-02: this is what
// showed that a freshly built server held 0 accounts, the archive held 2, and
// the live database held the same 2 after the swap.

import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync, readSync } from "node:fs";

const path = process.argv[2] || process.env.DB_PATH;
if (!path) {
    console.error("usage: node inspect-db.mjs [path]   (or set DB_PATH)");
    process.exit(1);
}

const label = (name) => (name + "                   ").slice(0, 19) + ":";

// Question one: is this a database at all? Ask before opening it, so the answer
// is a sentence rather than a stack trace. The commonest mistake is pointing
// this at an archive that was never unpacked.
let head;
try {
    const fd = openSync(path, "r");
    head = Buffer.alloc(20);
    const got = readSync(fd, head, 0, 20, 0);
    closeSync(fd);
    if (got < 20) {
        console.error(`not a database: ${path} is only ${got} bytes long`);
        process.exit(1);
    }
} catch (err) {
    console.error(`cannot read ${path}: ${err.code || err.message}`);
    process.exit(1);
}
if (head.subarray(0, 16).toString("latin1") !== "SQLite format 3\0") {
    console.error(`not a database: ${path} does not start with "SQLite format 3".`);
    console.error("  If the name ends .gz or .tgz, unpack it first.");
    process.exit(1);
}

// Bytes 18 and 19 record which of two ways the file keeps its recent changes.
// `1 1` is the older way, where a complete copy stands alone. `2 2` is the way
// a running server uses, where changes may sit in a companion log beside the
// file.
//
// Read this as WHERE THE FILE CAME FROM, not as whether it is damaged. A `2 2`
// file that was closed properly is perfectly complete. But the nightly backup
// always writes `1 1`, so:
//   1 1  -> this came from the backup job, and needs nothing beside it
//   2 2  -> this came out of a running server's folder; if the log that belongs
//           beside it was left behind, everything since the last fold is missing
// The health check below cannot tell you this either way: it answers "ok" for a
// file whose log went missing and which is therefore silently empty.
console.log(
    label("header bytes 18,19"),
    head[18],
    head[19],
    head[18] === 2
        ? "(from a running server's folder — check for its log)"
        : head[18] === 1
          ? "(from the backup job — stands alone)"
          : "(unrecognised — expected 1 or 2)",
);

const db = new DatabaseSync(path, { readOnly: true });

console.log(label("integrity"), JSON.stringify(db.prepare("PRAGMA integrity_check").all()));
console.log(label("journal mode"), db.prepare("PRAGMA journal_mode").get().journal_mode);
console.log(
    label("tables"),
    db
        .prepare("SELECT name FROM sqlite_master WHERE type = @t ORDER BY name")
        .all({ t: "table" })
        .map((r) => r.name)
        .join(", ") || "(none — this file has no tables at all)",
);

try {
    console.log(label("schema version"), db.prepare("SELECT MAX(version) AS v FROM schema_version").get().v);
} catch {
    console.log(label("schema version"), "ABSENT");
}

for (const table of ["accounts", "ranking", "battle", "unlocks", "activity_hourly"]) {
    try {
        console.log(label(table), db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    } catch {
        console.log(label(table), "ABSENT");
    }
}

try {
    console.table(
        db.prepare("SELECT user_id, username, renown, login_count, created_at FROM accounts ORDER BY user_id").all(),
    );
} catch {
    // No accounts table. The table list above already said so.
}

// Player numbers (#267). The last 7 days this FILE holds -- counted back from its
// newest hour, not from today -- so an old backup shows its own final week rather
// than nothing. Every time is UTC. A file from before these numbers were kept has
// no such table, and says ABSENT.
const LAST_7_DAYS = "WHERE hour >= (SELECT date(MAX(hour), '-6 days') FROM activity_hourly)";
const perDay = (columns) =>
    db
        .prepare(`SELECT substr(hour, 1, 10) AS day, ${columns} FROM activity_hourly ${LAST_7_DAYS} GROUP BY day ORDER BY day`)
        .all();

try {
    const players = perDay(
        `COUNT(*) AS hours, SUM(sign_ins) AS sign_ins, SUM(daily_players) AS players,
         SUM(new_players) AS new_players, SUM(returning_players) AS returning_players, MAX(peak_online) AS peak_online`,
    );
    if (players.length === 0) {
        console.log(label("player numbers"), "none recorded yet");
    } else {
        console.log("\nPlayers per day (UTC). hours: hours the server recorded. players: different people who signed in.");
        console.table(players);
        console.log("Match searches per day. A friend match counts once for each of its two players.");
        console.table(
            perDay(
                `SUM(find_match_joins) AS find_match, SUM(find_match_matched) AS matched,
                 SUM(challenge_joins) AS challenges, SUM(challenge_matched) AS challenges_matched,
                 SUM(search_timeouts) AS timeouts`,
            ),
        );
        console.log("Busiest hours of the day over those days (UTC), by average peak online.");
        console.table(
            db
                .prepare(
                    `SELECT substr(hour, 12, 5) AS utc_hour, COUNT(*) AS days, ROUND(AVG(peak_online), 1) AS average_peak,
                            MAX(peak_online) AS best_peak, SUM(sign_ins) AS sign_ins
                       FROM activity_hourly ${LAST_7_DAYS}
                      GROUP BY utc_hour
                      ORDER BY average_peak DESC, sign_ins DESC
                      LIMIT 5`,
                )
                .all(),
        );
    }
} catch (err) {
    console.log(label("player numbers"), /no such table/.test(err.message) ? "ABSENT" : `could not read: ${err.message}`);
}

db.close();
