# Reference codebases — quick orientation

Four **read-only reference codebases** live alongside this repo at `%USERPROFILE%\Code\bsf-refs\`, listed in [*Which mirror to use*](#which-mirror-to-use) below. They are spec material, not source — they exist to answer "what did the original Stoic server/client actually do?" when filling in MVP gaps or fixing a wire-protocol mismatch.

On the client side these mirrors are **read-only references** — the tree you actually edit is `bsf-client/src/` (patch files overlaid on a generated, gitignored `_decompiled/` decompile). Counting that editable tree, the client really has **four AS3 trees**: one you edit (`src/` + `_decompiled/`) and three read-only mirrors. Note the gitignored `_decompiled/` is _not_ the same as the checked-in `client-decompiled-as3\` reference, even though both decompile the same SWF. For the full four-tree map and that distinction, see `bsf-client/docs/reference-codebases.md` ([local](./bsf-client/docs/reference-codebases.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/reference-codebases.md)) → "The four AS3 trees".

Do **not** vendor, submodule, copy, or otherwise pull these directories into `BSF/`. The production Docker image must not ship Java source or AS3 mirrors, and submodules complicate the `yarn build && yarn test` pre-commit hook.

## Which mirror to use

| Path                              | What it is                                                                                                                                                           | When to consult                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bsf-refs\client-2013-as3\`       | Original 2013-era ActionScript source Stoic shared (385 .as files, multi-module Java-style layout under `game/code/client/lib.engine.core/src/` and `lib.game/src/`) | **Default reference for AS3** — nearly every class that has been checked declares the same things as the shipped client, and the original code is far more readable than the decompile |
| `bsf-refs\client-decompiled-as3\` | JPEXS decompile of the shipped SWF v1.10.51 (1,113 .as files; flat layout: `engine/`, `game/`, `tbs/`, `lib/`, plus `GameMainAir.as`, `AneFixer.as`)                 | Use for code added after 2013 (732 files don't exist in 2013), or to verify any of the 12 files in the stale-list below                                                  |
| `bsf-refs\client-swf-and-ane\`    | Raw `app.game.air.swf` + extracted ANE scripts (decompile inputs)                                                                                                    | Rarely read directly; needed to regenerate the decompile                                                                                                                 |
| `bsf-refs\server-2013-java\`      | Original 2013-era Java server Stoic shared (175 .java files, MySQL schema 88, Maven `pom.xml`)                                                                       | When integrating or porting original-server features — pick the work from the BSF Roadmap board; milestone history is archived; see `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`                                                     |

### Prefer 2013 source over decompile, except for 12 stale files

A comparison run on 2026-05-16 checked each file's **signature** — the classes and members it
declares, rather than the code inside them. It covered the 331 files that exist in both trees
**under `engine/` and `game/`**, and found 319 of them declaring exactly the same things. The
twelve that differ are files Stoic changed after 2013, so for those the 2013 source is **stale** and
the decompile is the authority:

- **`engine/battle/fsm/`** (4) — `BattleFsmConfig`, `BattleTurnOrder`, `BattleStateDeploy`, `BattleStateInit`
- **`engine/battle/board/`** (3) — `BattleBoard`, `BattleBoardView`, `EntityFlyText`
- **`engine/battle/ability/effect/op/model/Op.as`** (1)
- **`engine/entity/def/`** (2) — `EntityDef`, `EntityClassDefList`
- **`game/cfg/`** (2) — `GameConfig`, `AccountInfoDefVars`

Every difference found was gameplay iteration — battle internals, entity definitions, game config.

**The protocol layer was never checked.** 381 files exist in both trees, not 331; the other 50 all
sit under `tbs/`, and the comparison was only ever run for `engine/` and `game/`. So "prefer the
2013 source" is **unverified** for `tbs/srv/...` — the wire-format classes that
[`bsf-server/docs/serverEndpoints.md`](./bsf-server/docs/serverEndpoints.md) and
[`bsf-server/docs/protocol-cross-reference.md`](./bsf-server/docs/protocol-cross-reference.md) rely
on. Settling it means running the comparison again for `tbs`. The script and all its working files
are at `%USERPROFILE%\Code\bsf-refs-compare\`; note that both folder paths at the top of the script
name locations that no longer exist, so it needs repointing at `bsf-refs\` before it will run.
Tracked as [#295](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/295).

## Pinned reference SHA — `server-2013-java`

Work that ports features from the original server — its milestone history is archived; see [`bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`](./bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md) — is pinned to this commit of `bsf-refs\server-2013-java\`:

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

## Client-side reference (paths + provenance)

The client analogue of the two sections above — pinned provenance (shipped SWF **v1.10.51** plus file-count fingerprints, since the client mirrors are plain directories, **not** git repos, so there is no commit SHA to pin) and the top ~10 highest-value client paths — lives in the submodule doc `bsf-client/docs/reference-codebases.md` ([local](./bsf-client/docs/reference-codebases.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/reference-codebases.md)) → "Pinned provenance & highest-value client paths".
