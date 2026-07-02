> **SUPERSEDED** by [`../Plan-Master-Roadmap.md`](../Plan-Master-Roadmap.md) (2026-07-02) — the single live roadmap. Retained as history (Waves 0–2 shipped); its cross-dependency table is folded into the master's cross-cutting checklist.

# Issue Triage & Ordering Plan — 2026-06-10

## status
 **Wave 2 COMPLETE 2026-06-18.** Chat 4 (#25 Discord snowflake precision) DONE on `fix/discord-snowflake-precision-25` — exact Discord ID kept as a string end-to-end, `steam_id_str`→`external_id_str`, `parseInt` precision-reject removed. (Chat 3 #84 DONE 2026-06-18 — DB-driven leaderboards, commit f5e3263; post-battle chat-line split to #137.) Remaining identity work is outside Wave 2: #29 (registration) and client #2 (Discord token auth).


> **Update 2026-06-11:** Spearman is being treated as **new-feature work and postponed** — the whole spearman cluster (#101, #112, #113, #115, #116, #117, including the two P0 freezes) and the promotion-variant follow-ups (#98, #72, #119) drop out of the active waves. **#99** (KILLS never increments) is *kept* active: it's a standalone endgame-path bug, independent of the promotion feature. The revised sequence is in [Recommended work order](#recommended-work-order) below. Also: **#118 closed** (2026-06-10, commit `c6b422b`), so its `Plan-Fix-Issue-118-*.md` is a completed artifact and the open-issue count is now 49. This plan supersedes the older `Plan-Triage-GitHub-Issues.md`.

> **Update 2026-06-12:** **Wave 0 shipped.** All 12 quick-wins are closed — PRs #126 (#27/#32/#39), #127 (#34/#35/#36/#51), #129 (#44/#45, `.gitattributes`), plus #128 (test-hook reliability) and #130 (the `_debugWeakUnits` / `/debug/weak-units` cleanup found in review). Five of the 12 were already implemented and got verification + regression tests rather than new fixes (#23, #26, #33, #44, #45). Open `BSF-Custom-Server` issues now stand at **38** (2026-06-12). **Next: Wave 1** — #18+#19+#52 (`/killed` hardening), #95 (retire minting), #99 (per-unit KILLS).

Scope: all open issues as of 2026-06-10 — 49 in `BSF-Custom-Server` (was 50; #118 closed the same day), 5 in `BSF-Client` (client issue comments were not retrievable during triage; plans for client issues are based on issue bodies only).

Per-issue fix plans: `Plan-Fix-Issue-<number>-<slug>.md` in this directory. Summary table: [`Plan-Issue-Triage-Index-2026-06-10.md`](./Plan-Issue-Triage-Index-2026-06-10.md). (Note: the BSF-Client issues #1–#4 and #7 use plain `Plan-Fix-Issue-<n>-*.md` filenames with **no** `client-` prefix — tell them apart by number, since BSF-Custom-Server issues start at #13.)

## Clusters

Issues group into natural units of work (most confirmed by existing maintainer comments on the issues):

1. **`/killed` route hardening** — #18, #19, #52. Same handler (`Battle.ts` `/killed` → `endgame()`), same data flow. Ship as one PR.
2. **Endgame finalization correctness** — #43 → #41 → #84. All touch the `Promise.all().then()` block at the end of `endgame()`. #43 restructures it, #41 adds cleanup inside it, #84 adds the Elo push after it. Sequential, one author.
3. **Promotion / color variants** — #99 (root blocker: KILLS never increments, promotion gate unreachable) → #98 (grant variation unlocks + variation route) → #72 / #119 (variant glitches & persistence — likely the same root cause, diagnose after #98 lands).
4. **Spearman PoC** — #101 (registry/whitelist root) plus downstream #113 (malformed cloned ability), #116/#117 (P0 freezes), #112/#115 (portraits — possibly same cause). Shared plan doc already exists: `plan-spearman-ability-range-portraits.md`.
5. **Docs series (doc-gaps inventory)** — #74–#82, ordered P1 (#74, #75, #76) → P2 (#77, #78, #79) → P3 (#80, #81, #82). Fully parallelizable with all code work.
6. **Auth/identity** — #25 (Discord ID precision) and #34 (steam_id_str) touch the same Session identity fields; #29 (registration) builds on the same account model; client #2 (Discord OAuth stub) consumes the server side.
7. **Client mobile patches** — client #3 → #2 → #4 (explicit dependency chain stated in the issues); client #1 standalone; client #7 awaits a SWF rebuild cycle.
8. **Independent quick wins** — #23, #26, #27, #32, #33, #35, #36, #44, #45, #51, plus #39. No interdependencies; safe rainy-day work.

## Dependency graph

```
#113 (fix cloned ability) ──► #116/#117 (P0 freezes — retest after #113)
#101 (registry root) ──────► #112/#115 (portraits), and gates spearman in #62 Phase 2c
#99 (KILLS) ───────────────► promotion gate works ──► #98 ──► #72/#119 diagnosis
#43 (endgame .then) ──────► #41 (prune turns) ──► #84 (Elo push)
#18 + #19 + #52 ───────────  one PR (no external deps)
#25 (string IDs) ──────────► client #2 (Discord token auth)  [recommended order, not hard]
client #3 (bsf://) ────────► client #2 (OAuth callback) ──► client #4 (mobile ANEs)
#91 (friends list) ────────► #17 (internet match E2E test benefits from invite flow)
#13 (CI) ──────────────────► everything merges more safely afterward
#62 Phase 1 ───────────────  independent; Phase 2c blocked by #101; Phase 3 blocked by AMF3 spike
#29 (registration) ────────  independent of #25 but shares game_id design with crossplay plan
```

Everything not listed is independent and parallelizable.

## Recommended work order

**Wave 0 — ✅ DONE 2026-06-12 (PRs #126–#130)** — same-day quick wins (parallel, any order)
#27 (.dockerignore — security, 2 lines), #26, #36, #45, #44, #51, #34, #35, #23, #33, #32, #39.

**Wave 1 — P1 fires** _(spearman P0s #116/#117 postponed as new-feature work — see 2026-06-11 update)_
1. #18 + #19 + #52 as one PR — `/killed` hardening (P1 security ×2 + crash).
2. #95 — renown minting on retire (P1 security, server-only).
3. #99 — per-unit KILLS never increments (standalone endgame-path bug; the promotion *feature* follow-ups #98/#72/#119 stay postponed, but this underlying bug is independent of them).

(#13 CI workflow runs in parallel/background, **not** as a Wave 1 gate: a pre-commit hook already runs `yarn build && yarn test` locally, so CI is PR-time hardening rather than a blocker for these fixes.)

**Wave 2 — correctness chains**
4. #43 → #41 → #84 (endgame finalization, sequential). Checklist for #43: decide the `saveBattleResult` drop, and preserve the M1 `Promise.allSettled` for ranking reads.
5. #25 — ✅ DONE 2026-06-18 (`fix/discord-snowflake-precision-25`): exact Discord ID kept as a string end-to-end, `Session.steam_id_str`→`external_id_str`, 32-bit `account_id` via `BigInt(id) & 0x3fffffff`, `parseInt` reject removed. (#34 was already closed in Wave 0/#127, so #25 didn't need to.)

**Wave 3 — features (most postponed with spearman)**
6. #91 friends list (unblocks in-game lobby E2E and #17) — the one feature item kept active, since it unblocks manual 2-player testing.
7. *Postponed (new-feature work):* spearman cluster #101 → #112/#115 (plus P0 freezes #113/#116/#117), promotion variants #98 → #72/#119, and #29 registration / #30 battle event log / #38 router refactor / #62 unit tiers. Revisit once the security/correctness backlog above is clear.

**Client track (parallel)**
client #1 (docs-only) → client #3 → client #2 → client #4; client #7 whenever a SWF rebuild cycle is scheduled (pairs naturally with the #113 TBSDecompiler work).

**Docs track (parallel)**
#74 → #75 → #76 → #77 → #78 → #79 → #80 → #81 → #82; #47, #48, #31 anytime. Note: `docs/doc-gaps.md` referenced by #74–#82 lives on the `client-documentation-and-server-gaps` branch — merge or cherry-pick it to `main` as part of the first docs PR.

**Process (background)**
#14 (review workflow), #17 (after #91 + client #1).

## Cross-dependencies with `Plan-Integrate-Original-Stoic-Server.md` (remaining work)

M0–M3b have shipped; the remaining milestones and deferred items interact with the open issues as follows:

| Integration-plan item | Status | Related open issues | Interaction |
|---|---|---|---|
| **M1.6 — Elo-on-screen** | ✅ Done 2026-06-18 (#84) | — | Resolved via DB-driven `/game/leaderboards` (real players merged into the preserved `lboard.json` baseline), NOT a post-battle wire push — investigation found the 2013 server never surfaced post-battle Elo in-client. Post-battle chat-line surface split to #137. |
| **M1 follow-up — drop legacy `battles` table + `saveBattleResult()`** | Pending | #43, #41 | Both fix plans touch the endgame `Promise.all` block that still references `saveBattleResult`. Decide the drop before/with #43 so the restructured `.then()` isn't built around dead code. Note: M1 review already replaced `Promise.all` with `Promise.allSettled` for ranking reads — #43's fix must preserve that. |
| **M1.5 deferred award types — DAILY / BOOST / FRIEND** | Deferred indefinitely | #91, #98 | FRIEND needs a friend-battle-record table — design #91's `friends` migration with that future consumer in mind. BOOST needs an unlocks table — #98 currently grants unlocks via `acc.json`/account-info merge; if #98 instead lands a real `unlocks` table, BOOST's prerequisite falls out for free. Worth deciding in #98's PR. |
| **M3b out-of-scope — `notifyVariation` / VARIATION lobby event** | Not started | #98, #119, #72 | The Java lobby protocol broadcasts unit-variation changes to lobby members. When #98 implements the `unit/variation` route, check `LobbySvc`/`LobbySystem` for the VARIATION push and decide whether to port it in the same PR (cheap while the Java reference is open) or file a follow-up. |
| **M3b out-of-scope — lobby chat rooms** | Not started | — | No open issue tracks this; file one if wanted. |
| **M4 — surrender + stats reset** | Likely verification-only (routes already exist per 2026-05-17 status note) | #18/#19/#52 | `/surrender` reaches `finalizeSurrender()` → endgame path; the `/killed` hardening PR should include surrender-path regression tests, effectively completing M4's verification. |
| **M5 — system messages + admin** | Not started | #30, #81 | Independent; #81's observability runbook should document the admin surface when M5 lands. |
| **M6 — battle replay capture** | Not started | #30, #41 | Overlapping goals: M6 wants replays persisted to the `battle` table for a parity-test harness; #30 wants JSONL event logs. Implement #30's event emission so M6 can reuse it (same event stream, different sink) — and note #41 clears `battle.turns` at endgame, so M6 must capture from the stream, not from `turns`. |
| **M7+ — tournaments, friends, leaderboards, IAP** | Not started | #91, #26, #98, #62 | #91 is the friends groundwork; #26 keeps the static leaderboard file for now (M7+ replaces it with `ranking`-table-driven data — keep #26's cache trivially removable); #98/#62 are the de-facto IAP/shop direction. |

**Sequencing impact:** none of the wave ordering changes, but three PRs gain a small extra checklist item: #43 (decide `saveBattleResult` drop, preserve `allSettled`), #91 (friends schema anticipates FRIEND award), #98 (unlocks-table decision + VARIATION event check).
**docs cleanup** when issue is fixed, attach 'Plan-Fix-Issue-*.md' file to gh issue and delete file from /misc