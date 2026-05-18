// Idempotent migration runner. Walks src/db/migrations/*.sql in numeric
// order; for each file whose version is not yet recorded in
// schema_version, runs it in a transaction and records the version.
// Safe to invoke on every boot.

import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

function findMigrationsDir(): string {
    // ts-node-dev: __dirname is src/db; production: __dirname is build/db.
    // SQL files are copied to build/db/migrations/ by scripts/copy-migrations.js
    // during yarn build, so both runtimes resolve correctly.
    const local = path.join(__dirname, "migrations");
    if (existsSync(local)) return local;
    const fallback = path.join(__dirname, "..", "..", "src", "db", "migrations");
    if (existsSync(fallback)) return fallback;
    throw new Error(`Migrations directory not found near ${__dirname}`);
}

export function runMigrations(db: DatabaseSync): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
            version    INTEGER NOT NULL PRIMARY KEY,
            applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
    `);

    const dir = findMigrationsDir();
    const files = readdirSync(dir)
        .filter((f) => /^\d+_.+\.sql$/.test(f))
        .sort();

    const applied = new Set<number>(
        (db.prepare("SELECT version FROM schema_version").all() as { version: number }[]).map(
            (r) => r.version,
        ),
    );

    for (const file of files) {
        const m = file.match(/^(\d+)_/);
        if (!m) continue;
        const version = parseInt(m[1], 10);
        if (applied.has(version)) continue;

        const sql = readFileSync(path.join(dir, file), "utf-8");
        db.exec("BEGIN");
        try {
            db.exec(sql);
            db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
            db.exec("COMMIT");
            console.log(`[DB] applied migration ${file}`);
        } catch (err) {
            db.exec("ROLLBACK");
            throw new Error(`[DB] migration ${file} failed: ${(err as Error).message}`);
        }
    }
}
