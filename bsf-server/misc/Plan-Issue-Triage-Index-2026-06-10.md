# Issue Triage Index — 2026-06-10

Companion to [`Plan-Issue-Triage-2026-06-10.md`](./Plan-Issue-Triage-2026-06-10.md) (dependency graph, clusters, wave definitions, and cross-dependencies with `Plan-Integrate-Original-Stoic-Server.md`).

Coverage: 50 open issues in BSF-Custom-Server + 5 in BSF-Client (55 total). Ordered by recommended execution, not issue number. "Order" keys: W0 = quick wins, W1–W3 = waves, Docs D1–D9 = docs series, Client C1–C4 = client chain. 21 of these are now shipped/closed — their `Plan-Fix-Issue-*.md` files were archived as a comment on the corresponding GitHub issue and deleted from `misc/` (2026-06-19); the Plan column links to the archived comment instead. (A 22nd file, #118, was already closed before this index existed and was never listed here.)

| # | Title | Repo | Complexity | Order | Plan |
|---|-------|------|------------|-------|------|
| 116 | Spearman causes game freeze after movement | Server | Medium | W1.1 (P0; retest after #113) | [Plan-Fix-Issue-116-spearman-freeze-movement.md](./Plan-Fix-Issue-116-spearman-freeze-movement.md) |
| 117 | Spearman causes game freeze after attack | Server | Medium | W1.1 (P0; retest after #113) | [Plan-Fix-Issue-117-spearman-freeze-attack.md](./Plan-Fix-Issue-117-spearman-freeze-attack.md) |
| 113 | Spearman armor attack 0 damage / no willpower (malformed clone) | Server | Small | W1.1 — first in spearman cluster | [Plan-Fix-Issue-113-spearman-armor-ability.md](./Plan-Fix-Issue-113-spearman-armor-ability.md) |
| 18 | security: client-supplied killedparty unvalidated | Server | Small | W1.2 — one PR with #19, #52 | Archived → [issue #18 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/18) |
| 19 | security: battle.winner spoofable via killerparty | Server | Small | W1.2 — one PR with #18, #52 | Archived → [issue #19 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/19) |
| 52 | unsafe 'as BattlePartyData' cast crashes endgame | Server | Small | W1.2 — one PR with #18, #19 | Archived → [issue #52 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/52) |
| 95 | Renown refund on retire mints renown (dup entityClass) | Server | Medium | W1.3 | Archived → [issue #95 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/95) |
| 13 | CI tests | Server | Medium | W1.4 — gates safe merging | [Plan-Fix-Issue-13-ci-tests.md](./Plan-Fix-Issue-13-ci-tests.md) |
| 27 | .env not excluded from Docker build context | Server | Small | W0 quick win | Archived → [issue #27 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/27) |
| 26 | leaderboard route readFileSync per request | Server | Small | W0 quick win | Archived → [issue #26 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/26) |
| 36 | BattleTurnData String wrapper type | Server | Small | W0 quick win | Archived → [issue #36 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/36) |
| 45 | documented entry point path incorrect | Server | Small | W0 quick win (before #44) | Archived → [issue #45 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/45) |
| 44 | start-server.bat is Windows-only | Server | Small | W0 quick win (after #45) | Archived → [issue #44 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/44) |
| 51 | inline ChatMessage in endgame() untyped | Server | Small | W0 / fold into W1.2 or #43 | Archived → [issue #51 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/51) |
| 34 | steam_id_str imprecise init in Session ctor | Server | Small | W0 / absorbed by #25 | Archived → [issue #34 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/34) |
| 35 | calculateLevel O(n) session scan | Server | Small | W0 quick win | Archived → [issue #35 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/35) |
| 23 | QueueItem.account_id stores user_id | Server | Small | W0 quick win | Archived → [issue #23 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/23) |
| 33 | rewards[] ordering vs party_index | Server | Small | W0; rebase vs endgame chain | Archived → [issue #33 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/33) |
| 32 | opponent session_key exposed in BattleCreateData | Server | Small | W0 quick win (verify captures) | Archived → [issue #32 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/32) |
| 39 | cap Session.data buffer growth | Server | Small | W0/W1 | Archived → [issue #39 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/39) |
| 43 | renown desync on endgame DB failure | Server | Small | W2.1 — endgame chain start | Archived → [issue #43 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/43) |
| 41 | prune Battle.turns on endgame | Server | Small | W2.1 — after #43 | Archived → [issue #41 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/41) |
| 84 | surface new Elo after battle (M1.6) | Server | Medium | W2.1 — after #43, #41 | Archived → [issue #84 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/84) |
| 99 | per-unit KILLS never increments | Server | Medium | W2.2 — promotion-cluster root | Archived → [issue #99 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/99) |
| 98 | color variations dead-end at defunct store | Server | Medium | W2.2 — after #99 | [Plan-Fix-Issue-98-variation-unlocks.md](./Plan-Fix-Issue-98-variation-unlocks.md) |
| 119 | custom unit colors disappear on restart | Server | Medium | W2.2 — with #98 | [Plan-Fix-Issue-119-color-variants-persistence.md](./Plan-Fix-Issue-119-color-variants-persistence.md) |
| 72 | promoting units — color-variant glitchiness | Server | Medium | W2.2 — diagnose after #98/#119 | [Plan-Fix-Issue-72-promotion-color-glitch.md](./Plan-Fix-Issue-72-promotion-color-glitch.md) |
| 25 | Discord Snowflake precision loss | Server | Medium | W2.3 — before client #2 | Archived → [issue #25 comments](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/25) |
| 91 | populate friends list (lobby/Invite reachable) | Server | Large | W3 — unblocks #17 | [Plan-Fix-Issue-91-friends-list.md](./Plan-Fix-Issue-91-friends-list.md) |
| 29 | user registration without Steam | Server | Large | W3 | [Plan-Fix-Issue-29-user-registration.md](./Plan-Fix-Issue-29-user-registration.md) |
| 30 | structured battle event log (JSONL) | Server | Medium | W3 — after #41/#43; before M6 | [Plan-Fix-Issue-30-battle-event-log.md](./Plan-Fix-Issue-30-battle-event-log.md) |
| 38 | app._router.handle() Express internal | Server | Medium | W3 — isolated PR | [Plan-Fix-Issue-38-express-router-internal.md](./Plan-Fix-Issue-38-express-router-internal.md) |
| 62 | new purchasable unit tiers (Phases 1–3) | Server | Large | W3 — Ph1 after #95; 2c after #101 | [Plan-Fix-Issue-62-shop-unit-tiers.md](./Plan-Fix-Issue-62-shop-unit-tiers.md) |
| 101 | add spearman as purchasable (registry blocker) | Server | Large | W3 — after freezes fixed | [Plan-Fix-Issue-101-spearman-purchasable.md](./Plan-Fix-Issue-101-spearman-purchasable.md) |
| 112 | spearman versus portrait empty (search screen) | Server | Small | W3 — with #115, after P0s | [Plan-Fix-Issue-112-spearman-versus-portrait.md](./Plan-Fix-Issue-112-spearman-versus-portrait.md) |
| 115 | spearman portrait shows as another unit | Server | Small | W3 — with #112 | [Plan-Fix-Issue-115-spearman-portrait-wrong.md](./Plan-Fix-Issue-115-spearman-portrait-wrong.md) |
| 74 | docs: battle-message wire formats | Server | Medium | Docs D1 | [Plan-Fix-Issue-74-docs-wire-formats.md](./Plan-Fix-Issue-74-docs-wire-formats.md) |
| 75 | docs: database schema reference | Server | Medium | Docs D2 | [Plan-Fix-Issue-75-docs-db-schema.md](./Plan-Fix-Issue-75-docs-db-schema.md) |
| 76 | docs: migration design guide | Server | Small | Docs D3 — before #91/#29 migrations | [Plan-Fix-Issue-76-docs-migration-guide.md](./Plan-Fix-Issue-76-docs-migration-guide.md) |
| 77 | docs: error-code reference | Server | Medium | Docs D4 | [Plan-Fix-Issue-77-docs-error-codes.md](./Plan-Fix-Issue-77-docs-error-codes.md) |
| 78 | docs: security boundaries | Server | Medium | Docs D5 — after W1 security PRs | [Plan-Fix-Issue-78-docs-security-boundaries.md](./Plan-Fix-Issue-78-docs-security-boundaries.md) |
| 79 | docs: battle simulation rules | Server | Large | Docs D6 | [Plan-Fix-Issue-79-docs-battle-simulation.md](./Plan-Fix-Issue-79-docs-battle-simulation.md) |
| 80 | docs: FAQ / troubleshooting consolidation | Server | Small | Docs D7 — with #48 | [Plan-Fix-Issue-80-docs-faq.md](./Plan-Fix-Issue-80-docs-faq.md) |
| 81 | docs: observability runbook | Server | Small | Docs D8 | [Plan-Fix-Issue-81-docs-observability.md](./Plan-Fix-Issue-81-docs-observability.md) |
| 82 | docs: module READMEs under src/ | Server | Small | Docs D9 | [Plan-Fix-Issue-82-docs-module-readmes.md](./Plan-Fix-Issue-82-docs-module-readmes.md) |
| 48 | Development.md links/mysql/dupes | Server | Small | Docs — anytime / with #80 | [Plan-Fix-Issue-48-development-md-links.md](./Plan-Fix-Issue-48-development-md-links.md) |
| 47 | add game client to GitHub release page | Server | Small | Docs — anytime; pairs client #1 | [Plan-Fix-Issue-47-client-release-page.md](./Plan-Fix-Issue-47-client-release-page.md) |
| 31 | archive Stoic forum posts (Wayback → MD) | Server | Medium | Docs — anytime | [Plan-Fix-Issue-31-forum-archive.md](./Plan-Fix-Issue-31-forum-archive.md) |
| 14 | code review & merge workflow | Server | Small | Process — with #13 | [Plan-Fix-Issue-14-code-review-workflow.md](./Plan-Fix-Issue-14-code-review-workflow.md) |
| 17 | test battle with other players (tunnel) | Server | Small | Process — after #91 + client #1 | [Plan-Fix-Issue-17-internet-match-testing.md](./Plan-Fix-Issue-17-internet-match-testing.md) |
| 1 | document --server CLI override | Client | Small | Client C1 — anytime | [Plan-Fix-Issue-1-client-server-url-flag.md](./Plan-Fix-Issue-1-client-server-url-flag.md) |
| 3 | register bsf:// URL scheme | Client | Small | Client C2 — first of mobile chain | [Plan-Fix-Issue-3-client-bsf-url-scheme.md](./Plan-Fix-Issue-3-client-bsf-url-scheme.md) |
| 2 | Discord OAuth via DiscordSteamworks stub | Client | Large | Client C3 — after #3 + server #25 | [Plan-Fix-Issue-2-client-discord-steamworks.md](./Plan-Fix-Issue-2-client-discord-steamworks.md) |
| 4 | stub/remove ANEs for mobile builds | Client | Medium | Client C4 — after #2, #3 | [Plan-Fix-Issue-4-client-stub-anes-mobile.md](./Plan-Fix-Issue-4-client-stub-anes-mobile.md) |
| 7 | BattleStateInit 15s timeout backstop | Client | Medium | Client — next SWF rebuild cycle | [Plan-Fix-Issue-7-client-battlestateinit-timeout.md](./Plan-Fix-Issue-7-client-battlestateinit-timeout.md) |

Notes:
- Client issue comments were not retrievable during triage (plans use issue bodies only); server plans incorporate all issue comments.
- Issue numbers are per-repo (Client #1–#7 ≠ Server numbering); client plan files carry a `client-` slug.

## Archiving a plan file once its issue is fixed

When a `Plan-Fix-Issue-<n>-*.md` file's underlying fix has shipped (PR merged, issue closed), archive it instead of leaving it in `misc/` indefinitely:

1. **Post the plan as a GitHub comment** on the issue, with a one-line archival header prepended so a reader isn't confused about why a "plan" doc is appearing on an already-closed issue:
   ```
   gh issue comment <n> --repo <owner>/<repo> --body-file <path-with-header>
   ```
   Header line: `*Archived implementation plan — posted retroactively after this issue's fix shipped.*`
2. **Verify** the comment landed (re-fetch via `gh issue view <n> --json comments --jq '.comments[-1].body'` and confirm the archival header text is present) before deleting anything — these files often have no other copy.
3. **Delete the local file** only after that verification succeeds.
4. **Update this index's Plan column** for that row from the local-file link to `Archived → [issue #<n> comments](https://github.com/<owner>/<repo>/issues/<n>)`. Leave the rest of the row (Title/Repo/Complexity/Order) as historical record of what was planned and when.
5. **Check the issue's actual state matches "fixed"** — a PR's closing keywords (`Closes #a, #b`) only auto-close the *first* issue referenced per keyword; comma-separated follow-ups need their own `Closes`/`Fixes` keyword or a manual `gh issue close <n>`. Don't assume "merged PR" implies "issue closed" without checking.

Do **not** archive a plan file for an issue that's still open — it's the working document a future chat will use when that issue's turn comes in the wave order above.
