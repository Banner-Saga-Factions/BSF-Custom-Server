# Plan — Move SQLite DB out of `/app/db` (issue #105, Batch 2)

## Context

The Docker volume holding the SQLite database is currently mounted at `/app/db` — the same directory the TypeScript compiler writes database module files into (`account.js`, `connection.js`, `ranking.js`, `migrations/`). Docker only auto-populates a named volume from the image on **first creation**, so any database module added after the volume first existed is shadowed by the volume at runtime, even after `docker compose up -d --build`. Symptom: `Error: Cannot find module '../../db/ranking'` and the app container crashes on start. The documented workaround (Pitfall §9 in `bsf-server/docs/Deployment.md`) is back-up-and-recreate the volume on every new `src/db/*.ts` module — fragile and easy to forget.

The previously-proposed fix (Deployment.md line 406, marked "Root fix (pending — issue #105)") was to mount the volume at `/app/data`. That path collides with the **static game data** directory already created by the Dockerfile at line 14 (`COPY --from=build_env /src/data ./data` → `/app/data/{acc.json, first.json, lboard.json, accounts.json, build-number}`). Mounting an empty volume there would shadow those files and break the server's first-poll data and account defaults. `/data` (root-level, outside `/app/`, matching Postgres/MySQL/Redis convention) was chosen instead.

This is Batch 2 of a two-part remediation. Batch 1 — commit `745b9b0` on branch `fix/pin-db-volume-name` — pinned the volume's name so a folder rename can't strand the data again. Batch 2 eliminates the related class of failure where adding a new database module crashes the server after a rebuild.

## Recommended approach

### File changes

**1. `bsf-server/docker-compose.yml`** — two lines inside the `app` service block:
- `DB_PATH: /app/db/bsf.db` → `DB_PATH: /data/bsf.db`
- `- db-data:/app/db`     → `- db-data:/data`

The `volumes:` block at the bottom (`db-data: name: bsf-server_db-data`, from Batch 1) is unchanged. Same volume, new mount point.

**2. `bsf-server/docs/Deployment.md`** — update path references and replace the now-resolved-issue-#105 paragraph:
- Line 14 (SQLite Integration Status table row): `db-data mounted at /app/db/bsf.db` → `/data/bsf.db`
- Line 141 (Step 5 prose): `DB_PATH is already overridden to /app/db/bsf.db` → `/data/bsf.db`
- Line 256 (Ongoing Operations table — Inspect): `sqlite3 /app/db/bsf.db` → `sqlite3 /data/bsf.db`
- Line 257 (Ongoing Operations table — Backup): `cat /app/db/bsf.db > backup.db` → `cat /data/bsf.db > backup.db`
- Pitfall §9: rewrite the intro to mark the issue resolved (overlay can no longer happen with the DB at `/data`, which holds nothing else); drop the obsolete recovery commands since they reference a layout that no longer exists.
- Line 406 (Root fix pending): folded into the §9 resolution marker.
- Line 410 (Last Updated): already set to 2026-06-07 by Batch 1; no change.
- **Pitfall §10** (added in Batch 1) requires **no changes** — its detection and recovery commands use container-internal paths (`/old`, `/live`, `/work`) and only the volume's own contents (`bsf.db` + sidecars), not `/app/db/`.

**3. `bsf-server/CHANGELOG.md`** — new entry under `## [Unreleased]`, inserted above the Batch 1 entry "Prevent a deploy folder rename...". Plain-language body: explain that adding a new database file to the source could crash the server after a rebuild, why it mattered (any new database feature could trigger it; the manual recovery was a backup-restore dance), and what the fix does (database now lives in its own directory separate from compiled code). End with one `*Technical:*` line naming the path move and referencing issue #105.

**4. `bsf-server/misc/Plan-Move-SQLite-DB-to-data-Mount.md`** — this file. Committed planning artifact alongside the existing `Plan-*.md` docs in `bsf-server/misc/`.

### Files NOT changed (deliberate)
- `.env.example`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `README.md`, `docs/Development.md` — all reference `DB_PATH=./data/bsf.db` as the **local-dev** default (relative to project root). The Docker override is what changes; local dev is unaffected.
- `src/db/connection.ts` — reads `DB_PATH` from env, no hardcoded path. Unaffected.
- `vitest.config.ts` — uses `DB_PATH=:memory:`. Unaffected.
- `misc/archive/SQLiteMigrationPlan.md`, `misc/archive/Plan-ServerDeployment-and-SQLiteIntegrationReview.md`, `misc/archive/Plan-ServerSetupAndDeployment.md` — historical planning artifacts, not authoritative for current behavior. Updating them would rewrite a historical record.
- Existing CHANGELOG.md entries that mention `/app/db` — historical; unchanged.

### Migration story for the live GCP server (zero-migration)

Docker named volumes don't move bytes when the mount point changes — the same volume contents appear at whatever path Compose mounts them on. The live `bsf-server_db-data` currently holds `bsf.db`, `bsf.db-wal`, `bsf.db-shm`, plus stale `account.js`/`migrations/`/etc. (leftovers from when the volume overlaid `/app/db/`). After Batch 2, mounting the same volume at `/data` makes the same `bsf.db` appear at `/data/bsf.db`; the stale `.js` files appear at `/data/account.js` etc. but nothing reads from `/data/*.js`, so they're inert. The Node process opens `/data/bsf.db` directly via the new `DB_PATH`. Players resume with the same accounts, units, and renown.

After the redeploy is verified, the stale files in the volume can be cleaned up at leisure (`docker compose exec app sh -c "rm -f /data/*.js /data/connection.js /data/migrations.js && rm -rf /data/migrations"`), but it's not required for correctness — they're just clutter.

The redeploy is the standard sequence:
```bash
cd ~/BSF-Custom-Server/bsf-server
git pull
docker compose up -d --build
```
Brief downtime during rebuild + restart (~2–4 min on e2-micro).

## Verification

Before committing:
1. **Pre-commit hook** (`yarn build && yarn test`) must pass — no TypeScript changes, so build is clean; 258 tests must stay green (tests mock `src/db/connection.ts` entirely, per CLAUDE.md, so the path doesn't reach them).
2. **`git diff --stat`** should show exactly four files touched: `bsf-server/docker-compose.yml`, `bsf-server/docs/Deployment.md`, `bsf-server/CHANGELOG.md`, and the new `bsf-server/misc/Plan-Move-SQLite-DB-to-data-Mount.md`. Anything else is a mistake.

After redeploy on the live VM:
1. **Containers healthy:** `docker compose ps` shows `app` and `caddy` running.
2. **Server listening, no errors:** `docker compose logs --tail=30 app` shows `Express server listening on port 8082` and no `Cannot find module` or path errors.
3. **DB is at the new path with correct ownership:** `docker compose exec app sh -c "ls -la /data/bsf.db"` shows the file owned by uid 1002 (the app user).
4. **Real player data is intact:** using the same Node-driven probe pattern as the 500-renown grant, count accounts and total renown — expect the post-grant numbers (9 accounts, ~4500 renown):
   ```bash
   docker compose exec -T app node -e "
   const {DatabaseSync} = require('node:sqlite');
   const db = new DatabaseSync('/data/bsf.db');
   console.log(db.prepare('SELECT COUNT(*) accounts, SUM(renown) renown FROM accounts').get());
   db.close();
   "
   ```
5. **A real player logs in** (Knifr or WaVeS) and confirms their units and renown are present.

If anything fails, rollback is simple: revert `docker-compose.yml` to `db-data:/app/db` + `DB_PATH: /app/db/bsf.db` and redeploy. The volume bytes are unchanged, so the rollback restores the previous live state with no data action.

## Branch / commit hygiene

- Branch: continue on the existing `fix/pin-db-volume-name` branch — Batch 1 and Batch 2 are tightly coupled (both fix the `/app/db` mount design) and shipping them in one PR keeps the recovery context in one commit history.
- Commit message follows the plain-English subject style established by Batch 1.
