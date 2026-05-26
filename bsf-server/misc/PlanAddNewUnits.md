# Plan — Add New Units (Three Phases)

## Context

The MVP-Phase1 review (`bsf-server/misc/Codebase-Review-Findings-2026-05-07.md`, Active Goal #1) identifies "6 new units ready via `acc.json` edit only" as immediate low-hanging fruit. Prior research (`bsf-server/misc/findings_unit_extensibility.md`) confirmed the Factions client already ships full art and the `RunMode` shop whitelist for those six classes.

The user wants to extend that work with two follow-ons:
- **Add the rest of the Factions-internal classes** that exist in `character_classes.json.z` but are not currently buyable (specialist tier classes already in starting rosters, plus dredge variants in the same shape as the existing `dredge_stoneguard_base` / `dredge_bellower_base` entries).
- **Bring at least one BS3 (or BS2) hero** into a Factions battle as a proof-of-concept.

**Goals per phase:**
- **Phase 1** — six already-whitelisted Factions classes added as buyables, one-file edit.
- **Phase 2** — every other class defined in Factions' own `character_classes.json.z` added as a buyable where the client can render it; non-whitelisted ones gated behind the `--developer` flag for testing.
- **Phase 3** — single-hero PoC port from BS3 (or BS2) into Factions, using `--developer` to bypass the `RunMode` whitelist; no SWF recompile, no public distribution. Decision on whether to expand happens after the PoC works.

---

## Phase 1 — Six Already-Whitelisted Factions Classes (acc.json only)

### What changes

Append six `PurchasableUnitData` entries to `purchasable_units.units[]` in `bsf-server/data/acc.json` (loaded once at module import in `src/services/account.ts:9`, server restart picks them up).

| entityClass | Tier | Suggested cost | Stat template |
|---|---|---|---|
| `skystriker` | rank-2 archer | 25 | mirror `archer_exp` |
| `provoker` | rank-2 shieldbanger | 25 | mirror `shieldbanger_exp` |
| `warleader` | rank-2 warrior | 25 | mirror `warrior_exp` |
| `axemaster` | rank-3 axeman | 100 | mirror `axeman_vet` |
| `warhawk` | rank-3 warrior | 100 | mirror `warrior_vet` |
| `strongarm` | rank-3 shieldbanger | 100 | mirror `shieldbanger_vet` |

For each entry follow the `wardog` block as the structural template (`acc.json:257-322`). Required fields: unique `id` (e.g., `skystriker_base`), `entityClass` exactly as above, `stats[]` with RANK/RANGE/EXERTION/ABILITY_0=0/WILLPOWER/MOVEMENT/ARMOR_BREAK/STRENGTH/ARMOR (no KILLS/BATTLES on a fresh purchasable), `cost`, `limit: 0`.

### Why this is safe
- **No code change.** `account.ts:30` re-emits `purchasable_units` verbatim; server never validates contents.
- **No DB change.** `purchasable_units` is global static.
- **Tests unaffected.** `test/routes/account.test.ts:45` only asserts the property exists.
- **Client already accepts these classes.** All six are in shipped `RunMode.available_classes` per findings — no SWF recompile.

### Tradeoff / risk
- The two `acc.json` entries that don't actually work today (`spearman`, `wardog`) stay untouched. Findings show both are NOT in the client whitelist; the client silently skips them. Those will be addressed in Phase 2.
- Stat balance for promoted-tier units is judgement; the suggested templates are conservative starts and easy to retune with another `acc.json` edit.

### Critical files
- `bsf-server/data/acc.json` — only file modified.
- `bsf-server/src/services/account.ts:9` — confirms `acc.json` is loaded once at module import (server restart required).

### Verification
1. Restart server (`start-server.bat`).
2. `yarn test` — green.
3. `GET /services/account/info/<session_key>` returns the six new entries inside `purchasable_units.units`.
4. In a running client, Great Hall → shop should show the six with portraits and listed cost.
5. Buy one, deploy in versus, confirm it loads and fights. If a unit deserialises but can't act, suspect `AbilityDefFactory.fetch()` rejecting an unknown ability — roll back the offending entry.

---

## Phase 2 — All Remaining Factions-Internal Classes

Same shape as Phase 1 (one or more `acc.json` edits), but covering everything else defined in Factions' own `character_classes.json.z` that is not yet buyable. Verified ID inventory below was extracted directly from the file.

### 2a. Specialist promotion classes — already whitelisted, currently only seen in starting rosters

These six are in `RunMode.available_classes` and have full portraits/icons/anims. Adding them as purchasables works the same way as Phase 1.

| entityClass | Suggested cost |
|---|---|
| `thrasher` (rank-2 axeman) | 25 |
| `backbiter` (rank-2 axeman) | 25 |
| `siegearcher` (rank-2 archer) | 25 |
| `warmaster` (rank-2 warrior) | 25 |
| `shieldmaster` (rank-2 shieldbanger) | 25 |
| `bowmaster` (rank-3 archer) | 100 |

### 2b. Dredge purchasables — match existing `dredge_stoneguard_base` / `dredge_bellower_base` pattern

Findings flag dredge as "no portrait → can't appear in Great Hall," but `acc.json` already ships two dredge purchasables (`dredge_stoneguard_base` rank 2 cost 0, `dredge_bellower_base` rank 4 cost 0), which suggests the shop tolerates portrait-less entries. We extend that pattern:

| entityClass | Suggested rank | Suggested cost |
|---|---|---|
| `dredge_grunt` | 1 | 0 |
| `dredge_torpor` | 1 | 0 |
| `dredge_scourge` | 3 | 0 |
| `dredge_slag_slinger` | 2 | 0 |
| `dredge_fire_slinger` | 3 | 0 |
| `dredge_doom_slinger` | 4 | 0 |
| `dredge_sun_slinger` | 4 | 0 |

Cost 0 mirrors the existing two; the Great Hall renders these as Mead Hall reward units (the `comment: "mh_experienced"` / `"mh_veteran"` fields on the existing entries hint at this). If the existing two dredge entries actually fail to display, **all of 2b fails the same way** — verify that first before adding the rest.

### 2c. `--developer` flag adds (not whitelisted)

`spearman`, `lancer` are full-featured human classes with art and abilities but absent from `RunMode.available_classes`. With `--developer` flag, the client bypasses the whitelist check (`findings_unit_extensibility.md` and `BannerSagaDeveloperCheatsheet.md`), so we can include them in the purchasable list for development/test play. They will be silently skipped in non-developer clients (matching today's behaviour for `spearman` already in `acc.json`).

`tutorial_raider` and `tutorial_chieftain` exist in `character_classes.json.z` but have no portraits and use tutorial-specific abilities — leave them out unless we have a tutorial-rebuild use case.

> **Lesson learned (2026-05-25):** The plan's claim that spearman is "silently skipped in non-developer clients" was wrong. Adding `"entityClass": "spearman"` to `purchasable_units` caused `EntityDefVars.fromJson()` to throw `ArgumentError("no such entity class: spearman")` rather than silently skipping. The exception is caught inside `AccountInfoTxn` and swallowed, which leaves `config.accountInfo` at its unset default (`completed_tutorial = false`) — making the tutorial appear on every login with no visible error anywhere.
>
> The root cause: spearman is likely absent from the client's `EntityClassDefList` (parsed from `character_classes.json.z`). The `isClassAvailable()` silent-skip only applies to classes that ARE in the class registry but NOT in `RunMode.available_classes`. A class missing from the registry entirely causes a hard throw that breaks the whole account-info flow.
>
> **Before starting Phase 2c:** search the `character_classes.json.z` binary for the literal strings `spearman` and `lancer` to confirm they are present as registered class IDs. If they are absent, Phase 2c requires Phase 3-level AMF3 class injection — not a plain `acc.json` edit. See the GitHub issue "Add spearman as purchasable unit" for the tracking item and decision criteria.

### Verification (Phase 2)

Same loop as Phase 1, with two extra checks:
1. Before adding 2b, restart with the **current** `acc.json` and confirm the existing `dredge_stoneguard_base` and `dredge_bellower_base` entries are visible in the Great Hall shop. If they aren't, 2b is dead on arrival.
2. For 2c, run the client twice — once normally (entries should be silently skipped), once with `--developer` (entries should appear) — to confirm the whitelist gate behaves as expected and we haven't broken the shop UI for non-developer players.

### Risk
- **Power-level mismatch race (`Codebase-Review-Findings-2026-05-07.md` 3.3).** Adding higher-rank purchasables increases the spread; queue power snapshot can diverge from match-time power if a player buys a rank-4 dredge between queue and match. Pre-existing bug — flag it but do not block Phase 2 on it.
- **Renown costs are client-computed (review doc 3.2).** Setting `cost: 0` on dredge purchasables is fine; setting `cost: 25/100` on 2a entries inherits the same client-trust issue every other purchasable already has. No new risk surface.

---

## Phase 3 — One BS3 (or BS2) Hero Into Factions, Developer-Only PoC

**Recommendation: do not start until the AMF3 spike below succeeds.** This is the first phase that touches client binaries.

### Why BS2 is not easier than BS3
Verified directly:
- Factions ships `assets/common/character/character_classes.json.z` as **AMF3 binary** (first bytes `\x0a\x0b\x01\x11metadata...`).
- Both BS2 and BS3 ship the same file as **plain JSON inside zlib** (first bytes `{"classes":[...`).
- The format-incompatibility cost is identical for either source. Pick BS2 vs BS3 on art/lore preference, not technical effort.

### What's actually portable

For one hero to fight in Factions, the minimum work is:
1. **AMF3 read/write spike** — write a Node script (or use `pyamf` / JPEXS) that decompresses Factions' `character_classes.json.z`, parses the AMF3 to a JS object, re-encodes, recompresses, and produces a byte-identical (or semantically identical) output. **If this round-trip fails, Phase 3 is blocked here.**
2. **Translate one BS3/BS2 entry** — pick one hero (suggestion: `iver` from BS3, or `juno` from BS3, or any named character from BS2's `character_classes.json`) — and rewrite it into the Factions AMF3 schema. Stats not in Factions' enum get dropped or mapped. Abilities that don't exist in Factions either substitute to an existing Factions ability (cheap) or get ported as new ability files (full work, see step 5).
3. **Copy BS3/BS2 art** — portrait `.clip`, icon PNGs, `anim.json.z`, `vfx.json.z`, `sound.json.z` from the BS2/BS3 install into the matching path under Factions' `assets/common/character/<class>/`.
4. **Skip the SWF recompile** by relying on the `--developer` command-line flag — `findings_unit_extensibility.md` confirms `RunMode.DEVELOPER` returns `true` from `isClassAvailable()` for any class. PoC players launch with `--developer`; nothing else.
5. **Ability strategy: cheapest-first.** For the chosen hero, list every ability ID it uses. Any that exists in Factions already (`abl_*` from the Factions class file) is free. Any that doesn't, **substitute** with the closest Factions equivalent for the PoC. Only attempt a real ability port if substitution makes the hero feel obviously wrong — and even then, a separate sub-plan covers `_ability_index.json.z` editing and the `AMOUNT`/`DAMAGE` variable trap from `findings_bs_modding.md`.
6. **Server side: one `acc.json` entry** referencing the new `entityClass`. Same structure as Phase 1.

### Distribution model — open question
The user has not decided. For a `--developer`-only PoC, distribution is "the developer runs it locally," which avoids the question for now. Public distribution (mod pack vs installer) is deferred until after Phase 3 proves the approach works.

### Phase 3 Step 0 (do this first, alone)

Write a throwaway Node script that:
- Reads `assets/common/character/character_classes.json.z` from the Factions install.
- `zlib.inflate` → AMF3-decode → JS object → AMF3-encode → `zlib.deflate` → bytes.
- Compares input and output byte-for-byte (or, if framing differs slightly, writes the round-tripped file back into a *test copy* of the install and verifies the Factions client still launches and the existing classes still appear correctly).

If round-trip succeeds: Phase 3 is feasible, proceed to step 1 with a chosen hero.
If round-trip fails: write findings to `bsf-server/misc/findings_amf3_roundtrip.md` and **stop** — the rest of Phase 3 cannot start without this working.

### Verification (Phase 3 PoC)

1. Step 0 round-trip succeeds.
2. Picked hero's class entry decodes cleanly from BS3/BS2 JSON, translates to Factions AMF3, and the modified `character_classes.json.z` loads in Factions without error.
3. Launch Factions with `--developer`; new hero appears in the shop (or roster, depending on where we wire it in).
4. Buy/deploy the hero, fight a versus match against a second client, confirm both clients show identical entity state across at least one full turn (DJB hash match).
5. Document everything in `bsf-server/misc/findings_bs3_unit_port_feasibility.md` with: hero chosen, abilities substituted vs ported, asset files copied, AMF3 toolchain used, working / not-working list. This becomes the gate for "do we expand to a real roster?"

---

## Whole-Plan Verification

- **Phase 1** complete when `yarn test` is green and the six new units appear and fight in a live versus match.
- **Phase 2** complete when 2a, 2b, 2c are each verified per their own checklist and the `acc.json` purchasable list reflects every Factions-internal class that the client can render.
- **Phase 3** complete when one BS3/BS2 hero fights a full Factions versus match between two `--developer` clients without DJB divergence and the feasibility doc is written.

## Critical files (whole plan)
- `bsf-server/data/acc.json` — Phases 1, 2, 3 (one entry per ported unit).
- `bsf-server/src/services/account.ts:9-30` — confirms how `purchasable_units` reaches the client; not edited.
- `C:\Program Files (x86)\Steam\steamapps\common\the banner saga factions\assets\common\character\character_classes.json.z` — Phase 3 only (modified on each PoC machine).
- `C:\Program Files (x86)\Steam\steamapps\common\tbs2\assets\common\character\` and `tbs3\assets\common\character\` — Phase 3 source for translated class entries and asset copies.
- `bsf-server/misc/findings_unit_extensibility.md`, `bsf-server/misc/findings_bs_modding.md`, `bsf-server/misc/BannerSagaDeveloperCheatsheet.md` — required reading before Phase 3.
