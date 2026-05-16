# Banner Saga Factions — Community Server

A community-maintained reimplementation of the Banner Saga Factions multiplayer backend, paired with a patched game client that enables crossplay beyond the original Steam-only restriction. Reverse-engineered from Fiddler captures of the original Stoic servers in 2022.

**Status:** Operational — Steam auth, matchmaking, battle sync, renown awards, and Proving Grounds run on a single GCP e2-micro instance.

---

## What's in This Repo

This is a monorepo with two components:

| Directory                    | What it is                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`bsf-server/`](bsf-server/) | **Node.js / TypeScript backend** — the custom multiplayer server. See its [README](bsf-server/README.md) to run it locally or deploy it.                                                             |
| [`bsf-client/`](bsf-client/) | **Patched ActionScript 3 client** — overlay patches for the original AIR client, enabling Discord OAuth and mobile/Windows crossplay. See its [README](bsf-client/README.md) for build instructions. |

---

## Reference Codebases (optional)

Some areas of this project — wire-protocol work, porting features from the original Stoic server, decompiled-client lookups — lean on read-only reference material that lives outside the repo at `%USERPROFILE%\Code\bsf-refs\`. The 2013 Stoic source is a public GitHub repo: [stoicstudio/tbs-factions-2013](https://github.com/stoicstudio/tbs-factions-2013) (Java server with the AS3 client nested inside). The shipped Steam SWF and its decompile are derived locally from your own Steam install — they are not redistributable.

See [bsf-server/CONTRIBUTING.md § Reference Codebases](bsf-server/CONTRIBUTING.md#10-reference-codebases-optional) for the ~10-minute setup, and [CLAUDE.md § Reference Codebases](CLAUDE.md#reference-codebases) for per-directory purpose and the "prefer 2013 source over decompile, 12 stale exceptions" rule.

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

We will work on how to share factions game later so others who don't have the Steam game can play. [todo] add factions game install to [latest release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/latest)

---

## Community

- **Discord:** [Banner Saga Discord](https://discord.gg/Jf3FNpV8gv) — `@Pieloaf#1999`
- **Issues / roadmap:** [GitHub Issues](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues)
