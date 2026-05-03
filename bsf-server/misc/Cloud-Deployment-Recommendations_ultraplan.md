# Cloud Deployment Recommendations — BSF Custom Server

## Context

This is a research/recommendation task, not a code change. The user asked to review the codebase, docs, and `Plan-Enable-Mobile-Windows-Crossplay.md`, then recommend free and low-cost cloud hosting options.

---

## Deployment Profile (What the Server Needs)

Gathered from `Dockerfile`, `docker-compose.yml`, `src/index.ts`, `.env.example`, and docs:

| Requirement | Detail |
|---|---|
| Runtime | Node.js 18+, port 8082 |
| Database | MySQL 8+ (persistent volume) |
| Protocol | HTTP long-poll (connections held open up to 10s) |
| State | **Stateful in-memory** — sessions, battles, queue (no multi-instance scaling) |
| Docker | `Dockerfile` + `docker-compose.yml` already present and production-ready |
| HTTPS | Currently HTTP only; **required for mobile crossplay** (iOS App Transport Security enforces HTTPS) |
| Memory | ~256–512 MB RAM sufficient for a small community |
| Storage | ~5–10 GB for MySQL data + OS |

### Critical constraints for hosting selection

- **No serverless / no spin-down**: Long-polling requires persistent connections. Render free tier (spins down after 15 min inactivity) will break the game.
- **No split-instance without Redis**: In-memory sessions/battles mean the server must be a single always-on process. Multi-instance load balancers will route the same player to different nodes and lose state.
- **HTTPS needed for mobile crossplay**: iOS/Android HTTP is blocked by default. Any hosting for crossplay must allow TLS (Let's Encrypt via Caddy or nginx reverse proxy, or platform-provided TLS).

---

## Deployment Architecture

```
Internet (clients)
        │ HTTPS :443 (nginx/Caddy → reverse proxy)
        ▼
┌──────────────────────────────────┐
│  Single VM / Container           │
│  ┌──────────┐  ┌──────────────┐ │
│  │ Node.js  │  │  MySQL 8.0   │ │
│  │ port 8082│  │  port 3306   │ │
│  └──────────┘  └──────────────┘ │
│  docker-compose.yml              │
└──────────────────────────────────┘
```

For mobile crossplay, add a TLS-terminating reverse proxy (Caddy is simplest — auto-manages Let's Encrypt certs):

```
HTTPS :443 → Caddy → http://app:8082
```

---

## Recommendations

### Tier 1: Free Forever

#### Oracle Cloud Infrastructure (OCI) Always Free — **Top Pick**

- **Ampere A1 Compute**: 4 vCPU + 24 GB RAM shared across up to 4 VMs (Always Free)
  - Recommended config: 1 VM with all 4 vCPU + 24 GB RAM, or split into 2 VMs (app + DB)
- **Storage**: 200 GB block volume (Always Free)
- **Network**: 10 TB outbound/month (Always Free)
- **MySQL**: No managed MySQL on free tier — run MySQL in Docker on the same VM ✅ (docker-compose handles this)
- **TLS**: Install Caddy or nginx + certbot on the VM for Let's Encrypt

Why it wins: Most generous free tier in the industry. 24 GB RAM is vastly more than this server needs. Docker Compose works out of the box. Truly permanent free tier, not a 12-month trial.

**Deployment steps**: Create OCI account → provision 1x Ampere A1 VM (Ubuntu 22.04) → open port 80/443/8082 in Security List → install Docker + Docker Compose → clone repo → `cp .env.example .env` → fill secrets → `docker compose up -d`.

---

#### AWS Free Tier (12 months only)

- **EC2 t3.micro**: 2 vCPU, 1 GB RAM — sufficient
- **RDS MySQL**: 750 hours/month db.t3.micro, 20 GB storage — free for 12 months
- **After 12 months**: ~$12–15/month (t3.micro + RDS)
- TLS: Elastic Load Balancer ($16/month) or nginx + Let's Encrypt on EC2

Note: Time-limited. Good for prototyping, not permanent community hosting.

---

#### Azure Free Tier (12 months only)

- **B1S VM**: 1 vCPU, 1 GB RAM
- **Azure DB for MySQL Flexible**: 750 hrs/month
- Same 12-month caveat as AWS

---

### Tier 2: Low Cost (~$4–6/month)

#### Hetzner Cloud CX22 — **Best value paid option**

- €3.79/month (~$4.10): 2 vCPU (AMD), 4 GB RAM, 40 GB SSD, 20 TB traffic
- Finland, Germany, or US datacenter
- Run MySQL in Docker on same VM — well within resource budget
- Caddy reverse proxy for HTTPS (install via apt)
- No free tier, but cheapest reliable VPS in this class

#### DigitalOcean Basic Droplet

- $6/month: 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB transfer
- Managed MySQL starts at $15/month — run MySQL in Docker instead
- Good documentation, easy UX

#### Fly.io

- Free tier: 3 shared-CPU VMs, 256 MB RAM each — tight for MySQL
- Docker-native (reads `Dockerfile` directly)
- No free MySQL — pair with **Aiven** free tier (MySQL, 1 node, 5 GB) or **PlanetScale** free tier (MySQL-compatible Vitess)
- HTTPS provided automatically
- Could be $0/month if within free limits, ~$5–10/month with paid DB

---

### Tier 3: Developer-Friendly (Simple DX, ~$5/month)

#### Railway

- **Hobby plan**: $5/month credit included — likely covers the whole stack
- MySQL service included (no separate provider needed)
- Docker support (`Dockerfile` auto-detected)
- HTTPS provided automatically
- Easiest deployment path: `railway up` or connect GitHub repo

#### Render

- ⚠️ **Free tier not suitable** — web services spin down after 15 minutes of inactivity
- Paid plan ($7/month) keeps it always-on
- Managed PostgreSQL $7/month (would require mysql2 → pg migration) or use external MySQL

---

## Mobile Crossplay Consideration

The Flash/AIR game client (`The Banner Saga Factions.exe`) is Windows-only. However, Banner Saga Factions **did have iOS and Android releases** (Adobe AIR supports mobile). For mobile clients to connect:

1. **HTTPS is required** — iOS ATS and Android network security policies block plain HTTP by default
2. **The server currently listens on HTTP port 8082** with no TLS
3. Mobile clients will likely use `--server https://yourdomain.com/` rather than HTTP

**What needs to change for crossplay** (infrastructure only, no server code changes):
- Add a Caddy or nginx reverse proxy for TLS termination
- Open port 443 on the host firewall
- Domain name required (free: `.freeddns.org` via DynDNS, or Cloudflare subdomain)
- The Node.js app itself needs no changes — TLS is terminated at the proxy layer

---

## Recommended Path

```
Free / no budget  →  OCI Always Free (Ampere A1, Docker Compose, Caddy for TLS)
Small budget       →  Hetzner CX22 (~$4/month, same setup)
Easiest setup      →  Railway ($5/month credit, MySQL included, GitHub deploy)
```

For a small revived community server with crossplay support, **OCI Always Free + Caddy** is the best overall choice: zero ongoing cost, enough headroom to grow, and Docker Compose works exactly as-is.

---

## Files That Would Change for Mobile Crossplay

> **Important:** HTTPS infrastructure alone is not sufficient for mobile crossplay. Server code changes are required first — see `docs/Plan-Enable-Mobile-Windows-Crossplay.md` Steps 1–5 (game_id schema, Discord OAuth CSRF fix). Without those, mobile clients cannot authenticate regardless of TLS being present.

Infrastructure changes (no server code changes required beyond the crossplay plan):

- Add `Caddyfile` (reverse proxy config) to repo root
- Update `docker-compose.yml` to include Caddy service
- Update `docs/Development.md` with deployment guide

### Client-Side Reality Check

The cloud deployment plan handles the server and network layer. The client side is a separate effort with its own blockers:

- **Windows/Steam**: Already works. No client changes needed.
- **iOS/Android**: Requires decompiling the Adobe AIR SWF (source not available), implementing Discord OAuth deep-link flow in ActionScript, migrating the build to HARMAN AIR 50+ for modern OS compatibility, and re-distributing the app. Android sideloading (direct APK) is the fastest path to mobile testing — no App Store account required. iOS requires at minimum an Apple Developer account ($99/year) for TestFlight distribution.

Full client-side breakdown is in `misc/Plan-Enable-Mobile-Windows-Crossplay.md` under "Client-Side Changes Required".

---

*Created with [Claude Code](https://claude.ai/code)*
