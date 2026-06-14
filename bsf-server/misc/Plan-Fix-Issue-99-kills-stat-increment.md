# Plan: Fix #99 — per-unit KILLS stat never increments after battles

> **STATUS — RESOLVED (Wave 1, PR 2, 2026-06-13).** Shipped on branch `fix/per-unit-kills-99`.
> **Approach taken:** rode PR 1's confirmed-kill hook — `Battle.unitKillCounts` tallies each
> confirmed *opposing* kill in `applyKillReport()`; `endgame()` applies each side's tally to
> its own `roster_json` via `saveRoster` inside the existing `Promise.all` (winner *and*
> loser; non-friendly only; in-memory `accountData` updated in the `.then()` after the write).
> The `/killed` `killer` field is a **plain roster id** (`raider_start_0`), not the
> `{account}+{index}+{unit}` entity form this draft worried about, so **no entity-id parsing
> was needed**. Writes are **batched at endgame** (the draft's fallback), not per-kill.
> **Code-review hardening:** kill credit also requires both clients to agree on the `killer`
> (`Battle.killReportKillers`) so a lone modified client can't funnel kills onto one unit;
> residual two-colluding-clients limit documented. Rollback: `BSF_KILL_CONFIRM_SINGLE=true`.
> Docs: `CHANGELOG.md`, `.claude/rules/gotchas.md`, `CLAUDE.md`. #79 doc follow-up still open.

**Repo:** BSF-Custom-Server · **Labels:** bug, P1 · **Complexity:** Medium
**Cluster:** Promotion/color-variant root blocker — do before #98, #72, #119.

## Problem
The server never increments a roster unit's `KILLS` stat on a killing blow, so `roster_json` keeps the hire-time value (0). The client gates Promote on `readyToPromote(killsToPromote)` (`EntityDef.as:367-376`), so newly hired units can never promote. The 2013 Java server incremented on every kill event (`BattleMonitor.java:645-650` → `EntityDef.incrementKills`, persisting `stat_kil` immediately), skipping friendly/practice battles.

## Files likely to change
- `src/services/battle/Battle.ts` — `/killed` handler: identify the killer unit (`req.body.killer` entity id) and its owning party.
- `src/services/roster.ts` and/or `src/db/account.ts` — wherever `roster_json` is read/written; add an increment helper.
- Possibly `src/services/battle/BattlePartyData.ts` — mapping entity ids back to roster units.

## Recommended approach
Port the Java semantics: on each kill event (non-friendly battles only), resolve the killer's roster unit and increment its KILLS in `roster_json`, persisting immediately (or batched at endgame if per-kill writes are too chatty — Java did per-kill; start there for fidelity). Mind the entity-id format (`<account>+<party>+<class>_<n>` per #30's example) when mapping back to roster entries.

## Tests
- Integration: scripted battle where unit A kills unit B → A's roster KILLS +1 in DB; loser unchanged.
- Friendly/practice battle → no increment.
- Promotion gate: unit with KILLS ≥ threshold can promote in-game (manual smoke).

## Sequencing
Root of the promotion cluster. Interacts with the `/killed` hardening PR (#18/#19/#52) — land that first, then this.

---

## Appendix — earlier draft (Plan-Fix-Issue-99-kills-stat-never-increments.md, midnight run 2026-06-11)


**Repo:** BSF-Custom-Server · **Labels:** bug, P1 · **Complexity: medium**

## Problem summary

The server never increments a roster unit's `KILLS` stat when it lands a killing blow; `roster_json` keeps the hire-time value (0 for purchased units). The client gates Promote on `readyToPromote(killsToPromote)` (`engine/entity/def/EntityDef.as:367-376` — kills >= required), so newly hired units can never promote rank 1→2. The original Java incremented per kill event (`BattleMonitor.java:645-650` → `EntityDef.incrementKills()` → `UPDATE unit_roster SET stat_kil=stat_kil+1`), skipping friendly battles.

## Files likely to change

- `bsf-server/src/services/battle/Battle.ts` — `/killed` handler (line 442–~498): record the killer entity per kill; `Battle` class (line ~50s): add `unitKillCounts: Record<string, number>`; `endgame()` (line 553+): apply increments to each killer-side player's `roster_json` and persist.
- `bsf-server/src/db/account.ts` — reuse `saveRoster()`; add a helper only if endgame needs a combined write.
- Possibly `bsf-server/src/services/battle/` siblings if entity-id parsing helpers live there.

## Recommended approach

1. In `/killed`, after the existing M-4 `killerparty` validation (line 462-465), parse the underlying `unit_id` from `req.body.killer` (entity format `{account_id}+{index}+{unit_id}` per server CLAUDE.md gotchas) and bump `battle.unitKillCounts[unit_id]`.
2. At endgame, for the non-friendly case only (match Java), load each side's roster, find units by id, increment `KILLS` in the stats block, persist via `saveRoster()` **inside the existing `Promise.all` ordering contract** (DB writes resolve before client-visible messages — `bsf-server/.claude/rules/db.md`).
3. Optionally push a roster update so the client sees new kill counts without re-login (check what the Java pushed; if nothing, skip — next poll/login picks it up).
4. Don't count kills for the surrendering path beyond what `/killed` actually reported (surrender produces no extra kill events).

## Tests to add or update

- `bsf-server/test/routes/battle.test.ts`: drive a battle where unit X reports 2 kills via `/killed` → after endgame, X's `KILLS` in `roster_json` increased by 2; friendly battle → no increment; killer entity that doesn't parse / isn't in roster → no crash, no increment (relies on #52 hardening).
- `bsf-server/test/routes/roster.test.ts`: promote succeeds for a unit whose KILLS crossed the threshold via the battle path (integration-ish; optional).

## Dependencies / sequencing

After **#52** (same `/killed`→`endgame()` flow; land hardening first). Unblocks meaningful retest of **#72** and is a prerequisite for long-account promotion testing generally. Doc follow-up: #79 should document the kill→KILLS rule.
