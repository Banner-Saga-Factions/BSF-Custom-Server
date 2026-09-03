# Deployment Guide

> For local development setup (running the server on your own machine), see [CONTRIBUTING.md](../CONTRIBUTING.md).

This runbook has been run on real machines twice. It was written on 2026-09-01 while rebuilding the production server, and on 2026-09-02 Steps 0 to 6 and the restore were run again from nothing — a different machine, a different Google account, a different cloud project. That second run is the one that matters, because a guide can pass on the machine it was written from and still fail everywhere else: the author's machine already has the state the guide forgot to mention. It found fifteen mistakes, all corrected here.

**Three things have still never been run:** Step 2 (pointing a name at the machine), the security certificate that depends on it, and the upload half of Step 7. The second run skipped all three on purpose, so nothing here about certificates or a real upload has been checked by doing it.

---

## SQLite Integration Status

| Item | Status |
|---|---|
| Database driver | `node:sqlite` (Node.js 22.5+ built-in — no npm package, no native binaries) |
| Schema init | Auto-runs from `src/db/connection.ts` on every startup (`CREATE TABLE IF NOT EXISTS`) |
| Required env vars | `DB_PATH` (default: `./data/bsf.db`) + `JWT_SECRET` |
| Docker volume | `db-data` mounted at `/data` — persists across container restarts |
| Test impact | None — the test suite mocks `src/db/connection.ts` entirely |

---

## Deploying to GCP e2-micro (Free Tier)

### What the free tier actually covers

Google's Always Free list for Compute Engine has exactly three entries relevant here (checked 2026-09-01 against [the Always Free page](https://docs.cloud.google.com/free/docs/free-cloud-features)):

- **one** non-preemptible `e2-micro` instance per month, in `us-west1`, `us-central1`, or `us-east1`
- **30 GB-months** of standard persistent disk
- **1 GB** of outbound traffic from North America per month

Three things people assume are covered but are **not**:

- **Disk snapshots.** The current Always Free list carries no snapshot allowance (checked 2026-09-01). It used to — Google's Compute Engine free tier included 5 GB-months of snapshot storage for years, which is where the figure people still quote comes from. Do not plan around it, and as with the IP address, confirm against your own billing rather than trusting this line. It is why the backup below uses a storage bucket rather than a snapshot schedule.
- **The external IP address.** Not listed, so it bills at standard rates. Check what yours actually costs in the billing console's cost table rather than trusting any figure quoted here.
- **Anything beyond one instance.** A second `e2-micro` running at the same time draws on the same monthly pool of hours, so both stop being free partway through the month.

> **"GB-months" is storage multiplied by time, not a monthly transfer quota.** Google's own gloss: *"5 GB-months of regional storage (US regions only) per month, which corresponds to the storage of 5 GB of data for a period of 1 month."* Holding 10 GB for two weeks costs the same as holding 5 GB all month. So **stored bytes that never exceed 5 GB at any moment cannot exceed 5 GB-months in that month** — no averaging needed. Two things that measurement has to account for, though: the allowance is per **billing account**, not per bucket, and by default a deleted object stays billed for another seven days while being hidden from listings. Step 7 turns that behaviour off so the check is honest.

### VM Specification

| Field | Value | Why it matters |
|---|---|---|
| Machine type | `e2-micro` (2 shared vCPUs, 1 GB RAM) | Custom machine types do not qualify for the free tier |
| Region | `us-central1`, `us-west1`, or `us-east1` | The free tier applies only in these three |
| Boot disk | Debian 12 (bookworm), 30 GB **standard** persistent disk (`pd-standard`) | Balanced (`pd-balanced`) and SSD disks are **not** free; premium OS images such as Windows Server carry licence fees |
| Network tier | **Standard** | Premium tier is not covered by the free allowance |
| Cost | **$0/month** for compute and disk (see the external IP note above) | |

The production VM as deployed:

| Field | Value |
|---|---|
| Name | `bsf-server-vm` |
| Zone | `us-central1-a` |
| External IP | `35.209.221.226` — **ephemeral**, see Step 2 |
| Hostname | `bsf-server.duckdns.org` |
| OS | Debian 12 (bookworm) |

> **This workstation's `gcloud` default zone is `us-central1-f`**, which is *not* where the VM lives. Always pass `--zone=us-central1-a` explicitly; a bare `gcloud compute ssh bsf-server-vm` looks in the wrong zone and fails.

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

### Know which machine you are on

Every step below runs either on **your workstation** or on **the VM**, and the same command in the wrong place fails in confusing ways. The shell prompt tells you which:

| Prompt looks like | You are on | Commands need |
|---|---|---|
| `PS C:\…>` | your Windows workstation | the `gcloud compute ssh …` wrapper |
| `rleyb@bsf-server-vm:~$` | the VM | no wrapper — run them bare |

Running `gcloud compute ssh` *from* the VM makes it try to connect to itself and fail with **"Request had insufficient authentication scopes"** — a message about permissions, for a problem that is really about location. (The VM's identity deliberately has no Compute Engine access.) This is the same class of mistake as pitfall #1 below, from the other direction.

To open a session:

```bash
gcloud compute ssh bsf-server-vm --zone=us-central1-a
```

---

### Know which shell you are in

The other half of the same question, and it costs more than it looks. Every block below runs in one of two shells, and they are not interchangeable:

- **On your workstation that is PowerShell.** Blocks marked `powershell` are already written for it.
- **On the VM that is a Linux shell.** Everything inside an SSH session is Bash.

The cloud commands in Steps 0, 1 and 7 run on your **workstation** but are written in Linux style, which costs you two things when you paste them into PowerShell.

- **A trailing `\` joins two lines in Bash and means nothing in PowerShell.** Paste such a command as a single line, or the first line runs on its own and the rest runs as a separate, broken command.
- **A value containing commas must be quoted.** PowerShell reads a bare comma as its list-building operator, so it takes the comma-joined value apart and hands the tool one item where you meant several. The tool then complains that your list is invalid when the list is fine, and you go looking in the wrong place.

Step 0's access-scope command is where both bite at once. It is written below with the quoting and the joining already done.

---

### Step 0: Provision the VM

Skip this if the VM already exists.

**On a brand-new project, switch Compute Engine on first.** It is off until you turn it on, and the first command you run otherwise stops and asks you to enable it before you have created anything. Confirmed the hard way on a fresh project, 2026-09-02:

```bash
gcloud services enable compute.googleapis.com --project=<PROJECT_ID>
```

Check in the billing console that a billing account is linked to the project as well. Free-tier usage still needs one.

One-time network setup next, only if the project has no default VPC network:

```bash
gcloud compute networks create default --subnet-mode=auto
```

Then create the instance. Every flag here is load-bearing for the $0 outcome:

```bash
gcloud compute instances create bsf-server-vm \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-type=pd-standard --boot-disk-size=30GB \
  --network=default --network-tier=STANDARD \
  --tags=http-server,https-server
```

Confirm it came up as intended. This catches a silently upgraded disk type or network tier, which are the two easiest ways to leave the free tier without noticing:

```bash
gcloud compute instances list --filter="name=bsf-server-vm"
gcloud compute disks describe bsf-server-vm --zone=us-central1-a --format="value(type.basename(),sizeGb)"
gcloud compute instances describe bsf-server-vm --zone=us-central1-a \
  --format="value(networkInterfaces[0].accessConfigs[0].networkTier)"
```

Expect `pd-standard`, `30`, and `STANDARD`.

#### If the server will back up to Cloud Storage, widen its access now

Do this **before** DNS and before the first start, because it forces a restart that can change the machine's address. See Step 7 for what the backup does; this is only the permission half.

An **access scope** is a ceiling on what a VM's built-in identity may do, applied on top of ordinary permissions. A fresh VM gets read-only storage access, so backup uploads fail — and changing it requires the instance to be **stopped**:

```bash
gcloud compute instances stop bsf-server-vm --zone=us-central1-a

gcloud compute instances set-service-account bsf-server-vm --zone=us-central1-a --scopes="https://www.googleapis.com/auth/devstorage.read_write,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/trace.append"

gcloud compute instances start bsf-server-vm --zone=us-central1-a
```

> **Leave the middle command on one line, and leave the quotes on.** Both are load-bearing on Windows and neither can be tidied away. Unquoted, PowerShell takes the comma-joined list apart and hands the tool one item, which is then refused as *"One or more of the service account scopes are invalid"* — an accusation aimed at the part that is correct. Split across lines in the Linux style, the trailing `\` does nothing in PowerShell and the command runs in halves. Both were reproduced on 2026-09-02, and this is the worst possible place to meet them: the machine is **stopped** while you work it out.

That list swaps read-only storage for read-write. It is **not** a superset of what a fresh VM starts with — a new Debian 12 `e2-micro` has seven scopes and this list has six, so the message-queue scope is dropped. Nothing here uses it. Measured either side of the change, 2026-09-02. Use the full scope URLs — the short aliases are inconsistent (`storage-rw` is accepted, `trace-append` is not).

> **Note the address the instance comes back with.** Stopping a VM releases an ephemeral IP, and the replacement may differ. It happened to come back unchanged on 2026-09-01, but that is luck, not a rule.

### Step 1: Firewall Rules

Creating the VM with `--tags=http-server,https-server` only labels it; the rules that act on those labels must exist in the network. Check first:

```bash
gcloud compute firewall-rules list
```

You need inbound SSH, and inbound HTTP/HTTPS aimed at those tags. If they are missing:

```bash
gcloud compute firewall-rules create default-allow-ssh \
  --network=default --allow=tcp:22 --source-ranges=0.0.0.0/0

gcloud compute firewall-rules create default-allow-http-https \
  --network=default --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server --source-ranges=0.0.0.0/0
```

Port 8082 does **not** need a rule — it is internal to the Docker network.

### Step 2: Point Your Domain at the VM

Create an **A record** — the DNS entry mapping a name to an address — pointing your hostname at the VM's external IP:

```
A   bsf-server.duckdns.org   →   35.209.221.226
```

Caddy cannot obtain a certificate until this resolves correctly, because the stock Caddy image uses the challenges where Let's Encrypt proves you control the name by connecting to it. (There is a DNS-based challenge that needs no A record at all, but it requires a Caddy build including your DNS provider's plugin, which `caddy:2-alpine` does not have.) Check from your own machine before going further:

```bash
nslookup bsf-server.duckdns.org 8.8.8.8
```

> **No domain yet?** A free [DuckDNS](https://www.duckdns.org/) subdomain works. Sign in, create a subdomain, enter the VM's external IP. When you buy a real domain later, update `BSF_DOMAIN` in `.env` and run `docker compose up -d --force-recreate caddy`.

#### The address is ephemeral — install the updater

**No static IP is reserved for this VM.** The address is ephemeral: stopping the instance *releases* it, and starting it again assigns a new one with no guarantee you get the same address back — including during the access change in Step 0. When that happens the hostname points at nothing while the server keeps running perfectly, so every check of the *server process* comes back healthy. That is what makes it slow to diagnose, and worth automating away.

The VM can still tell you, if you know to ask. Compare the address GCP thinks it has against what the hostname resolves to:

```bash
curl -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip
getent hosts bsf-server.duckdns.org
```

> **Two commands both called "restart", with opposite consequences.** `gcloud compute instances stop` then `start` releases the address. `gcloud compute instances reset` keeps it (along with attached disks and machine type) — it is a hard power-cycle rather than a shutdown. A reboot issued from inside the guest OS also keeps the address, because the instance never leaves the running state, as does live migration during host maintenance.

The updater below tells DuckDNS "whatever address this request came from is my address", every five minutes and on every boot. Nothing has to discover the VM's public IP, because the one machine that reliably knows it is the server being told.

On the VM, create `/usr/local/bin/duckdns-update.sh`:

```sh
#!/bin/sh
set -eu
DOMAIN=bsf-server
TOKEN_FILE=/etc/duckdns/token
[ -s "$TOKEN_FILE" ] || { echo "duckdns: token file empty, skipping"; exit 0; }

# Strip every whitespace character. A token pasted from a web page often
# arrives with a trailing newline, a stray space, or a label attached.
TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
case "$TOKEN" in
    ????????-????-????-????-????????????) : ;;
    *) echo "duckdns: token is not a 36-character UUID (got ${#TOKEN} chars)"; exit 1 ;;
esac

# Feed the URL through curl's config file on stdin rather than as an argument,
# so the token never appears in the process list.
RESP=$(printf 'url = https://www.duckdns.org/update?domains=%s&token=%s&ip=\n' \
    "$DOMAIN" "$TOKEN" | curl -fsS -K - || echo FAIL)
echo "duckdns: $RESP"
[ "$RESP" = "OK" ]
```

Then a systemd service and a timer that runs it one minute after boot and every five minutes thereafter — `/etc/systemd/system/duckdns.service` of `Type=oneshot`, and `/etc/systemd/system/duckdns.timer` with `OnBootSec=1min` and `OnUnitActiveSec=5min` — enabled with `sudo systemctl enable --now duckdns.timer`.

Store the token with the companion helper `duckdns-set-token`, which prompts without echoing, refuses anything that is not a 36-character identifier, writes it root-only to `/etc/duckdns/token`, and immediately tests it:

```bash
duckdns-set-token
```

**Validate at the point of entry, not at the point of use.** Without the shape check, a mis-paste is accepted silently and surfaces five minutes later as `curl: (3) URL using bad/illegal format` in a system log — an error from a different program that mentions neither DuckDNS nor tokens. This is the same principle as the server refusing to start without a `JWT_SECRET`.

> **Pasting into the SSH window:** `gcloud compute ssh` on Windows uses PuTTY, where **Ctrl+V does nothing**. Paste with **right-click** or **Shift+Insert**. When input is hidden, a failed paste looks identical to a program ignoring you.

> **Treat the token as a credential.** It can repoint any of your subdomains, so anyone holding it could aim your hostname at a machine of their own and receive your players' logins. If it is ever exposed — pasted into a chat window, committed, logged — recreate it at duckdns.org and set the new one.

### Step 3: Prepare the VM

```bash
# 2 GB swap — the Docker build needs more memory than this machine has.
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -m   # confirm ~2048 under Swap
```

Without swap the build exhausts the 1 GB of RAM and the SSH session freezes rather than reporting an error (pitfall #7). If `/swapfile` already exists, `fallocate` refuses with "Text file busy" — skip to `swapon` (pitfall #8).

The check on the boot-configuration line is there because pitfall #8 sends you back through this block. Without it, every pass adds another copy of the same line.

Then install Docker **from Docker's own package repository**:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
exit   # the group only applies to a new login session — reconnect
```

**Why Docker's repository and not the distribution's?** `docker-compose-plugin` is Docker's own package name, and neither Debian nor Ubuntu publishes anything called that — so `apt-get install docker.io docker-compose-plugin` fails on both. Ubuntu *does* ship Compose v2, under the different name `docker-compose-v2` (in the *universe* component); Debian ships no Compose v2 package at all. Using Docker's repository means both distributions follow identical steps and both track upstream versions. On Ubuntu, substitute `ubuntu` for `debian` in the two URLs above; everything else is the same.

After reconnecting, `docker ps` must work without `sudo`. If it reports *permission denied … docker.sock*, the group has not taken effect — exit and reconnect again (pitfall #6).

### Step 4: Clone and Configure

```bash
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server/bsf-server
cp .env.example .env
```

> **The path has two levels.** `docker-compose.yml`, `Dockerfile`, `Caddyfile` and `.env.example` all live in `bsf-server/` inside the repository, **not** at its root. Running compose from the root fails with "no configuration file provided".
>
> The directory name also sets Compose's project name, and therefore the prefix of every volume it creates. That is what caused pitfall #10; the `db-data` volume now pins `name: bsf-server_db-data` so a future move cannot strand the data.

Set exactly two values in `.env`:

```
JWT_SECRET=<output of: openssl rand -hex 32>
BSF_DOMAIN=bsf-server.duckdns.org
```

Generate the secret **on the VM** so it never passes through a chat window, a shell history, or a clipboard. Run `chmod 600 .env` afterwards.

Two values you do **not** need to set:

- **`DB_PATH`** — `docker-compose.yml` sets it to `/data/bsf.db` in its `environment:` block, and a Compose `environment:` entry overrides anything from `env_file:`. The `DB_PATH` line inherited from `.env.example` is therefore ignored, which is harmless.
- **`NODE_ENV`** — the `Dockerfile` bakes in `production`. Do not add it to `.env`; setting it to anything else enables the debug routes (see Step 6).

### Step 5: Build and Start

```bash
docker compose up -d --build
```

The first run builds the image and takes 2–4 minutes on this hardware. Subsequent starts are instant (`docker compose start`).

> **Build from source; do not pull the published image.** The workflow that publishes `docker.pieloaf.com/bsf-server:latest` sits at `bsf-server/.github/workflows/`, but GitHub only runs workflows from `.github/workflows/` at the **repository root** — so it has not run since **2 May 2026**, the day before the reorganisation moved it out of the root. Worse, every one of its 29 recorded runs was a pull-request run, and the workflow blocks pushing except on `main` — so nothing is known to have published that image from this repository at all. Treat the tag's contents as *unknown*, not merely old. Tracked as [#228](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/228).

### Step 6: Verify

On the VM:

```bash
docker compose ps                                   # app and caddy both Up
docker compose logs app | grep BOOT
docker compose logs caddy | grep -i "certificate obtained"
docker compose exec -T app sh -c 'ls -la "$DB_PATH"'
```

What good looks like:

- **`docker compose ps`** → both `app` and `caddy` show **Up**.
- **`[BOOT] NODE_ENV=production`, and *no* line reading "debug routes are ENABLED".** This one is a security check, not a health check: outside production the server exposes routes that cap how many units enter a battle, shorten turn clocks, and adjust renown. Two of the three require **no session at all** — not an expired one, not any — so a server booted in the wrong mode hands those controls to anonymous callers on the internet while looking completely healthy.
- **`certificate obtained successfully`** from Caddy. The lines just before it mentioning "no account … is known to us" are normal first-run noise, not errors.
- **`bsf.db` exists** at `/data/bsf.db`.

Then from your **workstation**, confirming the whole public path — DNS, TLS, proxy, app:

```powershell
Invoke-RestMethod -Method Post -Uri "https://bsf-server.duckdns.org/services/auth/login/11" `
  -ContentType "application/json" -Body '{"steam_id":"123456"}'
```

A reply containing a `session_key` means the full stack works. Use `Invoke-RestMethod` in PowerShell, not `curl` — PowerShell passes backslash escaping through literally, so the JSON body arrives malformed.

Finally, check the debug gate from outside as well. Do **both** checks, because they fail in different directions: a 404 cannot distinguish "the routes are off" from "the request never reached this container", and the log line cannot distinguish "this container" from "whichever container is actually serving port 443".

```powershell
Invoke-WebRequest -Method Post -Uri "https://bsf-server.duckdns.org/debug/party-limit"
```

This **must** fail with 404.

> **It has to be a POST.** These routes are POST-only, so a GET returns 404 whether the debug block is enabled or not — checking the URL in a browser passes the test on a wide-open server. The same applies to the login endpoint below: `wget` and a browser both issue GET and get a 404, which is not a fault.

### Step 7: Back Up Off the Machine

**The database must be copied somewhere the VM's own destruction cannot reach.** On 2026-09-01 the production VM was deleted by accident. It held the only copy of every account, rating and battle record — including the backup archives an earlier version of this guide told you to write to `~/bsf-backups`, a backup living on the machine it protects. There were no snapshots, nothing was recoverable, and the player base restarted from empty.

A compressed copy of this database is a few kilobytes, so a Cloud Storage bucket holds a fortnight of history well inside the free allowance.

**Create the bucket**, pinned to `us-central1` (inside the free-tier region list), and expire objects after 14 days so stored bytes stay bounded:

```bash
gcloud storage buckets create gs://bsf-community-server-db-backups \
  --location=us-central1 --default-storage-class=STANDARD --uniform-bucket-level-access

printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":14}}]}' > /tmp/lifecycle.json
gcloud storage buckets update gs://bsf-community-server-db-backups --lifecycle-file=/tmp/lifecycle.json

# Turn OFF soft delete. It is ON by default with a 7-day retention, which keeps
# deleted objects billed for a week AND hides them from listings -- so the size
# check below would under-report what you are actually paying for.
gcloud storage buckets update gs://bsf-community-server-db-backups --clear-soft-delete
```

**Give the VM's identity permission to write to it.** Both an access scope and an IAM role must allow the write, and the error message does not say which one refused. Check what the service account already has before adding anything — Google often grants the default Compute Engine service account the project-wide **Editor** role, which covers object writes on its own:

```bash
gcloud projects get-iam-policy <PROJECT_ID> \
  --flatten="bindings[].members" \
  --filter="bindings.members:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
  --format="value(bindings.role)"
```

If that prints `roles/editor`, the scope change in Step 0 was all you needed. This deployment adds a narrower binding anyway, so backups keep working if the Editor grant is ever removed:

```bash
gcloud storage buckets add-iam-policy-binding gs://bsf-community-server-db-backups \
  --member=serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectAdmin
```

**The nightly job**, at `/usr/local/bin/bsf-backup.sh`:

```sh
#!/bin/sh
set -eu
BUCKET=gs://bsf-community-server-db-backups
COMPOSE_DIR=/home/rleyb/BSF-Custom-Server/bsf-server
LOCAL=/var/backups/bsf
TMP_IN_VOL=/data/_backup_tmp.db
TS=$(date -u +%Y%m%dT%H%M%SZ)
NAME="bsf-db_${TS}.db.gz"

mkdir -p "$LOCAL"
cd "$COMPOSE_DIR"

# Ask SQLite for a single-file consistent snapshot, written inside the volume.
docker compose exec -T app node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
try { fs.unlinkSync('$TMP_IN_VOL'); } catch (e) {}
const db = new DatabaseSync(process.env.DB_PATH);
db.exec(\"VACUUM INTO '$TMP_IN_VOL'\");
db.close();
"

# Bring it out of the volume and compress it.
docker compose exec -T app cat "$TMP_IN_VOL" | gzip -c > "${LOCAL}/${NAME}"
docker compose exec -T app rm -f "$TMP_IN_VOL"

# A file that is not verifiably a database is not a backup.
if [ "$(gzip -dc "${LOCAL}/${NAME}" | head -c 15)" != "SQLite format 3" ]; then
    echo "backup FAILED: archive is not a SQLite database" >&2
    rm -f "${LOCAL}/${NAME}"
    exit 1
fi

gcloud storage cp "${LOCAL}/${NAME}" "${BUCKET}/${NAME}" --quiet

# Keep the three most recent copies locally for a fast restore; the bucket
# holds the real history and expires objects by lifecycle rule.
ls -1t "${LOCAL}"/bsf-db_*.db.gz 2>/dev/null | tail -n +4 | xargs -r rm -f

echo "backup ok: ${NAME} ($(stat -c %s "${LOCAL}/${NAME}") bytes, verified SQLite)"
```

Driven by a systemd timer — `OnCalendar=*-*-* 03:15:00 UTC`, `RandomizedDelaySec=15min`, `Persistent=true` — so a missed run catches up after downtime.

#### Do not back this database up by copying its files

**The obvious approach is wrong, and it fails silently.** SQLite keeps recent writes in a separate write-ahead log beside the database, folding them in periodically. An archiver reads the two files at two different instants — and if a fold happens in between, the archive pairs an **old** database with a **newer** log. Restoring that replays the log onto the wrong base. The result opens without complaint and is quietly incorrect, which is worse than a backup that obviously failed.

That is not a remote possibility here. Measured on this server on 2026-09-01: `bsf.db` was **4,096 bytes** and `bsf.db-wal` was **193,672 bytes** — the log was forty-seven times the size of the database, so essentially all the data was in the part most likely to move.

`VACUUM INTO` avoids this because SQLite does the copying and knows what a consistent moment looks like. It is one of the three methods SQLite documents as safe on a database that is in use, alongside the backup API and `sqlite3_rsync`; see [How To Corrupt An SQLite Database File](https://www.sqlite.org/howtocorrupt.html).

> **A trap worth knowing if you rewrite this.** Mounting the volume read-only (`:ro`) sounds like the safe choice and actively prevents the safe method: a write-ahead-log database cannot be opened *even for reading* on a read-only filesystem, because SQLite has to create an index file next to it. A read-only mount therefore leaves file-copying as the only option available — which is the unsafe one. Going through the container that already holds the database open sidesteps this entirely.

**Confirm you are inside the free allowance:**

```bash
gcloud storage du -s --readable-sizes gs://bsf-community-server-db-backups
```

Because the allowance is storage multiplied by time, a total that never exceeds 5 GB is sufficient — no averaging required. Two caveats on that number, though. It counts **one bucket**, while the allowance is per **billing account**, so add up every bucket you own in the free-tier regions. And it counts only what a listing can see: with soft delete enabled (the default, which the bucket creation above turns off) deleted objects keep billing for seven days while being invisible here. At a few kilobytes per night the headroom is enormous either way, but the check is only honest with soft delete off.

**To restore**, fetch the object, unpack it, and put it in place — it is a complete database file, so there is nothing to replay:

```bash
gcloud storage ls gs://bsf-community-server-db-backups/
gcloud storage cp gs://bsf-community-server-db-backups/bsf-db_<TIMESTAMP>.db.gz /tmp/
gzip -dc /tmp/bsf-db_<TIMESTAMP>.db.gz > /tmp/restored.db
```

Check it before trusting it — a restore is the wrong moment to discover an unreadable archive:

```bash
cd ~/BSF-Custom-Server/bsf-server
docker compose cp /tmp/restored.db app:/tmp/restored.db
docker compose exec -T app node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/tmp/restored.db', { readOnly: true });
console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all());
console.log(db.prepare('SELECT COUNT(*) AS n FROM accounts').get());
db.close();
"
```

Then swap it in with the app stopped, following *Restore from a backup* below — deleting the old log files is the step people miss.

---

## Connecting Game Clients

Players launch the game client with the `--server` flag pointing at the domain:

```
"The Banner Saga Factions.exe" --server https://your.domain.here/ --steam true --factions
```

### Connecting to the production server

```
"The Banner Saga Factions.exe" --server https://bsf-server.duckdns.org/ --steam true --factions
```

For a 2-player test with two real Steam accounts:

```
"The Banner Saga Factions.exe" --server https://your.domain.here/ --steam true --factions --versus_start
```

Each player runs this on their own machine. Both will enter the matchmaking queue and be matched automatically.

The PowerShell scripts (`launch-game-2p.ps1`, `launch-game-2p-quickbattle.ps1`) are for local testing only — they hardcode `localhost` and launch both clients on the same machine. The `--versus_start --versus_countdown 0` flags baked into them are mandatory for 2-on-one-PC because FMOD's audio extension only initializes for the first client; see [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

---

## Deploying Code Changes

Every time you push a fix or new feature, follow this workflow: push to GitHub from your local machine, then **back up the database** and pull/rebuild on the VM. Always take the backup *before* rebuilding — it costs a few seconds and is your only undo button if a migration or WAL replay goes wrong.

### Part 1 — Local: push your changes to GitHub

```bash
git add <changed-files>
git commit -m 'description of what changed and why'
git push origin main
```

### Part 2 — VM: back up, pull, rebuild, verify

SSH into the VM first (run this from your local machine):

```bash
gcloud compute ssh bsf-server-vm --zone=us-central1-a
```

**Step 1 — Pre-flight check (read-only).** Confirm what's running and that the working tree is clean, so `git pull` fast-forwards without conflict:

```bash
cd ~/BSF-Custom-Server/bsf-server
git fetch
git log --oneline -1                  # the commit running right now
git log --oneline HEAD..origin/main   # what you're about to deploy (empty = already up to date)
git status --short                    # expect only untracked .env files, nothing tracked
```

If `git status` shows tracked modifications, stop and resolve them first — a dirty tree can turn the pull into a merge conflict mid-deploy.

**Step 2 — Back up the database (no downtime).**

Run the same job the nightly timer runs. It archives the volume *and* copies the archive off the machine, so a deploy that goes wrong stays recoverable even if the VM itself is lost:

```bash
sudo /usr/local/bin/bsf-backup.sh
gcloud storage ls -l gs://bsf-community-server-db-backups/ | tail -3
```

If that job is not installed yet, set it up per Step 7 — and take a local-only archive in the meantime, understanding that it protects you against a bad migration but not against losing the machine:

```bash
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/bsf-backups
docker run --rm -v bsf-server_db-data:/v:ro -v ~/bsf-backups:/out alpine \
  tar czf "/out/bsf-server_db-data_${TS}.tgz" -C /v .
ls -la ~/bsf-backups/   # confirm a new, non-empty .tgz appeared
```

Why archive the whole volume instead of copying `bsf.db`? SQLite keeps recent writes in a separate **write-ahead log** (`bsf.db-wal`) before folding them into the main `bsf.db` — and that WAL is often *larger* than `bsf.db` itself. Copying only `bsf.db` would silently drop every write since the last fold. Archiving the whole volume captures `bsf.db`, `bsf.db-wal`, and `bsf.db-shm` as a set, which SQLite can recover from. The `:ro` flag makes the source read-only, so the backup can never corrupt the live data.

**Step 3 — Pull and rebuild.**

```bash
git pull                       # expect a clean fast-forward
docker compose up -d --build
```

The `--build` flag is required — without it, Docker reuses the old image and your code changes are silently ignored. The rebuild takes 2–4 minutes on e2-micro; the old container keeps serving during the build, so downtime is only the few seconds of the container swap at the end.

### How your player data survives a rebuild

A rebuild swaps the **code**, never the **data**. Three separate Docker objects are in play:

| Object | What it holds | Replaced by `up -d --build`? |
|---|---|---|
| **Image** | the compiled server code | ✅ Yes — rebuilt from your new source |
| **Container** | a running instance of the image | ✅ Yes — old one destroyed, new one created |
| **Named volume** `bsf-server_db-data` | the live `bsf.db` database file | ❌ **No — never touched** |

The database does **not** live inside the image or the container. It lives in the **named volume** — a slice of the VM's own disk that sits *outside* any container. When `docker compose up -d --build` recreates the app container, the new container re-attaches that same volume, because `docker-compose.yml` declares it:

```yaml
volumes:
  - db-data:/data        # plug the bsf-server_db-data volume in at /data
```

That one line is what preserves your data. Docker unplugs the volume from the old container and plugs it into the new one — `bsf.db` and its WAL are exactly as they were.

Think of the volume as a USB stick and the image/container as a game console: upgrading the console doesn't erase the USB stick; you just move it to the new console. **The backup tarball from Step 2 is never read by the rebuild** — it's a photocopy of that stick in a drawer, restored by hand only if the live volume is ever damaged (see "Restore from a backup" below).

> **Mount-path changes are safe too.** If the volume's mount path changes between versions (e.g. the historical `/app/db` → `/data` move in pitfall #9), the *same* volume simply appears under a different folder inside the new container. The files never move on disk — only the in-container path label changes, and `DB_PATH` is set to match it in the compose `environment:` block.

### Verify the new version is running

```bash
docker compose ps                                      # both app and caddy should show "Up"
docker compose logs app --tail=50                      # startup health (see below)
docker compose exec -T app sh -c 'ls -la "$DB_PATH"'   # DB present at the expected path
```

What good looks like:
- `docker compose ps` → both `app` and `caddy` are **Up**.
- The app log contains **`Express server listening on port 8082`**, shows any pending migrations applied, and has **no** `Cannot find module` or `WAL mode not active` lines.
- `ls -la "$DB_PATH"` → `bsf.db` exists and is at least as large as before the deploy (it usually grows as the WAL folds in on startup — that confirms your player data made the move).

Then, from your **local machine**, confirm the full HTTPS path end-to-end:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"steam_id":"123456"}' https://bsf-server.duckdns.org/services/auth/login/11
```

A JSON object with a `session_key` means the deploy is healthy.

> **`docker compose restart` does NOT pick up code changes.** It only restarts the existing container from the same image. Always use `docker compose up -d --build` after a `git pull`.

### Restore from a backup

Only needed if a deploy corrupted the live database. Stop the app, wipe the live DB files, unpack the Step-2 tarball back into the volume, and restart:

```bash
cd ~/BSF-Custom-Server/bsf-server
docker compose stop app
docker run --rm -v bsf-server_db-data:/v -v ~/bsf-backups:/in:ro alpine sh -c '
  rm -f /v/bsf.db /v/bsf.db-wal /v/bsf.db-shm        # clear live files first
  tar xzf /in/bsf-server_db-data_<TIMESTAMP>.tgz -C /v   # restore the consistent backup set
'
docker compose start app
docker compose logs app --tail=30
```

Replace `<TIMESTAMP>` with the tarball you want (`ls ~/bsf-backups/`). For the harder case of merging two *split* volumes, see pitfall #10.

---

## Ongoing Operations

| Task | Command |
|---|---|
| View logs | `docker compose logs -f app` |
| Restart server (same image) | `docker compose restart app` |
| Reload `.env` changes | `docker compose up -d --force-recreate <service>` |
| Pull latest code and redeploy | `git pull && docker compose up -d --build` |
| Inspect the database | `docker compose exec app sh` then `sqlite3 /data/bsf.db` |
| Back up the database now | `sudo /usr/local/bin/bsf-backup.sh` — archives the whole volume (captures the write-ahead log; copying `bsf.db` alone would drop it) and uploads it off the machine |
| List available backups | `gcloud storage ls -l gs://bsf-community-server-db-backups/` |
| Check backup storage stays free | `gcloud storage du -s --readable-sizes gs://bsf-community-server-db-backups` — must stay under 5 GB |
| Check the backup timer | `systemctl list-timers bsf-backup.timer` |
| Check the DNS updater | `journalctl -u duckdns.service -n 5` — expect `duckdns: OK` |
| Stop everything | `docker compose down` (data volume preserved) |

---

## Notes

- **WAL mode**: The server enables SQLite WAL mode on startup. On ext4 (GCP persistent disk), this works correctly. If `docker compose logs app` shows `WAL mode not active`, the volume filesystem doesn't support WAL — this is uncommon on standard GCP disks.
- **Single instance only**: In-memory sessions and battle state cannot be shared across multiple instances. Do not run more than one app container pointing at the same DB.
- **Let's Encrypt rate limits**: Caddy caches certificates in the `caddy-data` volume. Destroy and recreate that volume and a fresh certificate is requested. Three separate limits matter, and they are easy to confuse: **5 certificates per week for an identical set of hostnames** (this is the one volume-cycling hits), **50 per week per registered domain**, and — while DNS is still wrong — **5 failed validations per hostname per hour**, which is what you actually run into during first setup. See [Let's Encrypt's rate limits](https://letsencrypt.org/docs/rate-limits/).
- **`caddy-data` is not name-pinned, `db-data` is.** The fix from pitfall #10 protects the database volume only, so a future move of `docker-compose.yml` would still abandon Caddy's certificate store under its old project-prefixed name. The stack keeps working — it just requests new certificates, against the limits above.

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

**Fix**: The group change only applies to a new login session, and `newgrp` is unavailable on minimized Ubuntu images (Debian 12 does ship it) — the portable fix is to exit and reconnect:

```bash
sudo usermod -aG docker $USER
exit
# Re-SSH from your local machine, then retry docker commands
```

### 7. Build freezes on e2-micro — PuTTY shows "(inactive)"

The `yarn install --production` step during `docker compose up --build` can exhaust the 1 GB RAM on e2-micro, freezing the build. PuTTY's title bar changes to "(inactive)" when the SSH session dies.

**Fix**: Add swap before building (this runbook now provisions 2 GB in Step 3):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h   # confirm ~2.0Gi shown under Swap
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
-- The legacy `battles` table was dropped in migration 003 and held no data any
-- code reads, so it is intentionally not merged.
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

*Last Updated: 2026-09-01*
