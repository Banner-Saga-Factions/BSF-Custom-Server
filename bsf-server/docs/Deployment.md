# Deployment Guide

> For local development setup (running the server on your own machine), see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## SQLite Integration Status

| Item | Status |
|---|---|
| Database driver | `node:sqlite` (Node.js 22.5+ built-in — no npm package, no native binaries) |
| Schema init | Auto-runs from `src/db/connection.ts` on every startup (`CREATE TABLE IF NOT EXISTS`) |
| Required env vars | `DB_PATH` (default: `./data/bsf.db`) + `JWT_SECRET` |
| Docker volume | `db-data` mounted at `/data/bsf.db` — persists across container restarts |
| Test impact | None — all 50 tests mock `src/db/connection.ts` entirely |

---

## Deploying to GCP e2-micro (Free Tier)

### VM Specification

| Field | Value |
|---|---|
| Machine type | `e2-micro` (2 shared vCPUs, 1 GB RAM) |
| Region | `us-central1`, `us-west1`, or `us-east1` — free tier applies only in these three |
| Boot disk | Ubuntu 22.04 LTS, 30 GB standard persistent disk |
| Cost | **$0/month** (1 e2-micro free per billing account) |

### Architecture

```
Internet clients
     │ HTTPS :443 / HTTP :80
     ▼
┌──────────────────────────────────────────────┐
│  GCP e2-micro VM                             │
│  ┌────────────────────────────────────────┐  │
│  │  docker compose                        │  │
│  │  ┌─────────────┐  ┌─────────────────┐ │  │
│  │  │ caddy:2     │  │ app (node:24)   │ │  │
│  │  │ :80 / :443  │──▶ :8082 (internal)│ │  │
│  │  │ Let's Encrypt│  │ db-data volume  │ │  │
│  │  └─────────────┘  └─────────────────┘ │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
         ▲
         │  --server https://your.domain.here/
   Game clients (Windows / Steam)
```

Port 8082 is **not** exposed externally. Only ports 80 and 443 are open; Caddy proxies all traffic to the app container.

---

### Step 1: Create the VM

In GCP Console → Compute Engine → VM instances → Create:
- Name: `bsf-server` (or any name)
- Region/Zone: `us-central1-a` (or `us-west1-b`, `us-east1-b`)
- Machine type: `e2-micro`
- Boot disk: Ubuntu 22.04 LTS, 30 GB Standard persistent disk
- Firewall: check both "Allow HTTP traffic" and "Allow HTTPS traffic"

Or with gcloud CLI:
```bash
gcloud compute instances create bsf-server \
  --machine-type=e2-micro \
  --zone=us-central1-a \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --tags=http-server,https-server
```

### Step 2: Add Firewall Rules

GCP's default HTTP/HTTPS firewall rules open ports 80 and 443. Verify in VPC Network → Firewall → look for `default-allow-http` and `default-allow-https`. If missing, add them:

```bash
gcloud compute firewall-rules create default-allow-http \
  --allow tcp:80 --target-tags=http-server

gcloud compute firewall-rules create default-allow-https \
  --allow tcp:443 --target-tags=https-server
```

Port 8082 does **not** need a firewall rule — it is internal only.

### Step 3: Point Your Domain at the VM

Get the VM's external IP from GCP Console (Compute Engine → VM Instances). Create an **A record** in your DNS provider:

```
A   your.domain.here   →   VM_EXTERNAL_IP
```

DNS propagation can take a few minutes. Caddy will not get a Let's Encrypt certificate until the DNS record resolves correctly.

### Step 4: Prepare the VM

SSH into the VM from Cloud Shell or your local terminal:

```bash
gcloud compute ssh bsf-community-server-vm --zone=us-central1-f
```

Then on the VM:

```bash
# Add 1 GB swap — prevents OOM during the Docker build on 1 GB RAM
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Install Docker Engine + Compose plugin
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### Step 5: Deploy

```bash
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server
cp .env.example .env
nano .env   # or: vim .env
```

In `.env`, set:
```
JWT_SECRET=<output of: openssl rand -hex 32>
BSF_DOMAIN=your.domain.here   # must be a hostname, not a bare IP address — Let's Encrypt cannot issue a cert for an IP
```

> **No domain yet?** Use a free [DuckDNS](https://www.duckdns.org/) subdomain (e.g. `bsf-server.duckdns.org`). Sign in, create a subdomain, enter the VM's external IP, and set `BSF_DOMAIN=bsf-server.duckdns.org`. Caddy fetches the cert automatically. When you buy a real domain later, just update `BSF_DOMAIN` and run `docker compose up -d --force-recreate caddy`.

`DB_PATH` is already overridden to `/data/bsf.db` by the `environment:` block in `docker-compose.yml` — no change needed.

Then:
```bash
docker compose up -d
```

The first run builds the image (~2–4 minutes on e2-micro). Subsequent starts are instant (`docker compose start`).

### Step 6: Verify

```bash
# All services running?
docker compose ps

# App responding (internal check)?
docker compose exec app curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"steam_id":"123456"}' http://localhost:8082/services/auth/login/11

# Caddy TLS working (from your local machine)?
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"steam_id":"123456"}' https://your.domain.here/services/auth/login/11
```

Both should return a JSON object with a `session_key`. A 200 response confirms the full stack is working.

> **Note**: The login endpoint is POST-only with a JSON body. `wget` (GET) returns 404 — do not use it to verify the login endpoint.

---

## Connecting Game Clients

Players launch the game client with the `--server` flag pointing at the domain:

```
"The Banner Saga Factions.exe" --server https://your.domain.here/ --steam true --factions
```
### Connecting to Production google cloud GCP e2-micro VM:
```
--server https://bsf-server.duckdns.org/ --steam true --factions --developer
```

For a 2-player test with two real Steam accounts:
```
"The Banner Saga Factions.exe" --server https://your.domain.here/ --steam true --factions --versus_start
```

Each player runs this on their own machine. Both will enter the matchmaking queue and be matched automatically.

The PowerShell scripts (`launch-game-2p.ps1`, `launch-game-2p-quickbattle.ps1`) are for local testing only — they hardcode `localhost` and launch both clients on the same machine. The `--versus_start --versus_countdown 0` flags baked into them are mandatory for 2-on-one-PC because FMOD's audio extension only initializes for the first client; see [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

---

## Deploying Code Changes

Every time you push a fix or new feature, follow this two-part workflow: push to GitHub from your local machine, then pull and rebuild on the VM.

### Part 1 — Local: push your changes to GitHub

```bash
# Stage and commit your changes
git add <changed-files>
git commit -m 'description of what changed and why'

# Push to the main branch (or your PR branch)
git push origin main
```

### Part 2 — VM: pull and rebuild

SSH into the VM first (run this from your local machine):

```bash
gcloud compute ssh bsf-community-server-vm --zone=us-central1-f
```

Then on the VM:

```bash
# Go to the repo directory (wherever you cloned it in Step 5)
cd ~/BSF-Custom-Server/bsf-server

# Pull the latest code
git pull

# Rebuild the Docker image and restart in the background
docker compose up -d --build
```

The `--build` flag is required — without it, Docker reuses the old image and your code changes are silently ignored. The rebuild takes 2–4 minutes on e2-micro. Your database and player data in the `db-data` volume are preserved across rebuilds.

### Verify the new version is running

```bash
# Confirm both containers are up
docker compose ps

# Watch the startup logs (Ctrl+C to stop following)
docker compose logs -f app
```

Look for a line like `Server listening on :8082` in the app logs. If you see startup errors, `docker compose logs app --tail=50` gives the last 50 lines without following.

> **`docker compose restart` does NOT pick up code changes.** It only restarts the existing container from the same image. Always use `docker compose up -d --build` after a `git pull`.

---

## Ongoing Operations

| Task | Command |
|---|---|
| View logs | `docker compose logs -f app` |
| Restart server (same image) | `docker compose restart app` |
| Reload `.env` changes | `docker compose up -d --force-recreate <service>` |
| Pull latest code and redeploy | `git pull && docker compose up -d --build` |
| Inspect the database | `docker compose exec app sh` then `sqlite3 /data/bsf.db` |
| Backup the database | `docker compose exec app cat /data/bsf.db > backup.db` |
| Stop everything | `docker compose down` (data volume preserved) |

---

## Notes

- **WAL mode**: The server enables SQLite WAL mode on startup. On ext4 (GCP persistent disk), this works correctly. If `docker compose logs app` shows `WAL mode not active`, the volume filesystem doesn't support WAL — this is uncommon on standard GCP disks.
- **Single instance only**: In-memory sessions and battle state cannot be shared across multiple instances. Do not run more than one app container pointing at the same DB.
- **Let's Encrypt rate limits**: Caddy caches certificates in the `caddy-data` volume. If you destroy and recreate the volume, a new certificate is requested. Let's Encrypt allows 5 certificates per domain per week — don't cycle volumes repeatedly.

---

## Common Deployment Pitfalls

Lessons learned from running a first live deployment session.

### 1. Run `docker compose` on the VM, not Cloud Shell

GCP Cloud Shell is a separate machine from your Compute Engine VM. Running `docker compose up` in Cloud Shell starts containers on Cloud Shell's own Docker daemon — not on your VM. The VM's existing stack continues running untouched.

**Rule**: Always `gcloud compute ssh <vm-name> --zone=<zone>` first, then run `docker compose` commands inside that SSH session.

### 2. `docker compose restart` does not reload `.env`

`docker compose restart` reuses the baked-in environment from when the container was created. Changes to `.env` are silently ignored.

```bash
# Wrong — old env vars still in effect
docker compose restart caddy

# Correct — container is recreated and picks up the new .env
docker compose up -d --force-recreate caddy
```

### 3. `BSF_DOMAIN` must be a hostname, not a bare IP address

If `BSF_DOMAIN` is set to an IP address (e.g. `136.115.19.14`), Caddy cannot request a Let's Encrypt certificate — ACME does not issue certs for bare IPs. Caddy will silently fall back to a local self-signed cert, and all game clients will get a TLS error.

Always set `BSF_DOMAIN` to a real hostname (e.g. `bsf-server.duckdns.org` or `play.yourdomain.com`). Verify the cert was issued by checking:
```bash
docker compose logs caddy | grep "certificate obtained"
```

### 4. Game client `--server` flag requires `https://` and `--steam true`

The game client is strict about the `--server` value:

| Mistake | Symptom |
|---|---|
| `--server bsf-server.duckdns.org/` (no protocol) | IOError #2032, connection refused |
| `--server http://bsf-server.duckdns.org/` (wrong protocol) | Caddy returns HTTP 308 redirect; client may not follow it |
| `--steam false` | Client shows "NO STEAM ID" and exits immediately |

Correct launch command:
```
"The Banner Saga Factions.exe" --server https://your.domain.here/ --steam true --factions
```

### 5. Source code directory missing — containers still running

If the `BSF-Custom-Server` folder is gone but `docker ps -a` shows the containers are up, they are running from their cached images. The source code can be deleted without stopping containers.

**Fix**: Re-clone, recover env vars from the running container, and rebuild:

```bash
# Recover env vars from the running container
docker inspect bsf-custom-server-app-1 --format '{{.Config.Env}}'

# Re-clone and redeploy
cd ~
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server
git checkout <your-branch>   # if not building from main
cp .env.example .env
nano .env                    # paste JWT_SECRET and BSF_DOMAIN from inspect output
docker compose up -d --build
```

The `bsf-server_db-data` Docker volume is not affected by the missing source — all account and battle data is preserved.

### 6. `permission denied` connecting to Docker socket

Fresh SSH sessions may not have Docker access even after `sudo usermod -aG docker $USER`.

```
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock
```

**Fix**: The group change requires a new login session to take effect. `newgrp` is not available on minimized Ubuntu images — just exit and re-SSH:

```bash
sudo usermod -aG docker $USER
exit
# Re-SSH from your local machine, then retry docker commands
```

### 7. Build freezes on e2-micro — PuTTY shows "(inactive)"

The `yarn install --production` step during `docker compose up --build` can exhaust the 1 GB RAM on e2-micro, freezing the build. PuTTY's title bar changes to "(inactive)" when the SSH session dies.

**Fix**: Add 1 GB swap before building:

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h   # confirm ~1G shown under Swap
```

Then retry `docker compose up -d --build`.

### 8. `fallocate: fallocate failed: Text file busy` — swapfile already exists

If a previous build attempt already created `/swapfile`, `fallocate` will refuse to overwrite it.

**Fix**: Skip the creation steps and just activate the existing swapfile:

```bash
sudo swapon /swapfile
swapon --show   # confirm it is listed and active
```

### 9. `db-data` volume overlays compiled code — RESOLVED in Batch 2

**Historical issue:** until the Batch 2 fix, the `db-data` volume was mounted at `/app/db` — the same directory where the TypeScript compiler writes database module files (`account.js`, `ranking.js`, etc.). Docker only auto-populates a named volume from the image on **first creation**, so if a new `src/db/*.ts` module was added after the volume first existed, the new compiled file existed in the image but was shadowed by the volume at runtime. Symptom: `Error: Cannot find module '../../db/ranking'` (or any other `db/*` module) after `docker compose up -d --build`, with the app container immediately crashing.

**Resolution:** the volume now mounts at `/data` and `DB_PATH` is `/data/bsf.db`. The `/data` directory is reserved for the database; no compiled code is written there, so the overlay can no longer happen. New `src/db/*.ts` modules are now picked up cleanly on rebuild without any volume gymnastics. See the CHANGELOG entry "Prevent new database modules from crashing the server on upgrade" for the full story.

### 10. Moving `docker-compose.yml` silently renames the data volume — stranding all player data

Docker Compose's project name defaults to the folder the compose file sits in, and the project name becomes part of every volume name (`<project>_<volume>`). If `docker-compose.yml` is moved to a different directory (e.g. a repo reorganization), the volume name changes too. The next `docker compose up` can't find the volume under its new name, **silently creates a fresh empty one**, and starts the server against it — every player sees their account reset. The original volume still exists on disk, just abandoned (no longer attached to any running container).

This actually happened on 2026-06-06: the reorg into `bsf-server/` shifted the project name from `bsf-custom-server` to `bsf-server`, abandoning `bsf-custom-server_db-data`.

**Permanent prevention (already applied):** the `db-data` volume in `docker-compose.yml` has `name: bsf-server_db-data` pinned. The volume name no longer depends on the parent directory, so a future folder move can't strand the data.

**Detect the split** (read-only, safe while the server is live):

```bash
cd ~/BSF-Custom-Server/bsf-server
docker volume ls | grep db-data   # two rows = data is stranded somewhere
docker inspect "$(docker compose ps -q app)" -f '{{range .Mounts}}{{.Name}}{{"\n"}}{{end}}'
# Any db-data volume NOT printed by the second command is the abandoned one.
```

To see how many accounts and how much renown each volume holds:

```bash
for V in $(docker volume ls -q | grep db-data); do
  echo "===== $V ====="
  docker run --rm -v "$V":/v:ro alpine sh -c '
    apk add --no-cache sqlite >/dev/null
    cp -a /v/bsf.db /tmp/c.db
    [ -f /v/bsf.db-wal ] && cp -a /v/bsf.db-wal /tmp/c.db-wal
    sqlite3 /tmp/c.db "SELECT COUNT(*) accounts, COALESCE(SUM(renown),0) renown FROM accounts;" 2>&1
  '
done
```

This mounts each volume read-only (`:ro` makes it impossible to accidentally write back), then runs `sqlite3` against a copy of the database inside a throwaway `alpine` container. The script also copies the `bsf.db-wal` file — SQLite stores recent writes there before folding them into the main `bsf.db`, so without that copy you'd undercount by everything written since the last fold. The volume with the higher account/renown numbers is the one to recover from.

**Recovery runbook** (used 2026-06-06; preserves data on both sides — the abandoned volume wins on any `user_id` present in both, accounts that exist only in the live DB are kept):

```bash
cd ~/BSF-Custom-Server/bsf-server

# Set these to the two volume names from the detection step above.
# ORPHAN is the abandoned volume — the one with the higher account/renown
# numbers (the real lost data). LIVE is the one the running app is using.
ORPHAN=bsf-custom-server_db-data
LIVE=bsf-server_db-data

# Phase 1 — back up both volumes (tarballs kept outside any Docker volume)
mkdir -p ~/bsf-backups; TS=$(date +%Y%m%d-%H%M%S)
for V in "$ORPHAN" "$LIVE"; do
  docker run --rm -v "$V":/v:ro -v ~/bsf-backups:/out alpine \
    tar czf "/out/${V}_${TS}.tgz" -C /v .
done

# Phase 2 — stop the app so nothing can write to the database (brief downtime starts here)
docker compose stop app

# Phase 3 — write the merge SQL to a file. Writing it to a file avoids
# tricky punctuation problems when the same SQL is pasted into a shell.
mkdir -p ~/bsf-recovery
cat > ~/bsf-recovery/merge.sql <<'SQL'
ATTACH '/work/old.db' AS old;
INSERT OR REPLACE INTO accounts
  (user_id, username, renown, daily_login_streak, login_count,
   completed_tutorial, roster_rows, roster_json, party_ids_json,
   created_at, updated_at)
  SELECT user_id, username, renown, daily_login_streak, login_count,
         completed_tutorial, roster_rows, roster_json, party_ids_json,
         created_at, updated_at FROM old.accounts;
INSERT OR IGNORE INTO battles
  (battle_id, type, winner_user_id, loser_user_id,
   renown_awarded, started_at, finished_at)
  SELECT battle_id, type, winner_user_id, loser_user_id,
         renown_awarded, started_at, finished_at FROM old.battles;
DETACH old;
SQL
# If the abandoned DB also has `ranking` and/or the post-M1 rich `battle`
# table, add the corresponding INSERT blocks before the DETACH. Use
# INSERT OR REPLACE for `ranking` (primary key account_id+tourney_id)
# and INSERT OR IGNORE for `battle` (primary key battle_id). Column
# lists live in `src/db/migrations/001_ranking_and_battle.sql`.

# Phase 4 — build a merged DB on a scratch copy and verify (nothing irreversible yet)
docker run --rm \
  -v "$ORPHAN":/old:ro -v "$LIVE":/live:ro -v ~/bsf-recovery:/work alpine sh -c "
  set -e; apk add --no-cache sqlite >/dev/null
  cp -a /old/bsf.db /work/old.db
  [ -f /old/bsf.db-wal ] && cp -a /old/bsf.db-wal /work/old.db-wal || true
  [ -f /old/bsf.db-shm ] && cp -a /old/bsf.db-shm /work/old.db-shm || true
  sqlite3 /work/old.db 'PRAGMA wal_checkpoint(TRUNCATE);'
  rm -f /work/old.db-wal /work/old.db-shm
  cp -a /live/bsf.db /work/merged.db
  [ -f /live/bsf.db-wal ] && cp -a /live/bsf.db-wal /work/merged.db-wal || true
  [ -f /live/bsf.db-shm ] && cp -a /live/bsf.db-shm /work/merged.db-shm || true
  sqlite3 /work/merged.db 'PRAGMA wal_checkpoint(TRUNCATE);'
  rm -f /work/merged.db-wal /work/merged.db-shm
  echo '== live BEFORE merge =='
  sqlite3 /work/merged.db 'SELECT COUNT(*), COALESCE(SUM(renown),0) FROM accounts;'
  sqlite3 /work/merged.db < /work/merge.sql
  echo '== merged AFTER =='
  sqlite3 /work/merged.db 'SELECT COUNT(*), COALESCE(SUM(renown),0) FROM accounts;'
  sqlite3 -header -column /work/merged.db 'SELECT user_id, username, renown FROM accounts ORDER BY renown DESC;'
"
# STOP HERE and read the numbers. Continue only if they look correct.

# Phase 5 — swap the merged DB into the live volume.
# CRITICAL: change the file's owner to the app user (default uid:gid
# 1002:1003 on this image) AND delete the stale WAL/SHM files. If you
# leave the WAL behind, SQLite will replay it on top of the merged file
# and silently undo the restore.
docker run --rm -v "$LIVE":/live -v ~/bsf-recovery:/work:ro alpine sh -c "
  cp -a /work/merged.db /live/bsf.db
  chown 1002:1003 /live/bsf.db
  chmod 664 /live/bsf.db
  rm -f /live/bsf.db-wal /live/bsf.db-shm
"

# Phase 6 — restart and verify
docker compose start app
sleep 3
docker compose logs --tail=30 app
# Expect: "Express server listening on port 8082" and no "Cannot find module" errors.
```

**Do NOT** `docker volume rm` the abandoned volume until at least several days after recovery has been confirmed by real player logins — it is the only copy of the pre-incident data.

---

*Last Updated: 2026-06-07*
