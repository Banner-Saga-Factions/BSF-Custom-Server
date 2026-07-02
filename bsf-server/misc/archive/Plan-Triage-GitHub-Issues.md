> **SUPERSEDED** by [`../Plan-Master-Roadmap.md`](../Plan-Master-Roadmap.md) (2026-07-02) — the single live roadmap. Retained as history (label-scheme rationale).

# Review GitHub Issues, Apply Labels, Identify Related Issues

> **⚠️ Superseded (2026-06-11).** This doc is stale: the labeling work it proposes is done, and it still lists **#120** and **#105** as active P0s — both are now **closed**. Use [`Plan-Issue-Triage-2026-06-10.md`](./Plan-Issue-Triage-2026-06-10.md) as the canonical triage + work-ordering plan. Kept for history (the label-scheme rationale lives here).

## Context

The BSF-Custom-Server repo has **53 open issues** (the chat-context list cited 30, which was already stale — 13 newer issues exist plus the chat priority-list missed several). Only 8 issues are currently labeled (docs + a few of the post-review bug/perf ones). The rest have **no labels at all**, so triage is opaque and related bugs are scattered.

This plan does three things:
1. Establishes a consistent labeling scheme (priority + type).
2. Assigns labels to every open issue and identifies likely duplicates.
3. Surfaces a handful of newly-filed issues that the chat-context priority list missed — including one that's arguably more urgent than anything on it (#120: production fast-timer flag stuck ON).

## Notable findings from triage

### #63 is already closed (today)
The chat-context list flagged #63 ("Matches fail to load after hiring Spearman / Dredge Stoneguard") as the #1 critical item — but it was closed earlier today crediting #114 (commit 2339427, roster ID re-allocation). Top-3 needs a new #1.

### New issues the chat list missed (filed by wavestbsf and eltaino1 on 2026-06-07 / 06-05)
- **#120** — `_debugFastTimer = true` hardcoded in `Battle.ts:22`. Every match on the production GCP server runs on a 15s-per-turn timer instead of 30/45s; surrender-via-timeout likely explains the renown/units-lost reports being investigated on `bug/renow-units-lost-gcp-SERVER`. **More urgent than anything currently on the priority list.**
- **#117 / #116** — Spearman causes game freeze after attack / after movement. (Not the same bug as #63, which was hire-time, not in-battle.)
- **#118** — Stat changes in barracks not reflected in-battle (likely related to the party-order rule in `gotchas.md`).
- **#119** — Custom unit colors after promotion don't persist across restarts.
- **#115** — Spearman portrait shows as another unit (likely related to #112).
- **#113 / #112** — Spearman PoC bugs (armor attack malformed, versus portrait blank).
- **#105** — `db-data` Docker volume overlays compiled code; new `db/*` modules silently missing after rebuild. Operational landmine for every future schema/connector module.
- **#101** — Add spearman as purchasable unit (blocked by client class registry — has root-cause analysis already).
- **#99** — Per-unit `KILLS` never increments — long-running accounts can't promote (blocks promotion feature end-to-end).
- **#98** — Color variations dead-end at Stoic store (UX deadend tied to #72/#119 cluster).
- **#95** — Renown refund on retire mints renown when multiple templates share entityClass (security/integrity).
- **#91** — Friends list empty blocks lobby smoke test (already in the list).

### Issues that look partially-fixed already
- **#18** — A `knownIds.includes(...)` check now exists at `Battle.ts:463-464` (commit M-4), which rejects arbitrary `killedparty` values. But the recommended fix in the issue was stricter — `killedparty` must be the **opponent's** account_id (not the caller's). A caller can still pass their own account_id and kill their own unit. So: partially mitigated, not closed.
- **#19** — Same `knownIds` check restricts which IDs can claim the win, but `battle.winner = Number(req.body.killerparty)` is still set from the request body. A caller can claim themselves as winner. Not closed.

### Likely duplicates (verify before closing)
- **#115 vs #112** — Both about spearman versus-portrait rendering. #112 has detailed analysis (search-screen tabs blank, possibly cache-warm or wrong-side); #115 is a one-liner ("shows as another unit, raidmaster I think"). Possibly the same bug surfaced from two angles. Link them via a cross-reference comment; leave open until the reporter confirms.
- **#119 vs #72** — Both about promotion color-variant glitchiness; #72 is vaguer, #119 specifically about restart persistence. Likely overlap. Link both, treat as a cluster.
- **#117 vs #116** — Both spearman freezes (attack vs movement). Note: #116's body says "may have already been resolved by the time of our second game". Possibly already gone; treat as one investigation.

### Clusters that should be tackled together
| Cluster | Issues | Shared work |
|---|---|---|
| Spearman PoC follow-up | #101, #112, #113, #115, #116, #117 | Same plan doc: `bsf-server/misc/plan-spearman-ability-range-portraits.md` |
| Promotion / color variants | #72, #98, #99, #119 | Touches roster + variation route + KILLS stat |
| `/killed` route hardening | #18, #19, #52 | Same handler in `Battle.ts:442-498`, same endgame() path |
| Post-battle correctness | #20, #41, #43, #84 | Battle finalization message + memory + Elo display |
| Session memory / perf | #26, #39, #41 | All long-running memory growth |
| Identity / 64-bit IDs | #23, #25, #34 | All about account_id width/precision |
| Docs P1/P2/P3 | #74-#82 | Already labeled, leave as-is |
| Operational | #27, #105 | Docker / volume / build hygiene |

## Proposed labeling scheme

### Add 2 new labels (confirmed)
- **`P0`** (color: `#b60205` — darker red than `P1` so the priority gradient stays readable) — "Active production breakage; players affected right now"
- **`security`** (color: `#d93f0b` — orange) — "Security or integrity boundary issue"

Everything else uses existing labels: `bug`, `enhancement`, `documentation`, `duplicate`, `P1`, `P2`, `P3`, `good first issue`. No cluster labels — cross-reference comments will handle grouping.

### Priority assignments (53 open issues)

**P0 — active production gameplay break**
- #120 Fast-timer hardcoded ON (NEW; the most urgent open issue)
- #117 Spearman game freeze after attack
- #116 Spearman game freeze after movement
- #105 db-data volume overlays compiled code (silent prod breakage on rebuild)

**P1 — high (security, data integrity, blocking flows)**
- #52 Unsafe `as BattlePartyData` cast (confirmed still present at `Battle.ts:566-567`)
- #19 `battle.winner` spoofable [`security`]
- #18 `killedparty` validation [`security`] (partial fix landed, still incomplete)
- #95 Renown refund mints renown [`security`]
- #91 Friends list empty — blocks M3b smoke test
- #43 Renown desync on mid-endgame crash
- #25 Discord Snowflake parseInt precision loss [`security`]
- #27 `.env` not excluded from Docker context [`security`]
- #20 BattleKilledData reliable_msg_id missing field
- #99 KILLS stat never increments (blocks promotion entirely)
- #74, #75, #76 (docs — already P1)

**P2 — moderate (correctness/perf, not immediately blocking)**
- #84 Surface Elo after battle ends
- #72 Promotion color-variant glitchiness
- #119 Color variants disappear on restart (or close as dup of #72)
- #98 Color variations dead-end at Stoic store
- #118 Stat changes not reflected in-battle
- #38 `app._router.handle()` Express internal API
- #39 Cap `Session.data` buffer
- #41 Prune `Battle.turns[]` on endgame
- #26 Leaderboard reads file sync
- #23 `QueueItem.account_id` naming
- #32 Opponent session_key exposed [`security`]
- #101 Spearman as purchasable unit (blocked by client registry)
- #112 Spearman versus portrait blank
- #113 Spearman armor attack 0 damage
- #115 Spearman portrait shows as another unit (likely dup of #112)
- #29 Username without Steam
- #30 Structured battle event log
- #62 New unit tiers (Phases 1–3)
- #77, #78, #79 (docs — already P2)

**P3 — low (cleanup/style/housekeeping)**
- #51 Untyped ChatMessage in endgame .catch()
- #36 String wrapper type
- #35 O(n) session scan
- #34 steam_id_str init imprecision
- #33 rewards[] ordering
- #47 Add game client to GH release page
- #48 Development.md cleanup
- #45 Documented entry-point path incorrect
- #44 start-server.bat is Windows-only
- #31 Archive Stoic forum posts
- #17 Test battle with other players
- #14 Code reviews / merging to main
- #13 CI tests
- #80, #81, #82 (docs — already P3)

### Type labels to apply
- `bug` — #18, #19, #20, #23, #25, #41, #43, #52, #95, #99, #105, #112, #113, #115, #116, #117, #118, #119, #120
- `enhancement` — #26, #29, #30, #32, #38, #39, #62, #72, #84, #91, #98, #101
- `documentation` — #44, #45, #47, #48 (in addition to the existing docs labels on #74-#82)
- `security` (new) — #18, #19, #25, #27, #32, #95
- `duplicate` candidates — #115 (of #112?), #119 (of #72?). Confirm before applying.

## Suggested action sequence

1. **Create the new labels** (`P0`, `security`) — two `gh label create` calls.
2. **Apply P0/P1/P2/P3 + type labels in batches** using `gh issue edit <N> --add-label "..."`. Roughly 50 edits; scripted as a single PowerShell loop driven by an inline `(issue, labels)` table (no separate CSV file needed).
3. **Post cross-reference comments** on the suspected-duplicate triplet (#115↔#112, #119↔#72, #117↔#116) and on the four main clusters (spearman PoC, promotion, `/killed`-route hardening, post-battle correctness) so future-you lands on the right plan doc and sibling issues when opening one. **Do not close the suspected duplicates** — leave that to the reporters to confirm.
4. **Confirmed new top-3** (replacing the chat-context list now that #63 is closed and #120 was filed):
   - **#120** (fast-timer flag) — single-line `NODE_ENV !== "production"` guard + a `/debug/fast-timer` route mirroring the existing `/debug/party-limit` pattern at `src/app.ts:44`. Landable today.
   - **#52** (endgame() unsafe cast) — replace the two `as BattlePartyData` casts at `Battle.ts:566-567` with explicit null checks; early-return on missing party. Landable today.
   - **#18 + #19** — paired security fixes in `/killed` (`Battle.ts:442-498`). The existing `knownIds` check at line 463 is partial; tighten `killedparty` to require the opponent's account_id and derive `battle.winner` from session state instead of `req.body.killerparty`. One PR covers both.

## Verification

- After labels are applied, `gh issue list --label P0` should return exactly the four P0 issues; `gh issue list --label security` should return the security set; `gh issue list --no-label` should return zero open issues. These three checks confirm full coverage.
- Spot-check 3-4 issues via the GitHub web UI to verify the labels render with the expected colors.
- Re-run `gh issue list --limit 100 --state open --json number,labels` and confirm every issue has at least one priority label and one type label.

## Files / artifacts touched

Read-only plan; no source files are modified. The only artifact produced is this plan file. Implementation will run `gh` CLI commands and a short PowerShell loop — no code changes.
