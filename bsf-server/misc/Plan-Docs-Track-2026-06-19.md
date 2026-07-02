# Docs Track (parallel) — Execution Plan

Source: **Docs track** of [`Plan-Issue-Triage-2026-06-10.md`](./archive/Plan-Issue-Triage-2026-06-10.md). Per-issue plans: `Plan-Fix-Issue-<n>-docs-*.md` in this same dir.

## Context

With Wave 2 complete (2026-06-18), the docs series is the next parallelizable chunk. It closes the nine "doc-gaps" issues (#74–#82) plus the `Development.md` cleanup (#48) — turning scattered tribal knowledge (in `.claude/rules/`, `CLAUDE.md`, changelogs, and code) into discoverable docs under `bsf-server/docs/`. This is pure documentation: no runtime code changes, no migration risk, fully parallel with all code work. The authoritative inventory of what's missing — `bsf-server/docs/doc-gaps.md` — already exists on the local `client-documentation-and-server-gaps` branch and must come to `main` as part of the first docs PR; it carries per-doc source-material citations for every item below.

**Out of scope (deferred, per interview):** #47 (upload AIR client to a GitHub Release — binary logistics) and #31 (Wayback→Markdown forum archive — web-scraping content work). Different in nature from doc-writing; track separately.

## Decisions (from interview)

- **Scope:** doc series #74–#82 + #48 (folds into #80).
- **Batching:** one PR per priority tier → **3 PRs** (P1, P2, P3).
- **Cadence:** write a tier, **pause** for review + manual check, then the next tier.

## Progress

**Status (2026-07-01): P1 + P2 MERGED; P3 authored on `docs/p3-doc-gaps-batch` (pending PR review + merge) — the docs track is functionally complete.** `doc-gaps.md` is now empty; all P1–P3 gaps (#74–#82 + #48) are closed.

- **PR 1 (P1) — ✅ MERGED as PR #141 (2026-06-19, `ea4f4bc`).** Branch `docs/p1-doc-gaps-batch` (dev commit `c7f1b25`, pre-commit hook green: build + 298 tests). Contents: imported `docs/doc-gaps.md` + trimmed P1 entries 1–3; extended `docs/dataStructures.md` (7 messages, #74); new `docs/database-schema.md` (#75); new `docs/database-migrations.md` (#76); discoverability links in `README.md` + `docs/ARCHITECTURE.md`. Closed #74/#75/#76. Findings carried forward: `.claude/rules/db.md:14` calls the accounts key `steam_id` but the real column is `user_id TEXT` (documented correctly in database-schema.md — now folded into PR 3 as a housekeeping fix — see below); security #18/#19/#32 already shipped → fed the #78 "what is NOT protected" list.
- **PR 2 (P2) — ✅ MERGED as PR #143 (2026-07-01, `9e9e2a8`).** Branch `docs/p2-doc-gaps-batch`, three Waves on one branch. Contents: new `docs/error-handling.md` (#77 — status code → route/condition → JSON shape → client behavior; long-poll hold corrected to **5 s**), new `docs/security.md` (#78 — threat model + enforced boundaries + a "what is NOT protected" section citing only issues still open at write time), new `docs/battle-simulation.md` (#79). Plus an **endgame-drift sweep** so the new docs don't contradict the old: winner is **server-derived** (#19), renown is `computeRenownAwards()` (WIN/KILLS/UNDERDOG/EXPERT/STREAK — not the flat `20 + kills × 3`) — corrected in `gameFlow.md` / `serverEndpoints.md` / `ARCHITECTURE.md` / `README.md`; `serverEndpoints.md` also dropped the removed `saveBattleResult()`; Elo marked shipped. Trimmed doc-gaps entries 4–6; README + ARCHITECTURE discoverability links. Closed #77/#78/#79. **Scope deviation on #79:** the plan predicted a large "server is authoritative — mine `Battle.ts` for the sim rules" doc; the finding was the opposite — the server runs **no** combat simulation, so `battle-simulation.md` landed as a short *boundary* doc (server = recorder/relay; every combat rule runs client-side in lockstep). Its "enforced vs. deferred" table captures the handful of facts the server does anchor (kill confirmation, winner, surrender-on-stall, Elo, renown).
- **PR 3 (P3) — ✅ authored on `docs/p3-doc-gaps-batch` (branched off `origin/main` `0524553`, 2026-07-01; pending PR).** Landed: new `docs/FAQ.md` (consolidated, area-tagged; deep traps kept as a **link-only index** into `.claude/rules/gotchas.md`); `.claude/rules/gotchas.md` hybrid-trimmed; `CONTRIBUTING.md §9` + `Development.md § Key Gotchas` → redirect stubs, `Development.md` `battles`→`battle` (#80/#48); new `docs/observability.md` (20-channel log table + three break/fix guides + metrics placeholder, #81); three module READMEs — `src/services/battle`, `src/db`, `src/services` (#82); housekeeping `.claude/rules/db.md` `steam_id`→`user_id`; `doc-gaps.md` emptied; FAQ + observability added to README/ARCHITECTURE indexes; fixed a pre-existing dead link at `CONTRIBUTING.md:570`. Closes #80/#48/#81/#82. **Key deviation:** `.claude/rules/gotchas.md` is a *hybrid*, not a full stub — see the PR 3 Outcome note below.

## Prerequisites (do once, before PR 1 — ✅ completed in PR #141)

1. **Branch base.** Fast-forward `main` to `origin/main` (or branch straight off `origin/main`), then create the tier branch from it. Same pattern for the P2/P3 branches off updated `main`.
2. **Bring the inventory to `main`.** Copy just the one file from the unmerged branch (avoids dragging in unrelated branch content):
   `git checkout client-documentation-and-server-gaps -- bsf-server/docs/doc-gaps.md`
   Commit it in PR 1. Thereafter follow the file's own rule — **when an issue closes, delete its numbered entry from `doc-gaps.md`** (don't strike-through).

## Conventions (apply to every doc)

- **Reuse, don't reinvent.** Each new doc seeds from existing material — cite, don't restate: `docs/ARCHITECTURE.md`, `docs/gameFlow.md`, `docs/serverEndpoints.md`, `docs/protocol-cross-reference.md`, `.claude/rules/{db,gotchas}.md`, `CHANGELOG.md`, and the Java reference under `%USERPROFILE%\Code\bsf-refs\server-2013-java\`.
- **Cross-repo links** to `bsf-client/docs/*` use the **dual-link form** (`[local]` + `[GitHub]`) from root `CLAUDE.md`.
- **Paths in prose** use `%USERPROFILE%`-style env vars, not hardcoded `C:\Users\...`.
- **Learning workflow (per `bsf-server/CLAUDE.md`):** before each batch of file writes, present every planned file with What / Why / Tradeoff in one text-only message ending "Reply y to approve." Edit only after `y`. Each tier is its own approval cycle.

---

## PR 1 — P1 tier  `docs/p1-doc-gaps-batch`  ✅ DONE (PR #141)

Lands `doc-gaps.md` + the three "write-next" docs. **#76 must precede #91/#29** (the first migration consumers, both Wave 3 / not started) — comfortably satisfied here.

| Issue | File | Scope (seed from) |
|---|---|---|
| **#74** | extend `bsf-server/docs/dataStructures.md` (in place) | Finish the WIP: add `BattleQueryData`, `BattleSurrenderData`, `BattleFinishedData`, `RenownMessage`, `AchievementProgressData`, `ServerStatusData`, `BattleExitData`. Per message: JSON shape + field types, producing/consuming routes, push timing (POST response vs `/services/game` long-poll), matching Java `tbs.srv.battle.data.client.*Data`. Match existing `BattleReadyData`/`BattleDeployData`/`BattleSyncData` detail. **Document current `rewards[party_index]` ordering** (not winner-first). Sources: `src/services/battle/Battle.ts`, Java DTOs, `bsf-client/docs/battle-engine.md`, `data/game_captures/*.saz`. |
| **#75** | new `bsf-server/docs/database-schema.md` | Per-table sections (columns/types/constraints/indexes + writer fns in `src/db/*.ts` + readers) for `accounts`, legacy `battles` (**flag deprecated-pending-drop**), `ranking`, `battle`, `schema_version`. One Mermaid ER diagram. Header note: will grow when #91/#29 add tables. Sources: `src/db/schema.sql`, `src/db/migrations/00{1,2}_*.sql`, `connection.ts`, `account.ts`/`ranking.ts`/`battles.ts`/`leaderboard.ts`, original MySQL `bsf-refs/server-2013-java/db/game/0/schema.sql`. |
| **#76** | new `bsf-server/docs/database-migrations.md` | Contributor rules: when to add `NNN_*.sql`, numeric ordering, idempotency (`IF NOT EXISTS`/`INSERT OR IGNORE`), the **no `BEGIN`/`COMMIT` inside a migration** rule, `:memory:` testing, the `scripts/copy-migrations.js` build step (+ its `existsSync` guard). Lift from `src/db/migrations.ts` comments and `.claude/rules/db.md`. |

**Tier-1 verify:** #74 — each message cross-checked against one real capture; #75 — every column matches `schema.sql` + migrations; #76 — a fresh agent can add a dummy migration from the doc alone. Trim entries 1–3 from `doc-gaps.md`. → **pause for review.**

---

## PR 2 — P2 tier  `docs/p2-doc-gaps-batch`  ✅ DONE (PR #143)

| Issue | File | Scope |
|---|---|---|
| **#77** | new `bsf-server/docs/error-handling.md` | Table: status code → route + condition → JSON shape → client behavior. Capture the **401-vs-500 distinction** (`HttpCommunicator.as:43–50`: 500 = alive, `>=401 && !=500` = error) and the M3b lobby divergences (404/403/400 guards). Plus try/catch + logging conventions. Sources: `src/index.ts` middleware, `src/services/{auth,battle}/`, `queue.ts`, `auth/discord.ts`. |
| **#78** | new `bsf-server/docs/security.md` | Threat model + enforced boundaries: login rate-limit, 128-bit session keys (#53), OAuth CSRF cookie, SQLi posture (prepared stmts), the `"11"` sentinel, `/debug/*` gating, JWT vs session-key. **End with "what is NOT protected"** citing only the security issues *still open* at write time. **Gate:** confirm which of #18/#19/#52/#32/#95 have landed (Wave 1 merged via PRs #132/#134/#135 — #18/#19/#32 already shipped) and cite only the open ones — keeps the list honest. Sources: `src/index.ts`, `auth/auth.ts`, `auth/discord.ts`, `CHANGELOG.md`, `.claude/rules/gotchas.md`, `CLAUDE.md`. |
| **#79** | new `bsf-server/docs/battle-simulation.md` | Largest item — land **per-section** (turn order → legality → damage → kill conditions → per-turn DJB hash). Server is authoritative: mine `src/services/battle/Battle.ts` + Java `tbs/srv/battle/`; client mirror `engine/battle/sim/` (decompile — `fsm/`+`board/` are in the 12-file stale list). Dual-link `bsf-client/docs/battle-engine.md` for hash mechanics. Each rule cites its implementing code; spot-check one captured battle. |

**Tier-2 verify:** grep-verify each documented (route, status) pair (#77); every #78 claim cites file/line; every #79 rule cites code. Trim entries 4–6 from `doc-gaps.md`. → **pause for review.**

**Outcome (PR #143, merged 2026-07-01):** all three landed and #77/#78/#79 are closed. **The #79 row above is superseded** — the server runs no combat simulation, so `battle-simulation.md` shipped as a short *boundary* doc (recorder/relay + an enforced-vs-deferred table), not the authoritative-simulation writeup the row predicted. See **Progress** for details.

---

## PR 3 — P3 tier  `docs/p3-doc-gaps-batch`  ✅ AUTHORED (pending PR)

| Issue | File | Scope |
|---|---|---|
| **#80 + #48** | new `bsf-server/docs/FAQ.md`; `docs/Development.md` + `CONTRIBUTING.md` cleanup | Consolidate the three drifting gotcha lists (`CONTRIBUTING.md § Common Gotchas`, `.claude/rules/gotchas.md`, `docs/Development.md § Key Gotchas`) into one FAQ (problem → root cause → fix, tagged by area). Source files become **redirect stubs** (keep `.claude/rules/gotchas.md` as a stub — agents need the path). **Fold #48 here:** in `Development.md` fix dead links, replace MySQL refs with SQLite reality (truth = `src/db/schema.sql` + migrations), dedupe vs CONTRIBUTING.md; remove the `CONTRIBUTING.md` `[todo]` line. |
| **#81** | new `bsf-server/docs/observability.md` | Log-prefix table (grep `console.log` prefixes across `src/`: `[BATTLE]`/`[MATCHMAKING]`/`[AUTH]`/`[QUEUE]`/…), runbooks for the 3 known degraded states (orphan battles, stuck queue, long-poll deadlock — seed from the 2026-05-11 perf-audit changelog), placeholder metrics/alerts section. |
| **#82** | new `src/services/battle/README.md`, `src/db/README.md`, **`src/services/README.md`** | ~30–50 lines each: overview, file\|role table, pointers to `docs/`, module gotchas. Seed from `docs/ARCHITECTURE.md`. **Correction:** queue is a single file (`src/services/queue.ts`), not a directory — put its orientation in `src/services/README.md`, not `src/services/queue/README.md` (note this deviation when closing #82). |

**Also in this tier (housekeeping, no separate issue):** correct `.claude/rules/db.md:14` — it names the `accounts` key `steam_id`, but the real column is `user_id TEXT` (already correct in `docs/database-schema.md`). Lands naturally with the #80/#48 `.claude/rules/*` cleanup — a one-line rule-file fix, no runtime impact.

**Tier-3 verify:** Markdown link check on touched files; no orphaned gotcha (diff union of the 3 sources vs FAQ); #81 runbook grep commands match current log output; #82 file\|role tables list every file present. Trim entries 7–9 from `doc-gaps.md`. → final review.

**Outcome (authored 2026-07-01, `docs/p3-doc-gaps-batch`):** all three issues done; link check clean (0 broken links across the 13 touched files). **Deviation from the #80+#48 row:** `.claude/rules/gotchas.md` is **not** a redirect stub — it's a *hybrid*. It keeps the ~11 deep protocol/security/persistence traps in full (because it auto-loads into agent context when editing `src/`), while `FAQ.md` owns the operational gotchas and lists the deep ones as a link-only index. This single-sources every fact without losing the agent auto-load — chosen after the interview flagged that a full stub would strip that inline context. #48's `[todo]` line and MySQL references were already resolved before this batch (verified, not re-done). Also fixed a pre-existing dead link at `CONTRIBUTING.md:570` (missing `misc/` prefix).

---

## End-to-end verification

- **Per doc:** the tier-specific checks above (capture cross-check, column match, grep-verify route/status pairs, log-prefix grep, link check). These are the "tests" in the `bsf-server/CLAUDE.md` After-Completing-Changes flow.
- **Build/test gate:** docs don't touch TS, but the pre-commit hook runs `yarn build && yarn test` — prompt the user to run them locally before each tier's commit and confirm green (per repo shell rules: heavy commands run locally, not via the tool).
- **Markdown link check** across all touched files before each PR (catches dead relative links + broken dual-links).
- **doc-gaps.md hygiene:** after each tier, confirm the closed issues' entries are removed and the remaining table is compact.
- **Close-out:** each issue closed with a comment when its doc lands; `doc-gaps.md` reflects only still-open gaps.

## Out of scope (track separately)

- **#47** — upload the AIR client bundle to a GitHub Release + replace the `[todo]` link. Needs a binary upload + a host-repo decision (likely `BSF-Client` releases); pairs with client #1. Note: `CONTRIBUTING_NEW.MD` referenced in #47's plan is **not in the working tree** — confirm the real `[todo]` location (likely `CONTRIBUTING.md`) before starting.
- **#31** — Wayback CDX enumeration → HTML→Markdown forum archive under a new `forum-archive/`. Pure content work, batchable/interruptible.
