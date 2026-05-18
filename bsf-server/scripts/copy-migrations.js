// Copies src/db/migrations/*.sql into build/db/migrations/ so the
// migration runner can read them in production (tsc only emits .ts → .js
// and never touches non-TS files).

const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "db", "migrations");
const dst = path.join(__dirname, "..", "build", "db", "migrations");

fs.mkdirSync(dst, { recursive: true });
let copied = 0;
for (const f of fs.readdirSync(src)) {
    if (f.endsWith(".sql")) {
        fs.copyFileSync(path.join(src, f), path.join(dst, f));
        copied++;
    }
}
console.log(`[build] copied ${copied} SQL migration(s) from ${src} → ${dst}`);
