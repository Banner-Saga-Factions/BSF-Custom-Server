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
| Friends-list bootstrap | #91 | UNLOCK | the list itself rides first-poll `friends` data (replace the hardcoded `friends:[]`); the named client surfaces are the lobby-invite flow it unlocks — `FriendLobbyState`, `LobbyInviteTxn`/`LobbyOptionsTxn`, `FriendLobbyPage` (see 2a) → real 2-player testing (M3b/#17) | M |
| Color variants (unlock + `/unit/variation` route) | #98 spec, #72 #119 | FEAT | READY — server-only; spec = [`Plan-Fix-Variation-IAP-Deadend.md`](Plan-Fix-Variation-IAP-Deadend.md). Client already sends `UnitVariationTxn` and gates each appearance on an `unlock_id`/`acquire_id` client-side — server's job is just to grant those ids (see 2b). | M |
| Shop unit tiers — Phase 1 only | #62 | FEAT | Phase 1 = `acc.json` only (no code). Later phases need client work because per-stat min/max lives client-side — the class carries the ranges (`data-model.md` §3 ([local](../../bsf-client/docs/data-model.md) \| [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/data-model.md))) and the client validates against them (its `StatRange`, [`serverEndpoints.md:120`](../docs/serverEndpoints.md)), not yet ported server-side — so the server can't fully validate stat purchases yet. | S |
| Post-battle Elo chat line | #137 | FEAT | small; the manual visibility check confirms *which* surface carries the line — the end-of-battle overlay `GuiMatchResolution`/`MatchResolutionPage` (`match_resolution.swf`) or battle chat (`GuiChat`) — see 2d | S |
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
| AI-bot backstop — an *empty-queue* opponent the *server* would pair in when no human is queued (distinct from the offline AI *brain* #12, already largely shipped) | BSF-Client #12 | POSTPONED | client-recompile-gated — not for lack of a brain (spike 2026-07-22): the server would *pair* the bot but never *play* the battle (it's a recorder, not a simulator — #79), and the only bot-player that exists — the in-client offline brain — can't be driven from outside. A backstop is client work either way. Parallel weeks-track — see the standalone-tracks bullet. | L |
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
- **2a · #91 friends** — two parts: the friends **list** rides first-poll `friends` data (replace the hardcoded `friends:[]` with a real source + add-friend route), and that **unlocks the invite flow**, whose client surfaces you now know exactly where to find — `FriendLobbyState` + the `LobbyInviteTxn`/`LobbyOptionsTxn` actions (`game-flow.md` ([local](../../bsf-client/docs/game-flow.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/game-flow.md))), rendered by `FriendLobbyPage`/`friend_lobby.swf` (`ui-system.md` ([local](../../bsf-client/docs/ui-system.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/ui-system.md))). **Design the schema to anticipate the deferred FRIEND renown award** (a friend-battle-record consumer). Unlocks lobby Invite → real 2-player testing (#17).
- **2b · Color variants #98/#72/#119** (spec: [`Plan-Fix-Variation-IAP-Deadend.md`](Plan-Fix-Variation-IAP-Deadend.md)) — grant every variation `unlock_id` + implement `/roster/unit/variation`. **Decide unlocks-table vs `acc.json`**: a real `unlocks` table would unblock the deferred BOOST renown award for free. **Check `LobbySvc` for the VARIATION push** (M3b's out-of-scope `notifyVariation`) — port in the same PR or file a follow-up. **Client corroboration:** the client already ships the `UnitVariationTxn` action (`game-flow.md` ([local](../../bsf-client/docs/game-flow.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/game-flow.md))) and gates each appearance on an `unlock_id`/`acquire_id` **client-side** (`data-model.md` §3 ([local](../../bsf-client/docs/data-model.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/data-model.md))) — so the server's whole job is to **grant those unlock ids**, which is exactly the unlocks-table-vs-`acc.json` decision above.
- **2c · Re-engagement quick wins** (see [`Plan-Reengagement-Sprint-1.md`](Plan-Reengagement-Sprint-1.md)): **S5** instrumentation → **S1** MOTD (after the menu-visibility test) → **S2** titles (after taxonomy). Then **S3/S4** Battle Hour + external announcement (pairs with **#47** client-to-GitHub-release), fired *after* #91 so the first returning click hits a reachable match, not a dead queue.
- **2d · (optional) small picks:** **#62 shop Phase 1** (`acc.json`-only — but see its row on the client-side `StatRange` gap that caps server validation); **#137 Elo chat line** — a "chat line," so the visibility check confirms whether it renders on the end-of-battle overlay `GuiMatchResolution`/`MatchResolutionPage` (`match_resolution.swf`) or in battle chat `GuiChat` (both in `ui-system.md` ([local](../../bsf-client/docs/ui-system.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/ui-system.md))); and **#154 free hire/promote** (must zero the retire refund with it). All small.

**Phase 3 — maintainability (after the value push, before heavy parity).**
- **W2.1** extract `endgame()` into `endgame.ts` behind a lifecycle test; move `turns=[]` to `.finally`. Refactor-only.
- **#38** replace the undocumented Express internal API.
- **#13/#14** CI, review process, vitest-flake fill-in.

**Phase 4 — heavy parity / long-tail (deferred; pick per appetite).** #30 event log → **M6** replay harness → **M5** admin/system-messages (file an issue) → tourney join / IAP shapes → **#29** registration.

**Parallel / standalone tracks (not in the linear order).**
- **Monorepo consolidation** — deferred; do at a quiet-branch moment (see [`Plan-Consolidate-Client-Server-Monorepo.md`](Plan-Consolidate-Client-Server-Monorepo.md); it also renames the GitHub repo — outward-facing, get explicit go per its Step C).
- **Spearman cluster** (#101/#112/#113/#115/#116/#117) — postponed new-feature, client+server, recompile-gated. Tracked in the spearman plans (`Plan-Spearman-As-Axeman-Promotion.md`, `Plan-Spearman-Dredge-Cleanup-BS3-PoC.md`, `Plan-Phase2c-Dredge-Party-Tag.md`).
- **AI-bot backstop** (BSF-Client #12) — a **parallel weeks-scale client track, out of this server sequence.** The spike (2026-07-22) confirmed it stays **recompile-gated** (it can't ship without rebuilding the game client) and sharpened *why*. Three things that used to blur into "the AI bot" are separate:
  - **The AI _brain_** — the in-client planner that already ships and plays a full offline practice battle. Largely done (#12).
  - **The empty-queue _backstop_** — a bot the *server* would inject when no human is queued; **if built, the durable answer to a dead queue.** It is **unbuilt**, and offline practice is **not** it: an offline battle is a **mirror of your own party**, flagged `friendly=true`, that makes **zero server calls** — local practice, not a matchmaking participant, so it adds **no liquidity** (`offline-ai.md` §1–§2 ([local](../../bsf-client/docs/offline-ai.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/offline-ai.md))). It's **client-gated** for a concrete reason: the server would *mediate the pairing* but can't *play* the bot (it's a recorder, not a simulator — #79), and the only code that can play one is the in-client brain below.
  - **The AI _strength_** — even the shipped brain **never uses specials and never focus-fires**, so it doesn't yet feel like a real opponent (`offline-ai.md` §5, same doc).
  - **Why recompile-gating holds (corrected reason).** The mod bridge already ships hooks that *launch/steer* a battle with no new build (`start_ai_battle`, `set_spectator`) — but **launch/steer ≠ observe/play.** The bridge's only battle-observation path is its HTTP tap over *server* traffic (`mod-bridge.md` §6 ([local](../../bsf-client/docs/mod-bridge.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/mod-bridge.md))), which is **silent** during a zero-server-call offline battle — so an external mod-host "brain" would be **blind**. A smarter offline AI therefore needs one of two client rebuilds: **(a)** improve the in-client AI code (a rebuild per iteration), or **(b)** add an in-client battle-state serializer + a streaming/command hook to the bridge — **one** rebuild, after which an external brain can evolve with no further reships. The label holds; the corrected reason is "no offline battle-state channel exists," not "the AI can't be externalized."
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

---

_**Client documentation track (BSF-Client PRs #15–#17, P1–P3) is complete** — eight durable cross-repo boundary docs now exist (`client-overview`, `game-flow`, `patch-inventory`, `asset-loading`, `ui-system`, `data-model`, `offline-ai`, `mod-bridge`); entry point `client-overview.md` ([local](../../bsf-client/docs/client-overview.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/client-overview.md)). This roadmap cites several of them above; the reciprocal server→client links land in Wave 2 of [`Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md`](Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md)._
