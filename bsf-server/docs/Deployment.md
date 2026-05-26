# Deployment Guide

> For local development setup (running the server on your own machine), see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## SQLite Integration Status

| Item | Status |
|---|---|
| Database driver | `node:sqlite` (Node.js 22.5+ built-in — no npm package, no native binaries) |
| Schema init | Auto-runs from `src/db/connection.ts` on every startup (`CREATE TABLE IF NOT EXISTS`) |
| Required env vars | `DB_PATH` (default: `./data/bsf.db`) + `JWT_SECRET` |
| Docker volume | `db-data` mounted at `/app/db/bsf.db` — persists across container restarts |
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

`DB_PATH` is already overridden to `/app/db/bsf.db` by the `environment:` block in `docker-compose.yml` — no change needed.

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

The PowerShell scripts (`launch-game-2p.ps1`, `launch-game-2p-quickbattle.ps1`) are for local testing only — they hardcode `localhost` and launch both clients on the same machine.

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
| Inspect the database | `docker compose exec app sh` then `sqlite3 /app/db/bsf.db` |
| Backup the database | `docker compose exec app cat /app/db/bsf.db > backup.db` |
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

The `bsf-custom-server_db-data` Docker volume is not affected by the missing source — all account and battle data is preserved.

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

---

*Last Updated: 2026-05-09*
