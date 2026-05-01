# Server Deployment & SQLite Integration Review

## SQLite Integration Status: Complete

The MySQL → SQLite migration has been fully implemented. Key facts:

| Item | Status |
|---|---|
| Database driver | `node:sqlite` (Node.js 22.5+ built-in — no npm package, no native binaries) |
| Schema init | Auto-runs from `src/db/connection.ts` on every startup (`CREATE TABLE IF NOT EXISTS`) |
| Required env vars | `DB_PATH` (default: `./data/bsf.db`) + `JWT_SECRET` |
| Docker volume | `db-data` mounted at `/app/db/bsf.db` — persists across container restarts |
| Test impact | None — all 50 tests mock `src/db/connection.ts` entirely |

The old MySQL-era documents (`misc/Cloud-Deployment-Recommendations_ultraplan.md`, `misc/SQLiteMigrationPlan.md`) are kept for historical reference. `README.md` and `CONTRIBUTING.md` have been updated to reflect SQLite.

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

SSH into the VM (GCP Console → SSH button, or `gcloud compute ssh bsf-server`):

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
BSF_DOMAIN=your.domain.here
```

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
docker compose exec app wget -qO- http://localhost:8082/services/auth/login/11

# Caddy TLS working (from your local machine)?
curl https://your.domain.here/services/auth/login/11
```

The login endpoint returns a JSON object with a `session_key`. A 200 response confirms the full stack is working.

---

## Connecting Game Clients

Players launch the game client with the `--server` flag pointing at the domain:

```
"The Banner Saga Factions.exe" --server https://your.domain.here/ --steam true --factions
```

For a 2-player test with two real Steam accounts:
```
"The Banner Saga Factions.exe" --server https://your.domain.here/ --steam true --factions --versus_start
```

Each player runs this on their own machine. Both will enter the matchmaking queue and be matched automatically.

The PowerShell scripts (`launch-game-2p.ps1`, `launch-game-2p-quickbattle.ps1`) are for local testing only — they hardcode `localhost` and launch both clients on the same machine.

---

## Ongoing Operations

| Task | Command |
|---|---|
| View logs | `docker compose logs -f app` |
| Restart server | `docker compose restart app` |
| Pull latest code and redeploy | `git pull && docker compose up -d --build` |
| Inspect the database | `docker compose exec app sh` then `sqlite3 /app/db/bsf.db` |
| Backup the database | `docker compose exec app cat /app/db/bsf.db > backup.db` |
| Stop everything | `docker compose down` (data volume preserved) |

---

## Notes

- **WAL mode**: The server enables SQLite WAL mode on startup. On ext4 (GCP persistent disk), this works correctly. If `docker compose logs app` shows `WAL mode not active`, the volume filesystem doesn't support WAL — this is uncommon on standard GCP disks.
- **Single instance only**: In-memory sessions and battle state cannot be shared across multiple instances. Do not run more than one app container pointing at the same DB.
- **Let's Encrypt rate limits**: Caddy caches certificates in the `caddy-data` volume. If you destroy and recreate the volume, a new certificate is requested. Let's Encrypt allows 5 certificates per domain per week — don't cycle volumes repeatedly.