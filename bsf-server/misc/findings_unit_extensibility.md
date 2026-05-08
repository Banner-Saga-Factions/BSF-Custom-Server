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
| `skystriker`    | Rank 2 archer         | **NO — missing**          |
| `warmaster`     | Rank 2 warrior        | Yes (starting roster)     |
| `wardog`        | Rank 2 warrior        | **NO — missing**          |
| `warleader`     | Rank 2 warrior        | **NO — missing**          |
| `shieldmaster`  | Rank 2 shieldbanger   | Yes (starting roster)     |
| `provoker`      | Rank 2 shieldbanger   | **NO — missing**          |
| `lancer`        | Rank 2 spearman       | **NO — missing**          |
| `axemaster`     | Rank 3 axeman         | **NO — missing**          |
| `bowmaster`     | Rank 3 archer         | Yes (starting roster)     |
| `warhawk`       | Rank 3 warrior        | **NO — missing**          |
| `strongarm`     | Rank 3 shieldbanger   | **NO — missing**          |

### Dredge/enemy classes (no portrait — can't appear in roster UI as-is)

`dredge_grunt`, `dredge_torpor`, `dredge_stoneguard`, `dredge_bellower`,
`dredge_scourge`, `dredge_slag_slinger`, `dredge_fire_slinger`,
`dredge_doom_slinger`, `dredge_sun_slinger`

All dredge have combat assets (anim, icon, sounds, vfx) but no portrait.
They would function in battle but can't be shown in the Great Hall roster screen.

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

### 6 classes: acc.json edit only (whitelisted by client)

These classes have full art assets and pass the `RunMode.isClassAvailable()` check —
adding an `acc.json` entry is all that's needed:

```
skystriker   warleader   provoker   axemaster   warhawk   strongarm
```

Add each as a `PurchasableUnitData` object in `data/acc.json`
under `purchasable_units.units[]` following the existing pattern.

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
