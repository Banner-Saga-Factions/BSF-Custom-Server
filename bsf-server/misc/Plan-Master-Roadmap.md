# BSF Server — Roadmap

> **Status** — **A signpost, not a plan.** The live backlog is the BSF Roadmap board; this file explains the order it is kept in and where this file's old contents went.
> **Issue** — none of its own.
> **Last touched** — 2026-09-13

## Where the backlog lives

The work list is the public [**BSF Roadmap** board](https://github.com/orgs/Banner-Saga-Factions/projects/3), covering both the server and the game client repositories.

- **What to pick next:** the [Now](https://github.com/orgs/Banner-Saga-Factions/projects/3/views/4) view, top first.
- **What players can expect:** the [What's coming](https://github.com/orgs/Banner-Saga-Factions/projects/3/views/8) view.
- **What a card records:** where the work stands (*Inbox*, *Ready*, *In progress*, *Verify in game*, *Done* — or *Parked*, meaning looked at and set aside), how soon it is planned (*Now*, *Next*, *Later*), its category, its size, how sure we are of it (*Measured*, *Reasoned*, *Unproven*), and anything outside the backlog it is waiting for — a rebuilt game client, two players, a look at the running game, or a decision.
- **Priority** stays as the `P0`–`P3` labels on each issue.
- **One issue waiting on another** is a *blocked-by* link on the issue itself, and a family of issues sits under a parent issue as sub-issues — the spearman work is grouped under #275.

How work moves across the board is set out in [`../CLAUDE.md`](../CLAUDE.md) → *The backlog, and how work moves*.

## Why this file shrank

Until 2026-09-13 this file held a table of every open issue and a phase-by-phase order. It repeated what the issues said, and the two copies drifted apart: three rows were found to be wrong, and most of what looked like knowledge only the table held turned out to be corrections to itself. A field on the board cannot drift from the work it describes, because it is the only copy. The old text is still in this file's git history.

## The reasoning behind the order

The order of the **Now** view holds the sequence but cannot say why. The reasoning:

1. **Small correctness and security fixes first.** They are cheap, and they make everything after them safer to build and to test with strangers.
2. **Then player-visible work and server-side work to bring players back, side by side.** With almost nobody online, what limits the game is whether two people can find each other, not its list of features — [`Plan-Reengagement-Sprint-1.md`](Plan-Reengagement-Sprint-1.md) makes that argument. When the queue is empty, players meet in two ways: by inviting a friend, or at a set time, such as a tournament (#201).
3. **Heavy work to match the original server comes last**, and anything that needs a rebuilt game client runs on a track of its own.

## Where everything else went

| Used to be here | Now |
|---|---|
| The backlog table and the recommended order | the board |
| Each row's reasoning | the issue it described |
| Rows that never had an issue | #267–#274, plus #275 grouping the spearman issues |
| The list of shipped work, and the client-contract write-up | [`../CHANGELOG.md`](../CHANGELOG.md) |
| The disaster-recovery drill | [`../docs/Deployment.md`](../docs/Deployment.md) for what to do; [`../docs/retrospectives.md`](../docs/retrospectives.md) for what it taught |

## Archived plans (history — kept in local history, not in the public repo)

_Names below are written without their `.md` ending on purpose. This table is a record of files
that have been removed, and the check that guards against broken links searches for exact file
names — so spelling them in full here would make an accurate historical note look like a citation
of something missing. Please keep them as they are._

| Plan | Was | Superseded because |
|---|---|---|
| `Plan-Integrate-Original-Stoic-Server` | Stoic-parity milestone plan | M0–M3b shipped; remaining M4–M7 folded into Phase 4 + issues. Java-reference value lives in [`../../REFERENCE.md`](../../REFERENCE.md) and [`../docs/protocol-cross-reference.md`](../docs/protocol-cross-reference.md). A redirect stub remains at the old path for inbound links. |
| `Plan-Issue-Triage-2026-06-10` | ordered issue backlog | Waves 0–2 shipped; live remainder + cross-dep table folded in here. |
| `Plan-Issue-Triage-Index-2026-06-10` | its summary table | companion to the above. |
| `Plan-PR-134-139-Review-And-Rebuild-Roadmap` | PR retrospective | findings filed as #144/#145/#146/#140. |
| `Plan-Triage-GitHub-Issues` | earlier labeling pass | already superseded 2026-06-11. |
| `Plan-Docs-Track-2026-06-19` | docs-track tier plan (P1–P3) | all three tiers merged — #141 / #143 / #147. |
| `Codebase-Review-Findings-2026-05-07` | 2026-05-07 review + handoff | all ten blockers shipped. Its own status line still said #7–#10 were open; they are not — stat reset, surrender, the lobby routes and the username field all exist. Archived 2026-09-08. |
| `Plan-Reconcile-Server-Docs-With-Client-Doc-Track` | absorb the client doc track | both its waves done — PR #162 and PR #163. |
| `Plan-Wave-2-Server-Doc-Reciprocity` | its Wave 2 detail | shipped as PR #163. Its own header still read "ready to implement"; the parent plan and the merged PR settle it. |
| `Plan-Move-SQLite-DB-to-data-Mount` | database volume fix | #105 closed; full text preserved as a comment on #105. |
| `Review-Plan-Enable-Mobile-Windows-Crossplay` | review of the crossplay plan | its corrections were folded into that plan's 2026-06-04 rewrite. |
| `Plan-Fix-Variation-IAP-Deadend` | unit colour dead-end | **implemented**, not abandoned — the colour route shipped and #72 / #98 / #119 closed. The one piece it deferred, showing the change to a watching friend, is **#216**. Text preserved as a comment on #98. |
| `Plan-New-Developer-Onboarding` | onboarding improvements | its output is `CONTRIBUTING.md`, which exists. |
| `Plan-Consolidate-Client-Server-Monorepo` | one-repository proposal | filed as **#252**; text preserved as its first comment. |
| `retry_oci_apply` | Oracle Cloud provisioning retry | that hosting route was abandoned; the server runs on Google Cloud. |

**Tracked plans still in use:** [`Plan-Reengagement-Sprint-1.md`](Plan-Reengagement-Sprint-1.md), [`Plan-Enable-Mobile-Windows-Crossplay.md`](Plan-Enable-Mobile-Windows-Crossplay.md) (**#251**), the two live ones from the client-contract track — [`Plan-Client-Contract-Audit.md`](Plan-Client-Contract-Audit.md) and [`Plan-Client-Contract-Third-Review-Corrections.md`](Plan-Client-Contract-Third-Review-Corrections.md) — the four spearman plans ([`Plan-Spearman-As-Axeman-Promotion.md`](Plan-Spearman-As-Axeman-Promotion.md), [`Plan-Spearman-Dredge-Cleanup-BS3-PoC.md`](Plan-Spearman-Dredge-Cleanup-BS3-PoC.md), [`Plan-Phase2c-Dredge-Party-Tag.md`](Plan-Phase2c-Dredge-Party-Tag.md), [`plan-spearman-ability-range-portraits.md`](plan-spearman-ability-range-portraits.md)), [`PlanAddNewUnits.md`](PlanAddNewUnits.md) (**#62**), and the three research notes the spearman and crossplay work still reads from ([`findings_unit_extensibility.md`](findings_unit_extensibility.md), [`findings_bs_modding.md`](findings_bs_modding.md), [`Findings-Client-ActionScript-Crossplay.md`](Findings-Client-ActionScript-Crossplay.md)).
