> **SUPERSEDED** by [`../Plan-Master-Roadmap.md`](../Plan-Master-Roadmap.md) (2026-07-02) — the single live roadmap. Its consolidated findings are filed as issues #144/#145/#146/#140; retained for the detailed per-PR review notes.

# BSF Server — PR #134–139 Review & Waves Roadmap to 2013 Parity

_Date: 2026-06-19 · Companion to `Plan-Issue-Triage-2026-06-10.md`._

## Status & how to pick this up (new-chat handoff)
This doc is the output of a retrospective review of the five most-recent merged PRs (#134, #135, #136, #138, #139 — note `#137` is an *issue*, not a PR) plus an architecture assessment, turned into ordered work **waves**. **No code wave (W0–W5) is implemented yet** — but a parallel *documentation* track has since run (docs #77/#78 etc.; 4 commits on `docs/p2-doc-gaps-batch`), and several waves below are now superseded by dedicated per-issue plans. **See the [Review update (2026-06-30)](#review-update-2026-06-30) section before picking this up.**

**To resume:** start at **Wave 0**, one branch per wave (or per sub-item for the larger parity waves) off an **updated `main`** (`git switch main && git pull` — `main` was 9 behind `origin/main` at authoring time). File the consolidated findings as issues as each wave starts (the #135 retire race first — it was closed-but-unresolved).

---

## Review update (2026-06-30)

_Second-pass review, 11 days on. Every Part-1 code claim was re-verified against current code: **11 of 12 still hold** (line numbers shifted — notably `leaderboard.ts` moved into `src/db/`). Where this section conflicts with the original waves below, this section wins._

**Withdrawn finding.** The `auth.ts:158` "stale comment contradicts the 30s reaper" item (Part 1 #136 / W1.4) is a **false positive** — there is no 30-second reaper (`SESSION_TTL_MS` = 30 **minutes**; the only "30s" is a commented-out test value), and the cited comment is accurate. Removed from #136 and W1.4.

**Security framing.** Anti-cheat #18/#19/#32 shipped (still true), but security is **not** zero-gap: **#140 (Discord Snowflake collision) is open**, as are the W1.3 input-validation guards. W1.1 also **under-scopes #140** — evicting by `external_id_str` stops session-stealing, but two Snowflakes sharing their low 30 bits still collapse to one 30-bit `account_id`, which is the **primary key of `ranking`**, so their ratings would collide too. Negligible at current scale, but "evict by `external_id_str`" is a *partial* fix.

**Recommended execution order** (the waves below are unchanged; this is just the suggested sequence): **(1)** concurrent-retire race [High, bounded] → **(2)** #140 evict-by-`external_id_str` → **(3)** input-validation guards → **(4)** color-variant cluster #72 (READY, highest player value) → **(5)** `ranking(tourney_id)` index → **(6)** friends #91 → **(7)** vitest flake (fill-in — Windows-local only; CI is Ubuntu) → **(8)** endgame extraction → **(9)** speculative parity (tourney/admin/replay/IAP). This orders by severity + player-value + readiness; the original Wave order optimizes "fastest foundation first" — either is defensible.

**Reconciliation index — items now owned by dedicated issues/plans (authoritative; do not re-spec here):**

| Roadmap item | Now tracked by | Status |
|---|---|---|
| W1.1 evict by `external_id_str` | **#140** | OPEN — filed after this doc; under-scoped here (above) |
| W1.2 concurrent-retire race | **#144** | #95 (hire-cost mint) is CLOSED; the race is distinct — **filed 2026-06-30** |
| W3.1 friends | **#91** / `Plan-Fix-Issue-91-friends-list.md` | OPEN |
| W4.1 color variants | **#72/#98/#119** / `Plan-Fix-Issue-72-promotion-color-glitch.md` | OPEN, READY |
| W5.1 battle replay | **#30** / `Plan-Fix-Issue-30-battle-event-log.md` | OPEN |
| store/economy (Part 2) | **#62** / `Plan-Fix-Issue-62-shop-unit-tiers.md` | OPEN |
| W2 neighbor (`app._router.handle()`) | **#38** | OPEN |
| W0.2 #75 schema-ref / W1.4 doc hygiene | docs track **#75–#82** | in progress on `docs/p2-doc-gaps-batch` |

**Not covered by this roadmap** (its Part 2 parity inventory is no longer exhaustive): the **spearman cluster** (#101/#112/#113/#115/#116/#117) and the **client/URL-scheme cluster** (#1/#2/#3/#4/#7, in the bsf-client repo).

**Consolidated findings — now filed (2026-06-30):** concurrent-retire race → **#144**; `ranking(tourney_id)` index (+ dead-`battles` drop) → **#145**; `account_id` derivation centralization → **#146**. **Caution on #146:** the `Number` math in `leaderboard.ts:28-32` is *deliberate and load-bearing* (it must match `auth.ts` and the client's 32-bit entity-string hashing) — centralize it, but preserve the exact arithmetic; do **not** convert it to `BigInt`.

---

## Context
Goal: rebuild the Factions server to **2013 feature parity** with the original Stoic live service (ref `%USERPROFILE%\Code\bsf-refs\server-2013-java`). Waves are weighted toward **maintainability / single-dev risk**, **security & correctness**, and **test/CI reliability**.

Two assumptions were corrected during review and **verified against code/issues**:
- **Security is already a strength, not a gap** — anti-cheat/session tickets **#18, #19, #32 are CLOSED/shipped**.
- **The vitest flake is Windows-local dev friction, not a CI blocker** — **CI runs on `ubuntu-latest`** (`.github/workflows/ci.yml:10,13`).

The server is **~90% route-parity**; the real maintainability hotspot is **`Battle.ts` (969 lines, verified)**.

---

## Part 1 — PR Review (retrospective; all merged, so findings are follow-ups)

**#134 — per-unit kill tally → promotion (#99).** Sound; mutual-killer-confirmation closes the lone-client kill-funnel exploit, double-counting provably prevented, strong tests.
- `[Low]` `Battle.ts:563,268` — client `killer`/`entity` strings used directly as map keys (theoretical proto-pollution / unbounded keys; contained). Guard at `/killed`.
- `[Low]` `Battle.ts:558` — `reporterPartyIndex===undefined` → `1<<undefined===1` aliases party 0 (inherited from #132). Add `if (reporterPartyIndex==null) return`.

**#135 — stop retire/dismiss refunding hire cost (#95).** Core fix mint-proof; good coverage.
- `[High]` `roster.ts:121-142` — **concurrent-retire double-refund race**: guard precedes the `await`, no re-check; two scripted `/unit/retire` both refund + resurrect the unit. **#95 named it but it shipped unresolved — re-file as a standalone issue.**
- `[Medium]` `roster.ts:72,310` — `/unit/promote` sets `entityClass` with no catalog validation while `/unit/stats/reset` keys on it → stat-block swap. Validate `class_id`.

**#136 — free `turns` after match + drop dead results writer (#41/#43).** Genuinely closes the leak on win/forfeit/surrender/disconnect; no use-after-free; removal verified zero-caller.
- `[Low]` `Battle.ts:921,967` — `turns=[]` skipped on a synchronous throw before the write chain (≤30s leak). Move free to `.finally`.
- ~~`[Low]` `auth.ts:158` — stale comment contradicts the 30s reaper.~~ **Withdrawn 2026-06-30 (false positive)** — there is no 30s reaper (`SESSION_TTL_MS` = 30 min; the only "30s" is a commented-out test value), and the cited comment is accurate.

**#138 — DB-driven leaderboards (#84).** Solid: **no PII leak, no SQL injection** (parameterized; only public `username`).
- `[Medium]` `leaderboard.ts:455-468` — full `ranking` read + in-memory sort per request, no `LIMIT`; **verified no `ranking(tourney_id)` index**. Add index; consider short per-tourney memo.
- `[Low]` `leaderboard.ts:456` — `Player ${account_id}` placeholder leaks internal id on a public board. Use a neutral placeholder.
- `[Low]` `leaderboard.ts:289` — `Number`-based `accountIdFromUserId` mis-keys ids >2^53 (consolidation #1).

**#139 — Discord snowflake precision, `steam_id_str`→`external_id_str` (#25).** Solid: Snowflake stays a string with a lossless `BigInt` mask — **no precision loss, no account-takeover**.
- `[Medium]` `discord.ts:177`/`auth.ts:185` — session eviction keys off the **masked 30-bit** id, not the Snowflake; two users sharing low bits evict each other's session. Evict by `external_id_str`.
- `[Low]` `discord.ts:136,166` — `^\d{1,20}$` accepts `"0"` → `account_id=0`. Tighten / reject `<=0`.
- `[Low]` `discord.ts:175` — in-game 32-bit `account_id` namespace overlaps Steam's mapping (consolidation #1).
- **Docs straggler:** `misc/Plan-Enable-Mobile-Windows-Crossplay.md` (102/113/129) still `steam_id_str`; `.claude/rules/db.md` describes a non-existent `steam_id` column (real: `user_id TEXT`).

### Consolidated cross-PR findings (the source of Wave 1)
1. **Lossy, duplicated 32-bit `account_id` derivation** across `auth.ts`/`discord.ts`/`leaderboard.ts` → session-eviction collisions (#139) + name-lookup misses (#138). Centralize + evict by `external_id_str`.
2. **DB schema dual-truth + missing index** — `schema.sql:19` legacy `battles` vs `migration 001` live `battle`; no `ranking(tourney_id)` index.
3. **Concurrent-retire double-refund race** (#135) — re-file + fix.
4. **Input-validation guards** (#134, #139 `"0"`/`reporterPartyIndex`).
5. **Stale comments/docs** (`auth.ts:158`, `db.md`, crossplay plan).

---

## Part 2 — Architecture & Parity Gaps
**Current state:** single-process Express/TS; 1 session-key middleware → 8 routers; long-poll + `EventEmitter`; `node:sqlite` (WAL) + migration runner; milestones M0–M3b shipped. Maintainability moderate (one hotspot: `Battle.ts`). Security strong. Tests ~296, green on Ubuntu CI.

**Parity gaps vs `*Svc.java`:** store/economy + IAP (**L**; store now #62 / `Plan-Fix-Issue-62-shop-unit-tiers.md`); color variants `unit/variation` #72/#98/#119 (**M–L**); friends list hardcoded `[]` #91, blocks lobby Invite (**M**); `tourney/join` (**M**); `AdminSvc` 4 paths + `SystemMsgSystem` (**S–M**); battle replay #30/M6 (**M–L**); schema hygiene (**S**). **Banked correction:** original persists JSON blobs keyed by `user_id`; `roster_json`/`party_ids_json` already match — the integration plan's "normalize into a `unit_party` table" is **not needed for parity**.

---

## Part 3 — Work Waves

Each wave is an independently shippable batch (1 branch/PR unless noted), ordered to **de-risk single-dev first, then build parity from highest leverage down**.

### Wave 0 — Foundation / unblock daily work · _S, fast_
- **W0.1 Kill the Windows vitest flake at the root** — `vitest.config.ts`: prototype `pool:"threads"` (or split DB tests via the existing `test:db`); confirm `node:sqlite` tests survive a few hundred runs. _Lens: test/CI._ **Done when:** local pre-commit is green without `--no-verify`.
- **W0.2 Schema-truth + index** — new `src/db/migrations/003_*.sql`: drop the dead `battles` table + `idx_winner/idx_loser`; add `idx_ranking_tourney ON ranking(tourney_id)`; make `src/db/schema.sql` generated-from-migrations or replace it with a #75 schema-reference pointing at `migrations/` as truth. _Lens: maintainability/correctness; folds #138 index + consolidation #2._ **Done when:** one schema source; `EXPLAIN QUERY PLAN` shows the leaderboard query hits the index.

### Wave 1 — PR-review correctness & security follow-ups · _S–M_
- **W1.1 Centralize + harden `account_id` derivation** — one exported helper imported by `auth.ts`/`discord.ts`/`leaderboard.ts`; **evict sessions by `external_id_str`**; tighten the Discord id validator (reject `"0"`/`<=0`). _Consolidation #1._ **→ the evict-by-`external_id_str` half is now #140 (under-scoped here — the collision also hits `ranking` PKs; see Review update). When centralizing, preserve the exact `Number` arithmetic in `leaderboard.ts:28-32` — it is load-bearing, not a bug to "fix" to `BigInt`.**
- **W1.2 Fix concurrent-retire double-refund race** — `roster.ts:121-142` (re-find after await + 404, or `EXISTS` guard, or per-session lock) + regression test; **re-file the #95 sub-item as its own issue.** _Consolidation #3._
- **W1.3 Input-validation guards** — `killer`/`entity` keys (`Battle.ts:563,268`); `reporterPartyIndex==null` (`Battle.ts:558`). _#134._
- **W1.4 Doc/comment hygiene** — `.claude/rules/db.md` (`steam_id` column → `user_id TEXT`); `Plan-Enable-Mobile-Windows-Crossplay.md` `steam_id_str`→`external_id_str`. _#139 stragglers (the `auth.ts:158` item was withdrawn 2026-06-30 — false positive). Overlaps docs track #75–#82; coordinate (`.claude/rules/` sits outside `docs/`)._

### Wave 2 — Maintainability refactor · _M_
- **W2.1 Extract `endgame()` from `Battle.ts`** into `endgame.ts` behind `Battle.endgame.test.ts`; move `turns=[]` to `.finally`; add a surrender-path lifecycle test. **Refactor-only — do not touch the `endgameStarted` guard or the DB-then-pushData write ordering.** _Architect item 3 + #136; the 969-line hotspot._

### Wave 3 — Parity: unlock shipped features + ops · _M_
- **W3.1 Friends-list bootstrap (#91)** — replace hardcoded `friends:[]` in `data/first.json` with a minimal source + add-friend route; **verify the client `URLLoader` shape first.** Unlocks the already-shipped lobby/Invite (M3b). **→ now tracked by `Plan-Fix-Issue-91-friends-list.md` (authoritative).**
- **W3.2 Admin + system messages** — port the 4 `AdminSvc` sub-paths + in-process `SystemMsgSystem`→`Session.pushData`, gated on a new `BSF_ADMIN_KEY`. Gives broadcast/peek_q/status ops control.

### Wave 4 — Parity: player-visible content · _M / M–L_
- **W4.1 Color variants `unit/variation`** (#72/#98/#119) — port `UnitVariationSvc.java` + persistence for post-promotion colors. Biggest player-visible gap. **→ now tracked by `Plan-Fix-Issue-72-promotion-color-glitch.md` (unified #72/#98/#119, marked READY). Consider pulling forward — see Review update.**
- **W4.2 `tourney/join`** — port `TourneyJoinSvc.java` (`tourney_id` already flows through queue/battle).

### Wave 5 — Parity: heavy / long-tail · _L / M_
- **W5.1 Battle replay capture (M6/#30)** — persist `BattleReplayData` to the `battle` table; build a replay-driven state-hash parity harness (strongest long-term correctness signal). **→ overlaps `Plan-Fix-Issue-30-battle-event-log.md` (#30).**
- **W5.2 IAP read-only shapes** — port init/info; leave `finalize` disabled (no real Steam txn).

---

## Verification & housekeeping
- **Per wave:** add/extend tests under `src/**`; run `yarn test` locally (heavy runs are local, per project convention); for battle/endgame changes, an end-to-end run via the existing local-2-client flow.
- **Issues:** file the consolidated findings as issues as each wave starts (#135 race first). Optional project memory worth saving: `.claude/rules/db.md` describes a non-existent `steam_id` column — a recurring review trap.
- **Branching:** one branch per wave (or per sub-item for the larger parity waves) off an updated `main`.
