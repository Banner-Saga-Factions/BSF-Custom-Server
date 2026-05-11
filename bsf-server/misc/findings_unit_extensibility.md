# BSF Unit & Ability Extensibility Findings
_Researched 2026-05-05_

## Key Discovery: Asset Files Are External, Not Embedded in SWF

Entity class defs and ability defs load from external compressed binary files
in the game's `../assets/` directory at runtime. **No SWF recompile needed**
to use any class or ability already defined in those files.

- Class defs: `common/character/character_classes.json.z` (AMF3 binary, zlib-compressed)
- Ability defs: `common/ability/_ability_index.json.z` (index + per-ability files via `refs[]`)

---

## Complete Unit Class List (from `character_classes.json.z`)

### Playable human/varl classes (have portrait assets → appear in Great Hall UI)

| Class ID        | Role                  | In acc.json purchasables? |
|-----------------|-----------------------|---------------------------|
| `archer`        | Base ranged           | Yes                       |
| `axeman`        | Base melee            | Yes                       |
| `warrior`       | Base heavy melee      | Yes                       |
| `shieldbanger`  | Base tank             | Yes                       |
| `spearman`      | Base reach            | **NO — missing**          |
| `thrasher`      | Rank 2 axeman         | Yes (starting roster)     |
| `backbiter`     | Rank 2 axeman         | Yes (starting roster)     |
| `siegearcher`   | Rank 2 archer         | Yes (starting roster)     |
| `skystriker`    | Rank 2 archer         | Yes (added 2026-05-09)    |
| `warmaster`     | Rank 2 warrior        | Yes (starting roster)     |
| `wardog`        | Rank 2 warrior        | **NO — missing**          |
| `warleader`     | Rank 2 warrior        | Yes (added 2026-05-09)    |
| `shieldmaster`  | Rank 2 shieldbanger   | Yes (starting roster)     |
| `provoker`      | Rank 2 shieldbanger   | Yes (added 2026-05-09)    |
| `lancer`        | Rank 2 spearman       | **NO — missing**          |
| `axemaster`     | Rank 3 axeman         | Yes (added 2026-05-09)    |
| `bowmaster`     | Rank 3 archer         | Yes (starting roster)     |
| `warhawk`       | Rank 3 warrior        | Yes (added 2026-05-09)    |
| `strongarm`     | Rank 3 shieldbanger   | Yes (added 2026-05-09)    |

### Dredge/enemy classes (no portrait — can't appear in roster UI as-is)

`dredge_grunt`, `dredge_torpor`, `dredge_stoneguard`, `dredge_bellower`,
`dredge_scourge`, `dredge_slag_slinger`, `dredge_fire_slinger`,
`dredge_doom_slinger`, `dredge_sun_slinger`

All dredge have combat assets (anim, icon, sounds, vfx) but no portrait.
They would function in battle but can't be shown in the Great Hall roster screen.

**acc.json purchasable status (as of 2026-05-09):**
`dredge_stoneguard_base` and `dredge_bellower_base` were already in `acc.json` with cost 0.
Seven new entries were added: `dredge_grunt_base`, `dredge_torpor_base`, `dredge_slag_slinger_base`,
`dredge_scourge_base`, `dredge_fire_slinger_base`, `dredge_doom_slinger_base`, `dredge_sun_slinger_base`.
All 9 dredge entries have `cost: 9990` (the "not yet implemented" sentinel from commit d9277db).
Stats are estimated — see Phase 2b section below for the real values extracted from `clampStats` errors.

### Tutorial-only (no portrait)
`tutorial_raider`, `tutorial_chieftain`

---

## Extensibility Effort Matrix

| Feature                                      | What it takes                                              |
|----------------------------------------------|------------------------------------------------------------|
| Add whitelisted classes to the shop          | Edit `data/acc.json` only — zero server or client changes  |
| Add non-whitelisted classes to the shop      | **SWF recompile** — add to `RunMode.isClassAvailable()`    |
| Use any existing class in a user's roster    | Edit `acc.json` or direct `roster_json` DB edit            |
| Add a brand-new class with new art           | Edit binary `character_classes.json.z` + add art files     |
| Add or modify an ability                     | Edit `common/ability/_ability_index.json.z` + ability files|
| Add a new stat type (e.g. MORALE)            | **Requires SWF recompile** — `StatType.as` enum is hard    |
| Party size > 6                               | Server `roster.ts:17` + `account.ts:59` + SWF recompile   |
| Rank cap > 3                                 | Server `roster.ts:48` only (one-line change)               |

---

## Hardcoded Limits (still real blockers)

### StatType enum — sharpest edge
File: `engine/stat/def/StatType.as:18-22`
Only 3 ability-slot stats exist: `ABILITY_0`, `ABILITY_1`, `ABILITY_2`.
`Enum.parse(StatType, stat_string)` **throws** on any unrecognized string —
if you send an unknown stat in roster JSON the client fails to deserialize the unit.
Adding `ABILITY_3` or any new stat type requires recompiling the SWF.

### Party size = 6
- Server: `roster.ts:17` and `account.ts:59`
- Client UI: `GuiGreatHall.as:180`, `VsMonitor.as:265`

### Rank cap = 3
- Server only: `roster.ts:48`
- Cost table hardcoded: `rankStat.value === 1 ? 20 : 80`

### RunMode shop whitelist — blocks spearman, lancer, wardog
File: `engine/core/RunMode.as:39-66`
`PurchasableUnits.update()` calls `config.runMode.isClassAvailable(entityClass)` for
every entry the server sends. Any class not in the hardcoded `available_classes` Dictionary
is silently skipped before it reaches the UI. The full whitelist as shipped:

```
warhawk, provoker, skystriker, thrasher, backbiter, siegearcher,
archer, axeman, shieldbanger, warrior, strongarm, warmaster,
bowmaster, axemaster, shieldmaster, warleader
```

**Not whitelisted** (blocked from shop without SWF recompile): `spearman`, `lancer`, `wardog`

`DEVELOPER` RunMode bypasses this check entirely (`developer=true` returns `true` for any class).
Adding a new class to the shop requires patching this dictionary and recompiling the SWF.

### AbilityDefFactory.fetch() throws on unknown ability IDs
File: `engine/ability/def/AbilityDefFactory.as:47-50`
New ability IDs must be registered in the external ability index file.
If missing, client throws at battle start.

---

## Immediate Low-Hanging Fruit

### 6 classes: acc.json edit only (whitelisted by client) — DONE 2026-05-09

These classes have full art assets and pass the `RunMode.isClassAvailable()` check —
adding an `acc.json` entry is all that's needed:

```
skystriker   warleader   provoker   axemaster   warhawk   strongarm
```

**Status: shipped 2026-05-09.** All six are now `PurchasableUnitData` entries in
`bsf-server/data/acc.json` under `purchasable_units.units[]` (`*_base` ids; rank-2
units cost 25 renown, rank-3 units cost 100). Verified in-game on 2026-05-09:
units appear in the Great Hall shop, can be hired, and fight in versus matches
without DJB hash divergence.

### 3 classes: SWF recompile required (not whitelisted)

These classes have full art assets but are absent from the `RunMode` whitelist.
The client silently skips them even when the server sends them. They need a SWF
patch (`engine/core/RunMode.as:44-60`) before an `acc.json` entry will have any effect:

```
spearman   lancer   wardog
```

---

## Protocol Notes

- `entityClass` is an opaque string — server never validates it
- Stats are a free-form array; server only inspects `RANK` by name
- `AbilityDefLevels` uses dynamic `Vector<>` — no hardcoded 3-ability limit
  in the collection class itself; the 3-slot limit comes from `StatType` only
- Party sent as simple string ID array, max enforced server-side

---

## Phase 2b: Dredge Purchasables — Findings (2026-05-09)

### Asset gaps in the Factions install

Dredge ships with only two icon variants. Human classes ship four:

| File | Human classes | Dredge |
|---|---|---|
| `icon.init.active.png` | ✓ | ✓ |
| `icon.init.order.png` | ✓ | ✓ |
| `icon.roster.png` | ✓ | **missing** (filled with placeholders — see below) |
| `icon.party.png` | ✓ | **missing** (filled with placeholders — see below) |

The client requests `icon.roster.png` and `icon.party.png` when rendering the roster screen and the
Proving Grounds unit strip. Missing files produce `IOError #2032` and are logged but not fatal on their
own.

**Placeholders installed (2026-05-09) for all 9 dredge classes** at:
```
<Factions install>\assets\common\character\dredge\dredge_<unit>.icon.roster.png
<Factions install>\assets\common\character\dredge\dredge_<unit>.icon.party.png
```

Icon sources, by class:

| Class | roster/party icon source |
|---|---|
| `dredge_stoneguard` | `dredge_stoneguard_ally` from BS3 (real ally artwork) |
| `dredge_slag_slinger` | `dredge_hurler_ally` from BS3 (real ally artwork) |
| `dredge_fire_slinger` | `dredge_hurler_ally` from BS3 (real ally artwork) |
| `dredge_doom_slinger` | `dredge_hurler_ally` from BS3 (real ally artwork) |
| `dredge_sun_slinger` | `dredge_hurler_ally` from BS3 (real ally artwork) |
| `dredge_bellower` | `dredge_bellower.icon.init.active.png` (same-unit copy) |
| `dredge_grunt` | `dredge_grunt.icon.init.active.png` (same-unit copy) |
| `dredge_torpor` | `dredge_torpor.icon.init.active.png` (same-unit copy) |
| `dredge_scourge` | `dredge_scourge.icon.init.active.png` (same-unit copy) |

BS3 ships `icon.roster.png` / `icon.party.png` only for its playable ally dredge variants
(`dredge_stoneguard_ally`, `dredge_hurler_ally`, `dredge_stoneguard_ally_preorder`). No roster/party icons exist in BS3 for grunt, torpor, scourge, bellower, or any slinger-base class.

BS3 also has portrait files (`.portrait.clips`) for `dredge_stoneguard_ally` and `dredge_hurler_ally`, but the format is incompatible with Factions (which uses `_v0.portrait/portrait.clip` → `_v0.portrait.swf`).
Portraits cannot be ported by file copy alone.

### Proving Grounds portrait hang — unfixable without SWF recompile

**Root cause:** `ProvingGroundsPage` tracks a "portraits loaded" counter for every unit in the roster.
It only marks the page ready (`PageManager loading=false`) when all counters reach either "loaded" or "explicitly failed." For dredge units, `character_classes.json.z` contains no portrait definition at all — so the client never issues a portrait request, never fires a completion or failure event, and the counter
is stuck. The page hangs indefinitely.

**Attempted workaround:** Create `dredge_<unit>_v0.portrait/portrait.clip` files (portrait clip descriptors) in the install, pointing at an existing portrait SWF. This was tried with warrior's portrait clip. The client still did not attempt any portrait load — it reads the portrait definition from `character_classes.json.z` first, and if none is present it does not fall back to the filesystem. A placeholder on disk is silently ignored.

**Conclusion:** The portrait hang requires patching `ProvingGroundsPage` in the SWF to handle the no-portrait case (either skip missing portraits or treat them as already-failed). Until that patch is made, hiring any dredge unit into a roster blocks access to the Proving Grounds.

**Portrait path convention (for future reference):**
`<entityClass>_v<appearance_index>.portrait/portrait.clip`
The `_v0` suffix comes from `appearance_index: 0` in the entity def. Example:
`dredge_stoneguard_v0.portrait/portrait.clip`. The clip descriptor is a zlib-compressed AMF3 binary containing an absolute URL to a `.swf` and a clip ID within it.

### Stat extraction via `clampStats` errors — no AMF3 parser required

When the server sends stat values outside the valid range defined in `character_classes.json.z`, the
client logs: `<entityClass> <STAT> <our_value> was out of range <min>,<max>`. When min == max the stat
is fixed. This makes `clampStats` errors a free readout of the real stat ranges without needing to
write an AMF3 parser.

**Real stat values for the 7 new dredge classes** (extracted from client log, 2026-05-09):

| entityClass | RANK | RANGE | EXE | WP | MOV | AB | STR | ARM |
|---|---|---|---|---|---|---|---|---|
| dredge_grunt | 1 | 1 | 1 | 1 | **4** | 1 | 10 | 10 |
| dredge_torpor | **4** | 1 | **2** | **4** | 3 | **5** | **20** | **16** |
| dredge_scourge | 3 | 1 | **1** | 3 | 4 | 3 | 16 | 14 |
| dredge_slag_slinger | **1** | **1** | 2 | 2 | **3** | 2 | **9** | **7** |
| dredge_fire_slinger | 3 | **1** | **1** | 3 | **3** | **2** | **9** | **8** |
| dredge_doom_slinger | 4 | **1** | **1** | **6** | **3** | **3** | **16** | **12** |
| dredge_sun_slinger | 4 | **1** | **1** | 4 | **3** | **3** | **10** | **8** |

**Bold** = value differs from the estimate in `acc.json` (as of 2026-05-09). These must be corrected in
`acc.json` before Phase 2b entries are considered implementation-complete and their cost can be lowered
from 9990. The client clamps stats at runtime anyway, so the wrong values don't produce wrong gameplay —
they just make the acc.json misleading.

**Update 2026-05-10:** all bold values were corrected in `acc.json`; the `stats_estimated` comment markers were removed at the same time. The bold markers in the table above are kept as a historical record of where the 2026-05-09 estimates diverged from the real values.

**Notable surprises:**
- `dredge_torpor` is rank 4 (not rank 2 as estimated) — it is the dredge heavy, equivalent to bellower.
- `dredge_slag_slinger` is rank 1 and melee-ranged (RANGE 1, not 2) — weaker than estimated.
- All three slingers are melee-ranged (RANGE 1); the "slinger" name is misleading.
- `dredge_torpor` has the highest STR (20) and ARM (16) of any dredge class — equal to bellower.

### Gate check status (Phase 2b, 2026-05-09)

The gate check (step 1 of Phase 2b plan) was not fully completed:
- `dredge_stoneguard` was hired and deployed to the roster.
- Proving Grounds failed to load (portrait hang — see above).
- The test DB was deleted and recreated fresh to recover normal operation.
- No versus match test was completed for dredge.

**Phase 2b is blocked on the Proving Grounds portrait hang.** The acc.json entries are safe to leave in
place at `cost: 9990` — normal players cannot accidentally buy them. The hang only affects whoever
manually edits the DB or uses a developer tool to put a dredge unit in their roster.

### Pending work before Phase 2b can be called complete

1. ✓ done 2026-05-10 — Fix the 7 stat values in `acc.json` listed above (bold cells in the table).
2. Patch `ProvingGroundsPage` in the SWF to handle the no-portrait case (skip or treat as failed).
3. Re-run the gate check: hire a dredge unit via `--developer`, open Proving Grounds (should load),
   deploy in vs match, confirm no DJB divergence.
4. ✓ done 2026-05-10 — Remove `"comment": "stats_estimated"` from each entry after step 1 is done.

Items 2 and 3 remain blocking before cost can drop below 9990.
