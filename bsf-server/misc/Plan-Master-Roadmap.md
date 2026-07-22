# BSF Server — Master Roadmap

_The single live plan to follow (created 2026-07-02). It reconciles three older, overlapping plans — now archived in the maintainer's local history — into one ordered backlog. When this doc and an archived plan disagree, **this doc wins.**_

## How to use this doc

- **Pick the next item from the phase order below.** Each backlog row names its GitHub issue and, where one exists, a companion plan file — that issue/plan is the spec.
- **One branch per item, off an updated `main`** (repo convention). Each item is its own explain-then-`y` approval cycle per [`../CLAUDE.md`](../CLAUDE.md) working style.
- **Keep it current:** when an issue closes, strike its row; when a new issue is filed, add one. This doc tracks *ordering and dependencies* — it does not restate each item's spec (that lives on the issue).

## Context — why this exists

Three server plans had accumulated and drifted, marking shipped work as "todo" and disagreeing on order:

- **`Plan-Integrate-Original-Stoic-Server.md`** — port 2013 Stoic features to parity. Milestones **M0–M3b shipped**.
- **`Plan-Issue-Triage-2026-06-10.md`** — ordered issue backlog. **Waves 0–2 shipped.**
- **`Plan-PR-134-139-Review-And-Rebuild-Roadmap.md`** — retrospective review of the merged PRs; its findings are now issues #144/#145/#146/#140.

All three optimize **2013 feature parity + correctness**. A newer plan — [`Plan-Reengagement-Sprint-1.md`](Plan-Reengagement-Sprint-1.md) — argues the binding constraint is **matchmaking liquidity** (≈0 concurrent players), implying a different order. This master plan resolves that tension with a **blended sequence**: clear the small correctness/security fixes first (they de-risk everything), then run player-visible features **and** server-side re-engagement wins in parallel, deferring the heavy parity work. Scope is the **server backlog + server-side re-engagement** — no client-recompile work sits in the linear sequence (the spearman cluster and the AI-bot backstop run as separate tracks).

## Already shipped (don't re-open)

Integration **M0, M1, M1.5, M1.6, M2, M3a, M3b** · Triage **Waves 0/1/2** (PRs #126–#139) · Docs **P1** (#141) + **P2** (#143) + **P3** (#147, merged 2026-07-02 — closed #80/#48/#81/#82; docs track 100%) · Phase 1 security pair — **#146** closed + **#140** mitigated (PR #156, 2026-07-20) · **#145** leaderboard index + `battles` drop (this PR).

## Reconciled backlog (open issues + re-engagement + structural)

Category key: **SEC** correctness/security · **UNLOCK** turns on shipped-but-dark features · **FEAT** player-visible · **RE** re-engagement (server-only) · **MAINT** maintainability · **PARITY** heavy/long-tail · **STRUCT / POSTPONED / CONTENT** parallel tracks.

| Item | Issue(s) | Cat | Dependency / readiness | Effort |
|---|---|---|---|---|
| Discord `account_id` collision — **residual** (shared `ranking` PK + in-battle identity) | #140 | SEC | #146 done + #140 mitigated (PR #156); real fix = server-assigned small `game_id` (crossplay design-B) | deferred |
| Friends-list bootstrap | #91 | UNLOCK | verify client `URLLoader` shape first → unlocks lobby Invite (M3b) → #17 | M |
| Color variants (unlock + `/unit/variation` route) | #98 spec, #72 #119 | FEAT | READY — server-only; spec = [`Plan-Fix-Variation-IAP-Deadend.md`](Plan-Fix-Variation-IAP-Deadend.md) | M |
| Shop unit tiers — Phase 1 only | #62 | FEAT | Phase 1 = `acc.json` only (no code); later phases need client work | S |
| Post-battle Elo chat line | #137 | FEAT | small; needs a manual result-overlay visibility check | S |
| Free hire/promote (drop renown costs, zero retire refund) | #154 | FEAT | not scheduled — optional 2d pick; check where the client sources the promote price | S |
| Instrumentation (logins/sessions/queue) | RE **S5** | RE | none — measures everything else | S |
| MOTD via global-chat + login inject | RE **S1** | RE | needs the ~2-min menu-visibility test | S |
| Player titles (`display_name` suffix) | RE **S2** | RE | needs a title taxonomy (design task) | S–M |
| Battle Hour + external announcement | RE **S3/S4**, #47 | RE | external, ~no code; fire after #91 makes 2p reachable | XS |
| Extract `endgame()` from `Battle.ts` (969-line hotspot) | roadmap **W2.1** + #136 | MAINT | refactor-only — do NOT touch `endgameStarted` guard / DB-then-pushData order | M |
| Replace `app._router.handle()` internal API | #38 | MAINT | none | S–M |
| CI + vitest-flake + review process | #13 #14 | MAINT | low urgency (CI already Ubuntu; flake Windows-local, mitigated by #128) | S |
| Structured battle event log | #30 | PARITY | feeds M6 replay — emit a reusable stream | M |
| System messages + admin (`BSF_ADMIN_KEY`) | integration **M5** | PARITY | no issue yet — file one; #81 docs the admin surface | M |
| Battle replay capture + parity harness | integration **M6** | PARITY | reuse #30 stream; capture from stream (not `battle.turns`, cleared at endgame) | L |
| Tourney join / IAP read-only shapes | roadmap W4.2/W5.2 | PARITY | `tourney_id` already flows; IAP `finalize` stays disabled | M |
| User registration (claim username, no Steam) | #29 | PARITY | independent | M |
| Monorepo consolidation | [`Plan-Consolidate-Client-Server-Monorepo.md`](Plan-Consolidate-Client-Server-Monorepo.md) | STRUCT | **deferred** — do at a clean point; disruptive to branches | M |
| Spearman cluster | #101 #112 #113 #115 #116 #117 | POSTPONED | client+server, recompile-gated — out of this sequence | L |
| AI-bot backstop (empty-queue opponent) | BSF-Client #12 | POSTPONED | client recompile — the *durable* liquidity fix; parallel weeks-track | L |
| Retire double-refund race | #144 | POSTPONED | postponed 2026-07-19 — #154 zeroes the retire refund (defuses the renown mint); residual = minor "retired unit can reappear" quirk | S |
| Forum archive | #31 | CONTENT | batchable content work | M |

## Recommended order

Phases 1–2 are the focus; 3–4 as appetite allows.

**Phase 0 — done (2026-07-02).** PR #147 merged → closed #80/#48/#81/#82; docs track 100%. `Plan-Docs-Track-2026-06-19.md` archived 2026-07-19.

**Phase 1 — correctness/security pair — ✅ DONE.**
1. ~~**#140 + #146**~~ — account-id helper + Discord-session hardening shipped in **PR #156** (2026-07-20); #146 closed, #140 mitigated (residual `ranking`-PK collision tracked above → crossplay design-B).
2. ~~**#145**~~ — `idx_ranking_tourney` + drop of the dead `battles` table shipped (migration `003`, this PR).

**Phase 2 is now the front.**

_#144 (retire double-refund race) postponed 2026-07-19 — the planned free hire/promote change (#154) zeroes the retire refund, removing the renown mint; the leftover "retired unit can briefly reappear" quirk is accepted for now. See its Postponed row._

**Phase 2 — player value + liquidity, in parallel (the two levers a returner feels).**
- **2a · #91 friends** — verify the client `URLLoader` shape first; replace hardcoded `friends:[]` with a source + add-friend route. **Design the schema to anticipate the deferred FRIEND renown award** (a friend-battle-record consumer). Unlocks lobby Invite → real 2-player testing (#17).
- **2b · Color variants #98/#72/#119** (spec: [`Plan-Fix-Variation-IAP-Deadend.md`](Plan-Fix-Variation-IAP-Deadend.md)) — grant every variation `unlock_id` + implement `/roster/unit/variation`. **Decide unlocks-table vs `acc.json`**: a real `unlocks` table would unblock the deferred BOOST renown award for free. **Check `LobbySvc` for the VARIATION push** (M3b's out-of-scope `notifyVariation`) — port in the same PR or file a follow-up.
- **2c · Re-engagement quick wins** (see [`Plan-Reengagement-Sprint-1.md`](Plan-Reengagement-Sprint-1.md)): **S5** instrumentation → **S1** MOTD (after the menu-visibility test) → **S2** titles (after taxonomy). Then **S3/S4** Battle Hour + external announcement (pairs with **#47** client-to-GitHub-release), fired *after* #91 so the first returning click hits a reachable match, not a dead queue.
- **2d · (optional) #62 shop Phase 1** (`acc.json`-only), **#137** Elo chat line, and **#154** free hire/promote (must zero the retire refund with it) — all small.

**Phase 3 — maintainability (after the value push, before heavy parity).**
- **W2.1** extract `endgame()` into `endgame.ts` behind a lifecycle test; move `turns=[]` to `.finally`. Refactor-only.
- **#38** replace the undocumented Express internal API.
- **#13/#14** CI, review process, vitest-flake fill-in.

**Phase 4 — heavy parity / long-tail (deferred; pick per appetite).** #30 event log → **M6** replay harness → **M5** admin/system-messages (file an issue) → tourney join / IAP shapes → **#29** registration.

**Parallel / standalone tracks (not in the linear order).**
- **Monorepo consolidation** — deferred; do at a quiet-branch moment (see [`Plan-Consolidate-Client-Server-Monorepo.md`](Plan-Consolidate-Client-Server-Monorepo.md); it also renames the GitHub repo — outward-facing, get explicit go per its Step C).
- **Spearman cluster** (#101/#112/#113/#115/#116/#117) — postponed new-feature, client+server, recompile-gated. Tracked in the spearman plans (`Plan-Spearman-As-Axeman-Promotion.md`, `Plan-Spearman-Dredge-Cleanup-BS3-PoC.md`, `Plan-Phase2c-Dredge-Party-Tag.md`).
- **AI-bot backstop** (BSF-Client #12) — the durable liquidity fix but client-recompile-gated; runs as a parallel weeks-scale client track, out of this server sequence.
- **Content** — #31 forum archive, batchable.

**Cross-cutting checklist (lifted from the triage cross-dependency table — still valid):** #91 schema anticipates the FRIEND award · #98 unlocks-table decision unblocks BOOST + check the VARIATION lobby push · #30 emission is reused by M6 (capture from the stream, not `battle.turns`).

## Archived plans (history — kept in local history, not in the public repo)

| Plan | Was | Superseded because |
|---|---|---|
| `Plan-Integrate-Original-Stoic-Server.md` | Stoic-parity milestone plan | M0–M3b shipped; remaining M4–M7 folded into Phase 4 + issues. Java-reference value lives in [`../CLAUDE.md`](../CLAUDE.md) / [`../../REFERENCE.md`](../../REFERENCE.md). A redirect stub remains at the old path for inbound links. |
| `Plan-Issue-Triage-2026-06-10.md` | ordered issue backlog | Waves 0–2 shipped; live remainder + cross-dep table folded in here. |
| `Plan-Issue-Triage-Index-2026-06-10.md` | its summary table | companion to the above. |
| `Plan-PR-134-139-Review-And-Rebuild-Roadmap.md` | PR retrospective | findings filed as #144/#145/#146/#140. |
| `Plan-Triage-GitHub-Issues.md` | earlier labeling pass | already superseded 2026-06-11. |
| `Plan-Docs-Track-2026-06-19.md` | docs-track tier plan (P1–P3) | all three tiers merged — #141 / #143 / #147. |

**Still live (not archived):** [`Plan-Reengagement-Sprint-1.md`](Plan-Reengagement-Sprint-1.md), [`Plan-Fix-Variation-IAP-Deadend.md`](Plan-Fix-Variation-IAP-Deadend.md), [`Plan-Consolidate-Client-Server-Monorepo.md`](Plan-Consolidate-Client-Server-Monorepo.md), and the spearman plans.
