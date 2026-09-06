# Plan — Add New Units to Factions: Spearman, Dredge Cleanup, BS3 Hero PoC

_Drafted 2026-05-28. Successor / consolidation of `PlanAddNewUnits.md`, `Plan-Phase2c-Dredge-Party-Tag.md`, and the dredge work in `findings_unit_extensibility.md`._

---

## Context (the why)

The 2026-05-09 to 2026-05-25 work added six already-whitelisted classes (skystriker, warleader, etc.) plus seven dredge purchasables to the Mead Hall via `acc.json`. Three classes that ship with full art assets — `spearman`, `lancer`, `wardog` — remain blocked. A 2026-05-25 attempt to add `spearman` to `acc.json` produced a **silent tutorial-replay bug**: the client threw `ArgumentError("no such entity class: spearman")` inside `EntityDefVars.fromJson()`, that throw was caught and swallowed by `AccountInfoTxn`, and the visible symptom was every login replaying the tutorial because `config.accountInfo.completed_tutorial` never updated.

That bug is the central thing this plan navigates around. The fix path depends on whether `spearman` is present in the client's `character_classes.json.z` class registry or missing from it — a question we have not yet answered. The plan starts with a cheap gate check, then routes downstream based on the answer.

Parallel to spearman, two existing work streams have remaining pieces:
- **Dredge cleanup** — eight dredge classes (`grunt`, `torpor`, `scourge`, `bellower`, `slag/fire/doom/sun_slinger`) are in `acc.json` at `cost: 9990` but blocked by the Proving Grounds portrait hang documented at `findings_unit_extensibility.md:200-208`. Only `dredge_stoneguard` is unblocked (via the user's hand-edit portrait link).
- **Phase 3 BS3 hero PoC** — `PlanAddNewUnits.md` lays out the path but flags Step 0 (an AMF3 round-trip Node spike) as never executed. Without it, BS3 hero ports cannot begin.

The user's explicit question — _"what needs to change at server, client level and do we need to extend client based on enhancements to BS1/2/3?"_ — is answered upfront in Section 1 below, before the work plan.

---

## 1. Server / Client / Architecture matrix (read this first)

This answers the user's confusion directly. Every "add a unit" task lives in exactly one row.

| Scenario | Server (`acc.json`) | Client engine code (SWF) | Client class registry (`character_classes.json.z`) | Client assets (PNG/SWF/JSON.z on disk) |
|---|---|---|---|---|
| **A. Class in registry, on whitelist** (the 6 shipped Phase 1: skystriker, warleader, …) | Add `PurchasableUnitData` entry, restart | — already passes `RunMode.isClassAvailable()` | — already present | — already shipped |
| **B. Class in registry, NOT whitelisted** (e.g. spearman _if_ gate check passes) | Add entry at `cost: 9990` first | `--developer` flag bypasses; full public release would need SWF patch to `engine/core/RunMode.as:39-66` `available_classes` dict | — already present | — already shipped |
| **C. Class NOT in registry, assets present** (e.g. spearman _if_ gate check fails; likely lancer/wardog) | Add entry at `cost: 9990` first | Same as B | **AMF3 inject required**: add class def, partyTag, portrait link, abilities | — already shipped (verified 2026-05-28 for spearman + lancer) |
| **D. Class NOT in registry, NEW partyTag** (e.g. dredge before Phase 2c) | Same | Same | AMF3 inject + add `{tag, limit}` to `partyTagLimits` | — already shipped |
| **E. Class NOT in registry, assets MISSING** (BS3 hero port) | Same | Same | AMF3 inject + maybe `_ability_index.json.z` edits | **Copy** PNG icons / anim / vfx / sound from BS3 install; portrait clip cannot be copied — re-author in Factions format or stand-in donor |

**Key takeaways**:
- The **server change is identical across every row** — one JSON entry in `acc.json`. No code changes, no schema changes.
- The **client engine SWF column is empty in every row** if we stay on `--developer`-only distribution (current project pattern). Production-public players would need a SWF whitelist patch in B/C/D/E, but that is deliberately out of scope here.
- The **architecture does not change** for unit additions. The client engine's entity/ability system already handles arbitrary class IDs. We are feeding it data, not extending it.
- **"Do we need to extend the client based on BS1/2/3 enhancements?"** — No. The client engine is the same family across BS1, BS2, BS3, and Factions. Class defs and abilities use the same conceptual schema. BS3's `character_classes.json` is plain JSON inside zlib; Factions' is AMF3 inside zlib (verified at `PlanAddNewUnits.md:122`). The translation cost is in the **data**, not the **engine**. Only outlier: BS3 portrait `.clip` files use a different on-disk format than Factions (`findings_unit_extensibility.md:197`) — they have to be re-authored or stood-in.

---

## 2. Spearman — end-to-end, smallest workable path

### 2.0 Gate check: is `spearman` already in `character_classes.json.z`?

This is the single decision that routes everything else. Two cheap, complementary checks:

**Check 1 — JPEXS binary search** (5 min, conclusive):
- Open `C:\Program Files (x86)\Steam\steamapps\common\the banner saga factions\assets\common\character\character_classes.json.z` in JPEXS Free Flash Decompiler (already documented in `bsf-server/misc/findings_bs_modding.md` Phase 2).
- Use JPEXS's search bar at the bottom — search for literal string `spearman`.
- **Hit** → class def exists → take path 2.1A.
- **No hit** → class def missing → take path 2.1B.

**Check 2 — live integration probe** (10 min, corroborates):
- Add a `spearman_base` `PurchasableUnitData` entry to `bsf-server/data/acc.json` with `cost: 9990`. Use `axeman_base` (an existing rank-1 raider) as a structural template.
- `start-server.bat` to restart.
- Launch Factions with `--developer` in Steam launch options.
- Login.

> **`--developer` has to be the last run-mode option on the line, or it is cancelled.** All six of them write one setting and the last one wins. **None of the `launch-game-*.ps1` scripts qualify** — every one of them puts `--versus_start` after `--developer`, which both cancels it and sends the client to the match search instead of the town. For a versus test that needs developer mode, put `--versus_start` early and `--developer` last: the request for a match is never taken back, so you get both, arriving at the main menu and reaching the match search in one click. *(Measured in the running game on 2026-09-05.)* See [`docs/Development.md`](../docs/Development.md) → *Which screen a launch command lands on*.

- **Success** (path 2.1A): Mead Hall shop shows spearman with portrait and price; the tutorial intro does **not** replay.
- **Failure** (path 2.1B): Login appears to complete, but the tutorial intro replays. Server log shows `[ACCOUNT_INFO]` lines, but the client never registers `completed_tutorial=true`. (Same symptom as the 2026-05-25 incident.)

**Safety rail — the `cost: 9990` sentinel**:
> The project established `cost: 9990` as a "not yet implemented" sentinel in commit `d9277db` (used by all 9 current dredge entries). With this cost, no normal player can accidentally buy the unit — the swallow-bug risk is contained to whoever is running the dev build. Do **not** lower cost below 9990 until both the gate check and the full verification loop (§2.3) pass.

**Why both checks?** Check 1 tells us definitively whether the registry has the class. Check 2 tells us whether the rest of the pipeline (server payload, client parser, UI render) actually works end-to-end with that class. Even if Check 1 hits, Check 2 catches surprises (e.g., the class def exists but with an incomplete stat block, or `RunMode.isClassAvailable` is more aggressive than expected). Running them in this order means we know **what** to fix before we try to fix it.

### 2.1A Path: class def already exists

If gate check shows `spearman` in the registry:
- `--developer` launch already bypasses `RunMode.isClassAvailable()` — spearman shows up in the shop for any dev-launched client. No further binary edits needed.
- Verify §2.3 below. If it passes, lower `cost: 9990 → 25` in `acc.json` (rank-2 base unit pricing per `PlanAddNewUnits.md:24` Phase 1 table — but adjust based on what RANK the gate check reveals; spearman is likely rank 1, so `cost: 0` matching the existing base archers/axemen makes more sense).
- For non-developer public players, a SWF patch to `engine/core/RunMode.as:39-66` `available_classes` Dictionary is required. This is deferred per the project's "no SWF recompile unless absolutely needed" rule.

### 2.1B Path: AMF3 inject the class def

If gate check shows `spearman` is missing from the registry, inject it:

**Template donor**: Use `axeman` (not `archer`). Reasoning:
- Same `partyTag: "raider"` → the existing `partyTagLimits` entry (`raider: 3`) already covers it. No Phase 2c-style party-tag edit needed.
- Same RANK 1 base → no extra stat-range math.
- Same six-icon + portrait shape — Factions ships exactly that layout for both classes.

**Fields the new entry must carry**, mirroring the axeman block:

| Field | Spearman value | Why it matters |
|---|---|---|
| Class key (`entityClass`) | `spearman` | Opaque string the server passes through `acc.json`. |
| `partyTag` | `raider` | Reuses existing 3-slot limit. |
| `stats[]` (ranges + base values for RANK/RANGE/EXERTION/WILLPOWER/MOVEMENT/ARMOR_BREAK/STRENGTH/ARMOR/ABILITY_0/1/2) | Copy axeman ranges as starting baseline; refine to BS3 spearman values if desired. The `clampStats` log trick from `findings_unit_extensibility.md:215-220` will reveal mismatches if values are wrong. | Without ranges, `clampStats` normalises everything to 0 and the unit is unplayable. |
| `abilities[]` (`abl_*` IDs) | Cross-check each ID against `_ability_index.json.z`. Substitute any unknown ID with the closest axeman ability — full ability port is out of scope here. | `AbilityDefFactory.fetch()` throws on unknown abilities at battle start (`findings_unit_extensibility.md:111-115`). |
| Portrait link | Point at spearman's own `spearman.portrait.swf` and the standard clip ID. **Factions ships this file** (verified 2026-05-28) — no stand-in needed, unlike dredge_stoneguard. | Without a portrait link, Proving Grounds page hangs (per `findings_unit_extensibility.md:200-208`). |
| Back / promote / versus icon links | Point at `spearman.icon.init.active.png`, `.init.order.png`, `.roster.png`, `.party.png` (and `.promotion`, `.versus` if present). All confirmed shipped 2026-05-28. | Mead Hall, roster, party-row, and versus UI all consume these. |
| `appearance_index` | `0` (matches `_v0` portrait clip convention). | Standard. |

**Tool**: JPEXS Free Flash Decompiler. Workflow:
1. Back up: `Copy-Item character_classes.json.z character_classes.json.z.bak-spearman` (keeps `.orig` baseline untouched).
2. Open `character_classes.json.z` in JPEXS.
3. Duplicate the axeman class block; rename to `spearman`; edit the fields above.
4. Save — JPEXS handles AMF3 + zlib round-trip. This is the **same workflow that succeeded** for the dredge_stoneguard portrait-link edit and the Phase 2c `partyTagLimits` edit (`Plan-Phase2c-Dredge-Party-Tag.md` precedent).
5. Re-open and search for `spearman` to confirm round-trip succeeded.

**Why JPEXS and not a Node script?** The project has working precedent for JPEXS edits (two prior successful Mods). No Node AMF3 round-trip script exists today — Phase 3 Step 0 (`PlanAddNewUnits.md:138-146`) deferred that and the `findings_amf3_roundtrip.md` file was never created. Writing one is its own project (see §4). Don't conflate it with spearman.

### 2.2 Server-side change (applies to both 2.1A and 2.1B)

**File**: `bsf-server/data/acc.json`. Append one entry to `purchasable_units.units[]`:

```json
{
  "class": "tbs.srv.data.PurchasableUnitData",
  "def": {
    "class": "tbs.srv.data.EntityDef",
    "id": "spearman_base",
    "entityClass": "spearman",
    "autoLevel": 1.0,
    "stats": [
      { "class": "tbs.srv.data.Stat", "stat": "RANK", "value": 1 },
      { "class": "tbs.srv.data.Stat", "stat": "RANGE", "value": 3 },
      { "class": "tbs.srv.data.Stat", "stat": "EXERTION", "value": 1 },
      { "class": "tbs.srv.data.Stat", "stat": "ABILITY_0", "value": 0 },
      { "class": "tbs.srv.data.Stat", "stat": "WILLPOWER", "value": 3 },
      { "class": "tbs.srv.data.Stat", "stat": "MOVEMENT", "value": 3 },
      { "class": "tbs.srv.data.Stat", "stat": "ARMOR_BREAK", "value": 2 },
      { "class": "tbs.srv.data.Stat", "stat": "STRENGTH", "value": 12 },
      { "class": "tbs.srv.data.Stat", "stat": "ARMOR", "value": 8 }
    ]
  },
  "limit": 0,
  "cost": 9990,
  "comment": "stats_estimated_pending_clampStats"
}
```

(Stat values are estimates — clamp-log will reveal real values, mirroring the dredge `findings_unit_extensibility.md:215-238` pattern.)

**No code changes** to `account.ts` are needed. Verified at `bsf-server/src/services/account.ts:9` — the file is read once at import, and at `:64` the cached object is emitted verbatim with no validation. Server restart picks up the new entry.

### 2.3 Verification loop

In order:
1. `yarn test` green (server tests unaffected; `account.test.ts:45` only asserts the property exists).
2. `start-server.bat` (always — running stale build is the #1 "my change isn't working" cause per `bsf-server/CLAUDE.md`).
3. Launch Factions with the `--developer` Steam launch option, **last on the line** (see the note in §2.1).
4. Login → tutorial intro does **NOT** replay → confirms `accountInfo` parsed cleanly.
5. Mead Hall → spearman appears with portrait and `9990` cost.
6. Hire one (manually fund 9990 renown via dev console, or temporarily set `cost: 0`, hire, set back to `9990`).
7. Roster shows the unit; Proving Grounds page loads (does not hang on portrait counter).
8. Drag spearman to a party row → counter reads `1 / 3` (raider tag).
9. Run a 1v1 versus match against a second client that is really in developer mode (`--versus_start` early, `--developer` last — a launcher script will not do it) → no DJB hash divergence at turn 0; spearman takes at least one movement turn and one attack action without freeze.
10. Watch the server log for `clampStats` lines on the second client; correct any out-of-range stat values in `acc.json` (per the proven dredge stat-extraction pattern).
11. Only after all 10 pass: lower `cost: 9990 → 0` (or appropriate value), remove the `comment` field.

---

## 3. Dredge cleanup (remaining Phase 2b work)

Status per `findings_unit_extensibility.md:259-267` and the Phase 2c update:
- ✓ `dredge_stoneguard` is fully unblocked (hand-edit portrait link, Phase 2c party-tag fix shipped 2026-05-11, stat bump 2026-05-11).
- ✓ All 9 dredge entries have correct stats in `acc.json` as of 2026-05-10 (item 1 of pending list).
- ✓ Comment markers removed (item 4).
- ❌ **Item 2**: Patch `ProvingGroundsPage` in the SWF to handle the no-portrait case (skip missing portraits or treat as already-failed). This is **the only remaining production blocker** for the other 8 dredge classes.
- ❌ **Item 3**: Gate-check re-run for the other 8 dredge classes — blocked on item 2.
- ⚠️ Phase 2d open: `abl_slagandburn` freezes mid-battle; workaround is to avoid the ability while dredge is in play.

**Recommended approach for the remaining 8 dredge classes**:

Two competing paths:

**Path 3A — replicate the dredge_stoneguard hand-edit pattern (cheap, data-only)**. Apply the same `character_classes.json.z` portrait-link stand-in to each of the other 8 dredge classes — point each at an existing Factions portrait (axeman/thrasher_v0 for melee dredge; bowmaster for slingers). This is the same edit-pattern proven to work on dredge_stoneguard. Requires no SWF recompile. Per-class effort: ~10 min in JPEXS each, so ~80 min total. Risk: cosmetic — dredge units show non-dredge portraits in Proving Grounds. Acceptable while `cost: 9990` is in force.

**Path 3B — patch `ProvingGroundsPage` in the SWF (medium, code change)**. Modify the SWF's portrait-counter logic to treat a missing portrait definition as "already failed" rather than waiting for an event that never fires. Fixes all 8 dredge classes at once and any future class without portrait. Requires SWF recompile via JPEXS P-Code editing (`findings_bs_modding.md` Phase 4 Method B). Per the existing findings doc this is "the proper fix"; per project pattern it is "what we avoid unless forced".

**Recommendation**: Path 3A first (replicate the stand-in for all 8). Use Path 3B only if a player path actually needs accurate dredge portraits — which is hypothetical while `cost: 9990` gates them dev-only. This matches the project's "data edits over code edits" principle.

**Phase 2d freeze (slagandburn)**: out of scope for this plan. Treat as a separate ability-port project once the dredge UX is functional.

---

## 4. Phase 3 — One BS3 hero PoC

This is the deferred work from `PlanAddNewUnits.md` §Phase 3. The user wants it scaffolded here.

### 4.0 The required prerequisite — AMF3 round-trip spike

Per `PlanAddNewUnits.md:138-146`, Step 0 is a throwaway Node script that:
- Reads `character_classes.json.z`.
- `zlib.inflate` → AMF3-decode → JS object → AMF3-encode → `zlib.deflate` → bytes.
- Compares input vs output (byte-for-byte if possible; otherwise writes to a test copy of the install and confirms Factions still launches).

If the round-trip succeeds, the Phase 3 hero port is feasible programmatically. If it fails, Phase 3 stays on JPEXS-only edits (slower but proven).

**Why a Node script at all?** JPEXS edits scale poorly. Adding one hero takes ~30 min in JPEXS; adding 20 BS3 heroes takes 10 hours in JPEXS but ~10 min via a script that batches the translation. The script also opens the door to checked-in, repeatable, diff-able mods (you can version-control the JS class defs rather than carrying around a binary patch).

**Tooling candidates** (per existing docs, none confirmed working in this repo):
- `pyamf` (Python) — referenced in `PlanAddNewUnits.md:127` but no working example.
- A custom Node implementation against the AMF3 spec — well-defined format; the spec is online and several open-source JS libraries exist.
- `TBS_Decompiler3.2.3.air` — referenced in `Plan-Phase2c-Dredge-Party-Tag.md:95` as an alternative to JPEXS.

**Recommendation**: Spike with a Node implementation using an existing AMF3 library (e.g., the `amf` npm package, which handles AMF0/3). Allow ~half-day budget. If it works, write findings to `bsf-server/misc/findings_amf3_roundtrip.md` (the path PlanAddNewUnits.md already reserves). If it doesn't, document why and fall back to JPEXS for Phase 3 work.

### 4.1 Pick a hero

Candidates per `PlanAddNewUnits.md:129`: `iver` (BS3), `juno` (BS3), or any named BS2 character. Selection criteria:
- **Ability overlap with Factions** — heroes whose abilities mostly substitute to existing Factions `abl_*` IDs save the most work. Iver's "Stone Wall" overlaps `abl_shieldwall`; Juno's nature-magic abilities have less overlap and would need ability ports.
- **Art completeness** — BS3 has full portrait + icon + anim files for every playable hero. Cross-check against the BS3 install before committing.
- **Lore "fit"** — Iver fits Factions' Raider-class ecosystem more naturally than Juno's mage archetype.

**Suggested first hero**: Iver. Lowest expected ability-port work, strongest visual fit, clear stat-translation path (BS3 stats line up with Factions stats nearly 1:1).

### 4.2 Translate the class entry

For each hero ported:
1. Extract BS3's `character_classes.json` (plain JSON inside zlib) → find the chosen hero's class block.
2. Map BS3 fields to Factions AMF3 schema (use an existing Factions class as the structural target).
3. Drop BS3-only stat types that Factions' `StatType.as` enum doesn't recognise. `StatType.parse()` throws on unknown stat strings (`findings_unit_extensibility.md:79-84`).
4. Substitute or carry over abilities per the ability strategy below.

### 4.3 Ability strategy

Per `PlanAddNewUnits.md:131-132`: cheapest-first.
- For every ability the hero uses, check if the same `abl_*` ID exists in Factions' `_ability_index.json.z`.
- **Free**: hit — use as-is.
- **Cheap**: no hit — substitute with the closest Factions ability (cosmetic compromise).
- **Expensive**: no hit and no acceptable substitute — port the ability definition. Separate sub-plan; watch the `AMOUNT` vs `DAMAGE` variable trap from `findings_bs_modding.md:18`. Defer until a hero genuinely needs a ported ability.

### 4.4 Asset port

- **PNG icons** (`icon.init.active`, `init.order`, `roster`, `party`, `promotion`, `versus`) — copy directly from BS3 install to Factions install. Format-compatible.
- **anim.json.z / vfx.json.z / sound.json.z** — copy directly; verify load. May need format inspection.
- **Portrait** — BS3's `.portrait.clips` format is incompatible with Factions' `_v0.portrait/portrait.clip` → `_v0.portrait.swf` chain (per `findings_unit_extensibility.md:197-198`). Two options:
  - **Re-author**: extract the portrait SWF and re-package as Factions-compatible. Out of scope here.
  - **Stand-in**: point the AMF3 portrait link at an existing Factions character's `portrait.swf` (precedent: dredge_stoneguard used axeman/thrasher_v0). Cosmetic-only compromise.

### 4.5 Server + RunMode + Verification

- `acc.json` entry at `cost: 9990` (same pattern).
- `--developer` launch bypasses RunMode whitelist (no SWF patch).
- Verification matches §2.3 plus a "Step 0 round-trip cleanly loads" check.

---

## 5. Repeatable Playbook — `bsf-server/misc/findings_add_new_unit_process.md`

After spearman §2 is verified working (or after the AMF3 spike for Phase 3), write this doc. Single-file cookbook. The plan agent's output drafted the content; abbreviated outline below — final draft happens during execution.

**Structure of the playbook doc**:

1. **Asset audit** — the eight-file minimum (six icons + portrait + anim/vfx/sound). PowerShell `Get-ChildItem ... -Filter "<class>.*"` one-liner. List which are mandatory vs optional. Document the four-icon convention (init.active / init.order / roster / party).
2. **Class registry check** — How to search `character_classes.json.z` in JPEXS for a class ID. Why a "no hit" is dangerous (the swallow bug).
3. **Class-def AMF3 injection** — template selection rules (match partyTag + base rank). Required fields. Portrait link convention (`<class>_v<appearance_index>.portrait/portrait.clip`).
4. **partyTagLimits update** — when needed (new partyTag only). Phase 2c precedent.
5. **RunMode whitelist** — `--developer` for dev/test; SWF patch for production.
6. **Ability registry check** — `_ability_index.json.z` lookup. Substitute vs port decision.
7. **Server-side `acc.json`** — entry template, `cost: 9990` sentinel rule.
8. **Asset sourcing waterfall** (the user's explicit question):
   - **Tier 1 — Factions install**. Many "removed" classes (spearman, lancer, wardog) ship full assets. Always check first.
   - **Tier 2 — BS1 / BS2 / BS3 installs**. Same engine family. PNG icons + animation .json.z files copy cleanly. Verified 2026-05-28 that BS1/BS2/BS3 each ship 12+ spearman files and 23+ lancer files (`bandit_lancer`, `bandit_lancer_ally` variants in addition to `lancer_v0`).
   - **Tier 3 — Same-class fallback**. Use a sibling class's icons (precedent: BS3 `dredge_hurler_ally` used for all four slinger variants per `findings_unit_extensibility.md:182-188`).
   - **Tier 4 — Stand-in donor**. Point portrait link at an existing Factions portrait (precedent: axeman/thrasher_v0 for dredge_stoneguard).
   - **Tier 5 — AI generation (Claude design, image gen tools)**. Last resort. Constraint: portraits use Factions' SWF clip format which is not trivially generatable. Icons (PNG) are doable but art-style match is hard. Document and approve case-by-case.
9. **Verification loop** — the 10-step gate from §2.3.
10. **The swallow-bug warning** — the 2026-05-25 lesson, prominently. Always `cost: 9990` until verified.

---

## 6. Critical files

### To be modified
- `C:\Users\rleyb\Code\BSF\bsf-server\data\acc.json` — append spearman_base entry; later, modify dredge cost; later, add BS3 hero entry.
- `C:\Program Files (x86)\Steam\steamapps\common\the banner saga factions\assets\common\character\character_classes.json.z` — gate check (read-only); if §2.1B path, AMF3 inject spearman class def; later, similar work for BS3 hero.
- `C:\Users\rleyb\Code\BSF\bsf-server\misc\findings_add_new_unit_process.md` — **new file** (the playbook).
- `C:\Users\rleyb\Code\BSF\bsf-server\misc\findings_amf3_roundtrip.md` — **new file**, only if/when Phase 3 spike runs.

### Read-only references (existing prior art)
- `C:\Users\rleyb\Code\BSF\bsf-server\misc\findings_unit_extensibility.md` — full audit, complete unit list, hardcoded blockers.
- `C:\Users\rleyb\Code\BSF\bsf-server\misc\Plan-Phase2c-Dredge-Party-Tag.md` — last successful AMF3 edit blueprint.
- `C:\Users\rleyb\Code\BSF\bsf-server\misc\PlanAddNewUnits.md` — three-phase master plan including the 2026-05-25 lesson learned.
- `C:\Users\rleyb\Code\BSF\bsf-server\misc\findings_bs_modding.md` — JPEXS workflow.
- `%USERPROFILE%\Code\BSF\bsf-server\misc\BannerSagaDeveloperCheatsheet.md` — `--developer` flag, dev console hotkeys.
- `C:\Users\rleyb\Code\BSF\bsf-server\src\services\account.ts:9-69` — confirms server emits PURCHASABLE_UNITS verbatim with no validation.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\core\RunMode.as:39-66` — the whitelist; reference only.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\entity\def\EntityClassDefList.as` — the registry the gate check queries; reference only.

### Asset sources (read-only)
- `C:\Program Files (x86)\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman.*` — confirmed shipped 2026-05-28.
- `C:\Program Files (x86)\Steam\steamapps\common\tbs\assets\common\character\` — BS1.
- `C:\Program Files (x86)\Steam\steamapps\common\tbs2\assets\common\character\` — BS2.
- `C:\Program Files (x86)\Steam\steamapps\common\tbs3\assets\common\character\` — BS3.

---

## 7. Recommended execution order

Sequenced to maximise information value per minute spent.

1. **§2.0 gate check** (Check 1 via JPEXS, then Check 2 via live integration). Tells us in ~15 min whether we're in the cheap path (2.1A) or the AMF3-inject path (2.1B). _This is the first chunk to bring back for approval._
2. **§2.1A or §2.1B** depending on gate check outcome. Each needs its own approval cycle per the project's working-style rule (`CLAUDE.md`).
3. **§2.2 + §2.3 verification** for spearman. Confirm everything green.
4. **§5 playbook doc** — now that we've walked the process once, write `findings_add_new_unit_process.md` capturing what worked. Separate approval.
5. **§3 dredge cleanup (Path 3A)** — replicate the stoneguard stand-in pattern for the other 8 dredge classes. Iterate one class at a time; each is its own ~10-min edit.
6. **§4.0 AMF3 round-trip spike** — half-day budget. Produces `findings_amf3_roundtrip.md`. Separate approval.
7. **§4 BS3 hero PoC** — only if §4.0 succeeds, otherwise descope to JPEXS-only and re-plan. Pick iver. Translate, port assets, inject, verify. Separate approval.

Each numbered step ends in a "is this working?" gate before the next step starts. No batch approvals — per the user's working-style rule, every file edit is announced before it is made, with the user replying `y` to approve.

---

## 8. Tradeoffs and risks

- **Distribution gap**. All work in this plan is asset/data edits applied to the local Steam install. Other players who install Factions fresh see none of it. Acceptable while every new entry is gated behind `cost: 9990`; becomes a distribution problem if/when public release happens (deferred per Phase 3 master plan).
- **Acc.json swallow-bug is silent**. The 2026-05-25 incident is the central risk. Mitigation: gate check first, `cost: 9990` sentinel always until verified.
- **JPEXS save risk**. JPEXS saves overwrite the file. Always make a per-task `.bak-<unit>` backup before saving. The `.orig` baseline is already in place and not touched.
- **Stat-balance is judgement**. Suggested stat templates from sibling classes are conservative starts. Easy to retune with another `acc.json` edit. Real ranges revealed by `clampStats` log lines (the proven dredge-stat-extraction pattern).
- **Power-level mismatch race**. Adding higher-rank purchasables widens the power spread in matchmaking. Pre-existing bug per `Codebase-Review-Findings-2026-05-07.md` §3.3 — flag it, do not block this plan on it.
- **BS3 portrait format incompatibility (Phase 3 only)**. Re-authoring portraits is out of scope; stand-in donor approach is the working fallback. Cosmetic-only impact.
- **Single-developer dependency** (per persistent memory). All this work is currently bus-factor-1. The playbook doc partially mitigates by encoding the process so a future contributor can pick it up.

---

## 9. End-to-end verification (whole plan)

- **§2 spearman complete** when §2.3's 10 checks pass and the post-fix `acc.json` shows the production cost (not `9990`).
- **§5 playbook complete** when `findings_add_new_unit_process.md` exists, walks a new contributor through adding a class start-to-finish, and references the spearman experience as the worked example.
- **§3 dredge cleanup complete** when all 9 dredge entries pass a versus-match smoke test, no Proving Grounds hang on any of them, and `cost: 9990` is lowered (or a deliberate decision is made to keep them at 9990 with a recorded reason).
- **§4 BS3 hero PoC complete** when one hero (Iver suggested) fights a full Factions versus match between two clients that really are in developer mode (`--versus_start` early, `--developer` last — a launcher script will not do it) without DJB divergence, and `findings_bs3_unit_port_feasibility.md` is written.
