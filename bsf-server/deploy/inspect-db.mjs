// Read a database file and say what is in it, without changing anything that
// matters. Used when restoring a backup, to answer three questions in order:
// is this file really a database, does it stand on its own, and does it hold
// the players you expected?
//
// Run it inside the app container, which already has the database software:
//
//     docker compose exec -T app node /tmp/inspect-db.mjs            # the live database
//     docker compose exec -T app node /tmp/inspect-db.mjs /tmp/candidate.db
//
// With no argument it reads whatever DB_PATH points at, which is the live one.
//
// NOTE: opening a database can create two small companion files beside it
// (`-wal` and `-shm`). That is harmless, but when you have finished inspecting
// a candidate file, delete all three rather than just the one.
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

// Bytes 18 and 19 of the header say how the file records recent changes, and
// therefore whether it stands alone. `1 1` means self-contained. `2 2` means
// there should be a companion log file beside it and this copy is only half of
// the pair. The health check below CANNOT tell you this — it answers "ok" for a
// file that is missing its log and is therefore silently empty.
const fd = openSync(path, "r");
const header = Buffer.alloc(2);
readSync(fd, header, 0, 2, 18);
closeSync(fd);
console.log(
    label("header bytes 18,19"),
    header[0],
    header[1],
    header[0] === 2 ? "(needs its companion log — this copy is half a pair)" : "(self-contained)",
);

const db = new DatabaseSync(path);

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

for (const table of ["accounts", "ranking", "battle", "unlocks"]) {
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

db.close();
