# Reference codebases — quick orientation

Four **read-only reference codebases** live alongside this repo at `%USERPROFILE%\Code\bsf-refs\`. They are spec material, not source — they exist to answer "what did the original Stoic server/client actually do?" when filling in MVP gaps or fixing a wire-protocol mismatch.

- `server-2013-java\` — original 2013 Stoic Java server (175 `.java` files, MySQL schema 88, Maven build)
- `client-2013-as3\` — original 2013 AS3 client source (385 `.as` files, Java-style multi-module layout)
- `client-decompiled-as3\` — JPEXS decompile of the shipped SWF v1.10.51 (1,113 `.as` files)
- `client-swf-and-ane\` — raw `app.game.air.swf` + ANE extraction inputs

Do **not** vendor, submodule, copy, or otherwise pull these directories into `BSF/`. The production Docker image must not ship Java source or AS3 mirrors, and submodules complicate the `yarn build && yarn test` pre-commit hook.

For the full per-codebase usage table — when to use each, the AS3-staleness audit, the 12-file post-2013 exception list — see [`CLAUDE.md`](./CLAUDE.md) → "Reference Codebases".

## Pinned reference SHA — `server-2013-java`

The server-side integration plan ([`bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`](./bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md)) and its milestones are pinned to this commit of `bsf-refs\server-2013-java\`:

- **SHA:** `515555b26fa6a3b3e7b7b9743c18351cb01532b3`
- **Subject:** Consolidate the AS3 client mirror out to its sibling reference
- **Date:** 2026-05-17

If anyone commits to `server-2013-java` afterwards, update this pin and re-read the milestone plan for drift.

## Top 7 highest-value paths (server-side)

All paths relative to `%USERPROFILE%\Code\bsf-refs\server-2013-java\`. Ordered by leverage per the milestone plan.

1. `src/main/java/tbs/srv/battle/BattleRanking.java` — Elo math (K-factor 32→16 between Elo 2100–2400, floor 100, baseline 1000). **M1 port target.**
2. `src/main/java/tbs/srv/battle/BattleMonitor.java` — `checkBattleFinished()`, `finalizeFinishing()`, `constructBattleFinishedData()` renown awards. **M1 reference, M1.5 port target.** Do not rewrite the `endgameStarted` guard or the DB-write-then-pushData ordering in `bsf-server` — both are already correct.
3. `src/main/java/tbs/srv/battle/RenownSystem.java` — renown award helpers (UNDERDOG, STREAK, BOOST, EXPERT, DAILY, KILLS) used by `BattleMonitor`. **M1.5 port target.**
4. `src/main/java/tbs/srv/worker/VsWorker.java` — matchmaking math (NOT `VsSystem.java`, which is just a 66-line RabbitMQ wrapper). Constants: `VS_WINDOW_POWER_TIME_SECS=90`, `VS_BRACKET_ELO=200`, `VS_BRACKET_POWER=4`. **M2 port target.**
5. `src/main/java/tbs/srv/web/svc/lobby/LobbySvc.java` — 8 lobby endpoints (`invite`/`uninvite`/`exit`/`join`/`decline`/`options`/`ready`/`unready`) plus its backing `tbs/srv/util/LobbySystem.java` state. **M3b port target (Blocker #9).**
6. `src/main/java/tbs/srv/battle/data/` and `src/main/java/tbs/srv/db/models/` — wire-format DTOs (~55 `*Data.java` files). Authoritative whenever a Fiddler capture is ambiguous. Example: `src/main/java/tbs/srv/battle/data/BattlePartyData.java`.
7. `db/game/0/schema.sql` plus numbered `apply.sql` migrations under `db/game/N/` — the original MySQL schema 88 as a target column set when adding SQLite tables. Not for direct port (MySQL → SQLite syntax differences).

For a one-screen route-by-route map (`bsf-server` `services/*` ↔ Java `*Svc.java`), see [`bsf-server/docs/protocol-cross-reference.md`](./bsf-server/docs/protocol-cross-reference.md).
