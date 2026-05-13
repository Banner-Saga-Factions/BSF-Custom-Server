# Banner Saga Factions — Community Server

A community-maintained reimplementation of the Banner Saga Factions multiplayer backend, paired with a patched game client that enables crossplay beyond the original Steam-only restriction. Reverse-engineered from Fiddler captures of the original Stoic servers in 2022.

**Status:** Operational — Steam auth, matchmaking, battle sync, renown awards, and Proving Grounds run on a single GCP e2-micro instance.

---

## What's in This Repo

This is a monorepo with two components:

| Directory | What it is |
|---|---|
| [`bsf-server/`](bsf-server/) | **Node.js / TypeScript backend** — the custom multiplayer server. See its [README](bsf-server/README.md) to run it locally or deploy it. |
| [`bsf-client/`](bsf-client/) | **Patched ActionScript 3 client** — overlay patches for the original AIR client, enabling Discord OAuth and mobile/Windows crossplay. See its [README](bsf-client/README.md) for build instructions. |

---

## Quick Start

**Server only** (most contributors):

```bash
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server/bsf-server
```

Then follow [bsf-server/README.md](bsf-server/README.md).

**Server + client source:**

```bash
git clone --recurse-submodules https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
```

---

## Game Client Download

You don't need to build the client to play. Download the pre-built Adobe AIR bundle from the [latest release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/latest) — no separate runtime install required.

---

## Community

- **Discord:** [Banner Saga Discord](https://discord.gg/Jf3FNpV8gv) — `@Pieloaf#1999`
- **Issues / roadmap:** [GitHub Issues](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues)
