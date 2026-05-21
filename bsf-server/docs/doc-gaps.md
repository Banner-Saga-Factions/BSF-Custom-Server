# Server documentation gaps

## Co-Authored-By: Claude <noreply@anthropic.com>

A tracked inventory of documentation gaps in `bsf-server/`. Each entry lists what's missing, what already exists that the author can draw on, where the new doc should live, and the GitHub issue it's tracked in.

This doc is the **human-readable index**. The actionable units are the linked issues — close issues when the gap is filled, not by editing this file.

## How this list was generated

By auditing `bsf-server/docs/`, `bsf-server/CONTRIBUTING.md`, `bsf-server/CHANGELOG.md`, `.claude/rules/`, and the `Development.md` / `gameFlow.md` / `dataStructures.md` files against the topics a new contributor or an LLM agent realistically needs answers to. Gaps were filtered to "actionable enough that the source material already exists somewhere" — pure wishlist items were dropped.

Companion to the client-side suite at [`bsf-client/docs/`](../../bsf-client/docs/).

## Priority legend

- **P1** — write next. Either a doc is marked WIP and abandoned, or the missing knowledge is required for current-milestone work (M1.5 / M2).
- **P2** — write after P1 is clear. Important for new contributors and for hardening, but not blocking work in flight.
- **P3** — nice to have. Mostly consolidation of existing tribal knowledge into a single discoverable place.

---

## P1 gaps

### 1. Battle-message wire formats — finish `dataStructures.md` WIP

- **Current state.** `bsf-server/docs/dataStructures.md` is marked WIP at the top and has been since 2026-05-07. Several battle messages are present only as stubs or missing entirely: `BattleQueryData`, `BattleSurrenderData`, `BattleFinishedData`, `RenownMessage`, `AchievementProgressData`, `ServerStatusData`, `BattleExitData`.
- **Recommended location.** Finish in place — extend `bsf-server/docs/dataStructures.md` rather than splitting.
- **Scope.** For each missing/stub message: JSON shape with field types, which routes produce/consume it, when it's pushed (POST response vs `/services/game` long-poll), and the corresponding `tbs.srv.battle.data.client.*Data` class in `bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\data\client\`. Same level of detail as the existing `BattleReadyData` / `BattleDeployData` / `BattleSyncData` sections.
- **Source material.**
  - `bsf-server/src/services/battle/Battle.ts` — where each message is produced.
  - `bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\data\client\` — authoritative Java DTOs.
  - `bsf-client\docs\battle-engine.md` — client-side correspondence (newly written).
  - `bsf-server/data/game_captures/` — Fiddler captures with real-world payloads.
- **Priority.** P1 — the client docs ([`battle-engine.md`](../../bsf-client/docs/battle-engine.md)) reference `dataStructures.md` for the JSON shapes; readers will land on a WIP page.
- **Tracking.** [#74](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/74)

### 2. Database schema reference

- **Current state.** No schema reference doc exists. `bsf-server/src/db/schema.sql` is documentation-by-DDL for the legacy `accounts` and `battles` tables, but the newer `ranking`, `battle`, and `schema_version` tables live only in migration files under `src/db/migrations/`. CLAUDE.md mentions both but does not enumerate columns.
- **Recommended location.** New `bsf-server/docs/database-schema.md`.
- **Scope.** One section per table: column list with types, NOT NULL / DEFAULT, primary key, foreign keys, indexes, the writer functions in `src/db/*.ts`, the readers that depend on it. Plus a single ER diagram (textual ASCII or Mermaid).
- **Source material.**
  - `bsf-server/src/db/schema.sql` — `accounts` + legacy `battles`.
  - `bsf-server/src/db/migrations/*.sql` — `ranking`, `battle`, `schema_version`.
  - `bsf-server/src/db/connection.ts` — startup auto-init order.
  - `bsf-server/src/db/account.ts`, `ranking.ts`, `battles.ts` — column-using code.
  - `bsf-refs\server-2013-java\db\game\0\schema.sql` — original MySQL schema 88 as a target column set comparison.
- **Priority.** P1 — newer tables (`ranking`, `battle`) shipped recently and contributors have no place to read about them without grepping migrations.
- **Tracking.** [#75](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/75)

### 3. Migration design guide

- **Current state.** No design doc for the migration system. `src/db/migrations.ts` has implementation comments but no contributor-facing rules about when to add a migration, naming conventions, idempotency requirements, or how to test one. The plan in `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md` flagged a deferred M1.5 cleanup item about migrations opening their own transaction conflicting with the runner's outer transaction; that gotcha has no permanent home today.
- **Recommended location.** New `bsf-server/docs/database-migrations.md`.
- **Scope.** When to add a `NNN_*.sql` file, the numeric ordering rule, idempotency expectations (the runner uses `schema_version` to skip already-applied migrations but the migration SQL itself should still be `CREATE TABLE IF NOT EXISTS` / `INSERT OR IGNORE`-style), the "do not `BEGIN`/`COMMIT` inside a migration" rule, how `:memory:` testing works, and the `scripts/copy-migrations.js` build step that copies SQL into `build/db/migrations/`.
- **Source material.**
  - `bsf-server/src/db/migrations.ts` — runner implementation.
  - `bsf-server/src/db/migrations/*.sql` — example migrations.
  - `bsf-server/scripts/copy-migrations.js` — build copy step.
  - `bsf-server/.claude/rules/db.md` — the "no BEGIN/COMMIT inside a migration" rule (added in M1.5).
- **Priority.** P1 — M1.5 + M2 + M3a all add migrations; a wrong migration in any of them could break startup for everyone.
- **Tracking.** [#76](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/76)

---

## P2 gaps

### 4. Error-code reference

- **Current state.** HTTP error semantics are scattered across `src/index.ts` (the session-key middleware returning 403), individual route handlers (most return 400 on bad input, some return 500 on DB write failures), and the Discord OAuth code path (501 today for the unwired `/login/discord/session`). The client treats 500 as alive and `>= 401 && != 500` as error (`HttpCommunicator.as:43–50` — see [`bsf-client/docs/wire-protocol.md`](../../bsf-client/docs/wire-protocol.md#long-poll-mechanics)). No central reference says when which code fires.
- **Recommended location.** New `bsf-server/docs/error-handling.md`.
- **Scope.** Table of HTTP status codes the server emits, which route + condition fires each, the JSON shape the client sees, and the client-side handler's behavior (the 401-vs-500 distinction matters). Plus the conventions for `try/catch` in route handlers and what gets logged.
- **Source material.**
  - `bsf-server/src/index.ts` — session-key middleware (`/services/auth/login/11` sentinel, `/services/session/steam/overlay/...` allowlist, 403 fallthrough).
  - `bsf-server/src/services/auth/`, `services/battle/`, `services/queue.ts` — per-route error branches.
  - `bsf-server/src/services/auth/discord.ts` — OAuth error codes.
  - `bsf-client/docs/wire-protocol.md` → "Long-poll mechanics" — client-side rules.
- **Priority.** P2 — useful for debugging client-server interaction issues.
- **Tracking.** [#77](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/77)

### 5. Security boundaries

- **Current state.** Several security-relevant facts are documented as bullets in different places — `.claude/rules/gotchas.md`, `bsf-server/CLAUDE.md`, the M1.5 phase changelog — but no single doc explains the threat model and the boundaries the server currently enforces.
- **Recommended location.** New `bsf-server/docs/security.md`.
- **Scope.** Login rate-limit (5/min/IP — already shipped), session key entropy (32 hex chars / 128 bits since 2026-05-08; issue #53), CSRF posture on Discord OAuth (the `bsf_oauth_state` HttpOnly cookie), SQL-injection posture (prepared statements via `node:sqlite`, no string concatenation), the hardcoded `"11"` login sentinel and what it actually allows, `/debug/*` gating + the loud warning when it's exposed (commit `7ca6c1d`), JWT vs session-key model. End with "what is **not** protected today" so contributors know where the boundary actually is.
- **Source material.**
  - `bsf-server/src/index.ts` — middleware order, rate-limit.
  - `bsf-server/src/services/auth/auth.ts` — session-key generation.
  - `bsf-server/src/services/auth/discord.ts` — OAuth state cookie.
  - `bsf-server/CHANGELOG.md` — security-flavored entries.
  - `.claude/rules/gotchas.md` — `"11"` sentinel, session-key width.
  - `bsf-server/CLAUDE.md` — JWT_SECRET fail-fast.
- **Priority.** P2 — important for contributors adding new public routes.
- **Tracking.** [#78](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/78)

### 6. Battle simulation rules

- **Current state.** `bsf-server/docs/gameFlow.md` covers the battle **lifecycle** (route order, when each message fires) but not the **simulation rules** (turn order computation, move legality, ability resolution, damage formula). Today these rules exist only in `src/services/battle/Battle.ts` and friends. The client has a mirror in `engine/battle/sim/` for legality checks, but the server is authoritative.
- **Recommended location.** New `bsf-server/docs/battle-simulation.md`.
- **Scope.** Turn-order computation (who goes first, alternation rules with party-size imbalance), move legality (range, blocked tiles), action legality (ability targeting rules), damage resolution (strength vs armor, willpower exertion, shield bonuses), kill conditions, the per-turn DJB hash and what's hashed. Cross-link to [`bsf-client/docs/battle-engine.md`](../../bsf-client/docs/battle-engine.md) for the client-side hash mechanics.
- **Source material.**
  - `bsf-server/src/services/battle/Battle.ts` — server-side battle state.
  - `bsf-server/src/services/battle/` — turn handling.
  - `bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\` — authoritative original logic.
  - `bsf-refs\client-decompiled-as3\engine\battle\sim\` — client mirror.
  - `bsf-client/docs/battle-engine.md` — client-side FSM + hash.
- **Priority.** P2 — needed for anyone debugging battle desyncs or porting M1.5+ features.
- **Tracking.** [#79](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/79)

---

## P3 gaps

### 7. FAQ / troubleshooting

- **Current state.** Gotchas and FAQ-style notes are spread across at least three places: `bsf-server/CONTRIBUTING.md § Common Gotchas`, `.claude/rules/gotchas.md`, and `bsf-server/docs/Development.md § Key Gotchas`. There is duplication, drift, and no single place a new contributor lands.
- **Recommended location.** New `bsf-server/docs/FAQ.md`.
- **Scope.** Consolidate the three lists. Each entry: one-line problem statement → root cause → fix. Tag entries by area (DB, sessions, battle, deployment). Keep the existing source files as redirect stubs that link to the FAQ.
- **Source material.**
  - `bsf-server/CONTRIBUTING.md` § Common Gotchas.
  - `.claude/rules/gotchas.md`.
  - `bsf-server/docs/Development.md` § Key Gotchas.
- **Priority.** P3 — consolidation work; nothing is broken without it.
- **Tracking.** [#80](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/80)

### 8. Observability runbook

- **Current state.** Log-prefix conventions exist (`[BATTLE]`, `[MATCHMAKING]`, `[AUTH]`, `[QUEUE]`, etc. — visible in any console output) but there is no doc for them and no metrics / alerts / dashboards. The 2026-05-11 perf audit (commit `94d7eea`) identified an orphan-battle leak partly because nobody knew which log channel to grep.
- **Recommended location.** New `bsf-server/docs/observability.md`.
- **Scope.** Log-prefix conventions table (one row per prefix, with example lines and what to grep for). The (currently empty) metrics + alert section as a placeholder for future work. Runbooks for the three known degraded states: orphan battles, stuck queue, long-poll deadlock.
- **Source material.**
  - `bsf-server/src/` — grep for `console.log` prefixes.
  - `bsf-server/CHANGELOG.md` 2026-05-11 entries.
  - The perf audit memory (`project_perf_audit_2026_05_11.md`) — orphan-battle leak punch list.
- **Priority.** P3 — useful for ops; not blocking new features.
- **Tracking.** [#81](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/81)

### 9. Module READMEs under `src/services/`

- **Current state.** No `README.md` lives inside any subdirectory of `src/`. Module-level orientation (what's in `src/services/battle/` vs `src/services/queue/` vs `src/db/`) is implicit — readers infer it from file names.
- **Recommended location.** Three new files: `bsf-server/src/services/battle/README.md`, `bsf-server/src/services/queue/README.md`, `bsf-server/src/db/README.md`.
- **Scope.** Each README is ~30–50 lines. Per directory: a 2–3 sentence overview, a file-by-file table (`file | role`), pointers to the relevant `docs/` files for deeper material, gotchas specific to that module.
- **Source material.**
  - The directory contents themselves.
  - `bsf-server/docs/ARCHITECTURE.md` — already has per-module prose to seed from.
- **Priority.** P3 — small docs; mostly orientation aid for new contributors browsing the tree.
- **Tracking.** [#82](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/82)

---

## What is **not** in this list

Gaps that were considered and rejected — recorded here so they don't keep getting re-raised:

- **A protocol overview / "how the wire works" 101 doc.** Already covered by [`bsf-server/docs/ARCHITECTURE.md`](./ARCHITECTURE.md) → "Endpoint Transport Map" + [`protocol-cross-reference.md`](./protocol-cross-reference.md) + [`bsf-client/docs/wire-protocol.md`](../../bsf-client/docs/wire-protocol.md). The cross-link triad is sufficient.
- **CI / deployment guide.** [`bsf-server/docs/Deployment.md`](./Deployment.md) exists and is current.
- **A history / changelog page.** [`bsf-server/CHANGELOG.md`](../CHANGELOG.md) is the single source of truth; [`bsf-server/docs/HISTORY.md`](./HISTORY.md) covers older context.
- **API reference.** [`serverEndpoints.md`](./serverEndpoints.md) is comprehensive for request/response shapes.
- **Frontend / client docs.** Tracked separately under [`bsf-client/docs/`](../../bsf-client/docs/).

---

## Working with this file

When you close a gap:

1. Land the new doc.
2. Edit this file to **remove** the entry (not strike-through it). Keep the table compact.
3. Comment + close the corresponding GitHub issue.

When you add a new gap:

1. Open a GitHub issue first (`gh issue create --label documentation --label P1/P2/P3`).
2. Add an entry to this file referencing the issue URL.
3. Source material citations are mandatory — if no existing artifact informs the gap, it's not actionable enough yet.
