# Plan — Fix the four open issues in Spearman-as-Axeman-Promotion PoC

_Reviews the `## Current state (read this first if picking up cold)` section of
`bsf-server/misc/Plan-Spearman-As-Axeman-Promotion.md` and plans the fixes. Drafted 2026-06-02._

---

## Context (why this work)

Batches 1–3 of the spearman-as-promotion PoC are applied. Verification on 2026-06-02 left
**three open bugs** (numbered 1/2/3 in the source plan's "Three confirmed open bugs" list),
plus a **fourth issue the user raised** while reviewing this plan:

1. Search-screen **versus portrait** renders empty.
2. **`abl_runthrough` does nothing** when clicked in battle.
3. **Roster detail view** shows lancer/"Ludin" art instead of tryggvi.
4. **Spearman attacks at 1 tile but should reach 2** (a spear's defining trait).

The source plan's "Next action" hypotheses for #1 and #2 are, on inspection of the decompiled
client, **pointed at the wrong root causes**. This plan corrects the diagnoses with code
evidence, then lays out targeted fixes. User decisions taken before drafting:

- **Bug 3 → accept the lancer portrait for the PoC** (no fix; document as a known limitation).
- **Bug 2 → swap `abl_runthrough` for an always-usable active** rather than keep the situational charge.

Intended outcome: spearman shows a real portrait on the search screen, has one active that
reliably fires on click, attacks at 2 tiles, and the roster-portrait limitation is documented
rather than chased.

> **Scope note:** issue #4 is the first change that requires editing `_ability_index.json.z`
> (the ability registry), which the source plan deliberately deferred as "out of scope." It's a
> small, well-defined edit (clone two attack abilities and bump their range), not a full ability
> port — but it does cross that line. Flagged here so it's an explicit choice at approval time.

---

## Outcome (2026-06-05)

**Batch D is complete.** The two spear clones (`abl_spear_str` / `abl_spear_arm`) are now registered
in `_ability_index.json.z` with their internal `id` renamed, and the spearman class's `attacks` point
at them. Spear-reach work is unblocked.

**Critical side effect found and fixed:** the *half-applied* state of Batch D — spearman `attacks`
repointed to `abl_spear_str` while `abl_spear_str` was **not yet in `_ability_index.json.z`** — was
silently causing the **"tutorial appears every session"** bug, not just a broken spear. With the
ability unregistered, the client's `EntityDefVars.fromJson()` threw `invalid/unknown ability id
abl_spear_str` while parsing the account's two promoted spearmen (`axeman_start_1`, `axeman_start_3`
in the test-account DB roster). `AccountInfoTxn` swallows that error, leaves `config.accountInfo`
unset, and `completed_tutorial` defaults to `false` — so the tutorial replayed every login despite
`completed_tutorial = 1` in the DB. Completing the manifest registration (this batch) resolved both
the spear feature and the tutorial crash.

**Lesson:** repointing a class's `attacks`/`actives` to a new ability and registering that ability in
`_ability_index.json.z` must land **together**. A partially applied registry edit doesn't just break
the one feature — it breaks account-info parsing for *any* account holding a unit of that class,
which surfaces as the tutorial-every-session symptom. See the "Tutorial appears every session"
troubleshooting entry in `bsf-server/docs/Development.md` for the diagnostic log lines.

---

## New issue (2026-06-05) — Bug 5: armor attack does 0 damage, willpower unusable

After Bugs 2 and 4 were fixed and verified, in-client testing surfaced a **fifth bug**: the promoted
spearman's **armor attack** (the cloned `abl_spear_arm`) deals **0 armor damage**, and the player
**cannot commit willpower** to it. The strength attack (`abl_spear_str`) and the 2-tile reach (Fix D)
are unaffected. Tracked as **issue #113**. (Bug 1 — the deferred versus portrait — is tracked as
**issue #112**.)

### Correctness review of `abl_spear_arm.json.z`

Reviewed `bsf-client/misc/abl_spear_arm.json.z` (a TBSDecompiler JSON export) against the canonical
`abl_melee_arm.json.z` it was cloned from. The `.orig` backup beside the clone in the install is
byte-identical to `abl_melee_arm.json.z`, confirming the clone origin; inflating the installed AMF3
confirmed the structure.

**How the armor attack works (confirmed against canonical).** The basic armor attack is a
**willpower-spend** ability: its base (0-willpower) level deals `damage: 0` *by design*, and a `levels`
array lets the player commit 1/2/3 willpower for 1/2/3 armor damage. The canonical `abl_melee_arm`
carries exactly this `levels` / `costs` / `WILLPOWER` structure, so the mechanism is legitimately
inherited — not the bug. (Contrast the strength attack, which scales by **rank** via `autolevels` and
draws its damage from `perCasterStrength`; the two basic attacks use genuinely different structures.)

**Defect 1 — malformed `levels` (prime suspect).** The WILLPOWER cost `value` is typed inconsistently
across the three levels: `1` as a **number** but `"2"` and `"3"` as quoted **strings**
(`abl_spear_arm.json.z` lines 118, 243, 368). A cost value that's a string where the engine expects a
number is the most likely reason the willpower levels can't be selected; with `levels` unusable the
attack falls back to its 0-willpower base → **0 armor damage and no willpower option**, the exact
reported symptom. The damage amounts (1/2/3) are correctly numeric — only the cost `value` drifted.

**Defect 2 — range not bumped.** Unlike the strength clone (`rangeMax: 2`), the armor clone is still
`rangeMax: 1` in all four places (top-level + each of the 3 levels). Fix D extended only the strength
side, so the spearman's armor attack reaches 1 tile while its strength attack reaches 2.

**Caveat.** Diagnosis is from data inspection only (no in-engine trace of the cost parser, and the
reviewed file is a JSON export). The fix below is deliberately conservative — re-clone from canonical so
the cost values keep their correct types rather than hand-patching the strings.

### Fix E — re-clone the armor attack (TBSDecompiler; not yet applied)

Re-clone `abl_spear_arm` from the canonical `abl_melee_arm.json.z` and change **only**:
- `id` → `abl_spear_arm`
- every `rangeMax` (4 occurrences) → `2`
- `rangeType` → `RANGED` (matches the strength clone; lets the 2-tile reach work without auto-walking)

Do **not** hand-edit the `levels` / `costs` block — copy it verbatim so the WILLPOWER cost values keep
their canonical (numeric) types. After saving, re-open in TBSDecompiler and confirm `abl_spear_arm`'s
`levels` byte-match `abl_melee_arm`'s apart from those three fields, and verify the **installed** file
(not just the misc export) carries the fix.

### Lesson learned

When cloning a `.json.z` ability, **change only the identifying fields (`id`, `rangeMax`, `rangeType`)
and copy every other block verbatim.** Hand-typing values into a cloned `levels` / `costs` array is how
the `"2"` / `"3"` string-vs-number drift crept in — a single mistyped cost silently disables the whole
willpower mechanic while the ability still loads and shows in the action panel. The strength clone,
which only adjusted numeric `damage` values inside a clean `autolevels` override, never hit this. Same
"land the whole edit together / partial `.json.z` edits fail *silently*" theme as the Batch D
tutorial-crash lesson above — so always verify a clone against its canonical source.

---

## Review of the "Current state" section — what's accurate vs. wrong

> **Status (2026-06-05 testing):** Bug 2 ✅ fixed (rank bump — Fix A) and Bug 4 ✅ fixed
> (Fix D clones), both confirmed in-client. Bug 3 is accepted as a known limitation.
> **Bug 1 (versus/search-screen portrait) remains open — deferred for later.** Source-plan
> verification steps 1–9 and 11 pass; step 10 (renown awarded) is untested in-client. The
> grading below stands as written; only the prose **Bug 2** diagnosis was superseded and is
> rewritten to point at the rank gate.

| Source-plan claim | Verdict | Evidence |
|---|---|---|
| **Bug 1** (versus portrait) — root cause is `appearances[0].versusPortrait` being empty / a `.swf` / malformed | **Wrong lead** | Shipped value is already a correct PNG path (`factions_character_classes.json:1669`), and Batch 1's own spec leaves `versusPortrait` untouched (source plan line 154). The bug also reproduced with the *original placeholder* art, so it isn't the field value or the art content. |
| **Bug 2** (active no-op; src-plan step 9d) is a stat prerequisite / AMF3 save issue / class restriction | **Right instinct (confirmed by testing)** | The active-ability level *is* a saved-stat prerequisite: `ABILITY_0` (= `StatType.ACTIVE_0`, `StatType.as:18`) is set to `rank − 1` (`EntityDef.as:276-279`) and the usable level is `min(that, willpower)` (`BattleEntity.as:762`). `setupClassAbilities` (`EntityDef.as:323-328`) only *lists* the active; it does not make a rank-1 unit able to cast it. Targeting was **not** the gate — see corrected Fix A. |
| **Bug 3** = `portrait.swf` is a lancer placeholder; BS3 has no `.swf` to copy | **Correct** | `portrait` field is `…/spearman.portrait/portrait.clip` (`factions_character_classes.json:1666`), loaded from `spearman.portrait.swf`, which is still the lancer_v0 placeholder. |
| **Bug 4** — the spearman's `RANGE: 2` stat gives it a 2-tile attack | **False premise** | `StatType.RANGE` exists (`StatType.as:28`) but is **never referenced** anywhere in the client; basic-attack reach is the attack ability's static `rangeMax` (`BattleAbilityValidation.as:217` checks distance against `param1.rangeMax`, a plain field — `BattleAbilityDef.as:15`). Spearman's `abl_melee_str`/`abl_melee_arm` are `rangeMax: 1`, so it attacks at 1 tile no matter what `RANGE` says. |

### Corrected diagnoses

**Bug 1 — versus portrait empty.** Render path is
`GuiVersus.as:213 → GameGuiContext.getEntityVersusPortrait (GameGuiContext.as:245-254) → resman.getResource(appearance.versusPortraitUrl, BitmapResource, group)`.
- The appearance resolves fine: battle render works (source-plan step 9b), and a *null* appearance would throw on `_loc3_.versusPortraitUrl` and break **all six** party portraits, not just spearman's. So `versusPortraitUrl` is a valid string.
- Therefore the bug is **the bitmap at a valid URL not drawing**, narrowing to two candidates: (a) the spearman **art file/path** isn't what the game actually loads (decode failure, or `ResourceManager.getFullUrl` (`ResourceManager.as:133-149`) resolving the path to a content-hashed file via `AssetIndex`/`assets_config.json.z` that overrides the loose PNG), or (b) the promoted-spearman entityDef isn't getting a versus portrait requested into the search screen's resource group at all.
- **Update (2026-06-04 testing):** candidate (a) is ruled out — the portrait renders correctly once the match countdown starts, so the art and path are valid. The open question is candidate (b) / whether the spearman is in the *search-side* party at all. See corrected Fix B.

**Bug 2 — active no-op (originally misdiagnosed as `abl_runthrough` positioning).** ⚠️ Superseded —
see **Fix A**. The original read was that `abl_runthrough` is a **situational, targeted charge**
(`Op_RunThrough.execute()` (`Op_RunThrough.as:34-44`) returns `FAIL` unless an empty tile sits
**behind** the target; `targetRule: SPECIAL_RUN_THROUGH`, `rangeType: RANGED`, `rangeMax: 2`), so
"nothing happens on click" looked like having **no valid target**. **Live testing (2026-06-05)
disproved this:** the gate is the unit's *rank*, not the ability. A rank-1 unit has active-ability
level `ABILITY_0 = rank − 1 = 0`, which makes *any* active inert; once the spearman is rank 2, **both
`abl_runthrough` and `abl_stonewall` fire** (user-confirmed). The runthrough mechanics above remain
true but are no longer load-bearing, and the "swap the ability" plan was never the actual fix.

**Bug 4 — attacks at 1 tile, should be 2.** In Factions, basic-attack reach equals the attack
ability's static `rangeMax`; the `RANGE` *stat* is dead code. BS1/2/3 implement spear reach with a
`RANGEMOD_MELEE` stat (BS3 spearman/lancer carry it at value 1, extending the base melee `rangeMax`
of 1 to a 2-tile reach — `…/tbs3/…/character_classes.json:1246-1250`). **Factions has no
`RANGEMOD_MELEE`** (the token is absent from the entire decompile; `StatType.as` lists no
range-modifier stat), so that mechanism can't be ported by data alone. The only Factions-compatible
way to get a 2-tile melee reach is an attack ability whose `rangeMax` is 2. Editing the shared
`abl_melee_str`/`abl_melee_arm` is out — that would extend *every* melee unit's reach — so the fix
clones them into spearman-only variants.

---

## The fixes

> **Post-test revision (2026-06-04).** Live testing disproved the original diagnoses for Bugs 1 and 2
> and corrected the data-format assumption behind Bug 4. The three subsections below are the rewritten,
> test-backed versions; the original analysis is left intact above for the record. In one line each:
> **Bug 2** — the active is inert because the unit is rank 1 (active-ability level = `rank − 1` = 0),
> nothing to do with which active is equipped; **Bug 1** — the versus art is valid (it renders the
> moment the match countdown starts), so the art/path swaps chased a non-issue; **Bug 4** — the ability
> index is a manifest of file *references*, and three separate steps were missing.

### Fix A — Bug 2: the active no-op is the unit's *rank*, not the ability

**The original plan (swap `abl_runthrough` → `abl_stonewall`) aimed at the wrong cause.** Testing
confirmed `abl_stonewall` shows in the spearman's action panel but clicking it still does nothing —
exactly like `abl_runthrough` before it. Swapping the active was never going to help.

**Real cause (code-backed).** The stat written `ABILITY_0` in the roster JSON *is* `StatType.ACTIVE_0`
in the client (`StatType.as:18` — `ACTIVE_0 = new StatType("ABILITY_0", …)`). A unit's active-ability
level is force-set to **`rank − 1`** (`EntityDef.as:276-279`: `setBase(ACTIVE_0, clamp(rank − 1, …))`),
and the *usable* level in battle is `min(ACTIVE_0_level, current_willpower)` (`BattleEntity.as:762`);
when that is 0 the active button is disabled (`GuiSelfPopup.as:347-353`). The test unit
`spearman_start_0` was **`RANK 1` → `ABILITY_0 = 0`** (active level 0 = unusable), while every working
party unit is **`RANK 2` → `ABILITY_0 = 1`**. `setupClassAbilities` (`EntityDef.as:323-328`) still
*lists* the active, which is why it appears in the panel but is inert. (SPECIAL-tagged actives also get
an implicit +1 willpower cost in code — `BattleAbilityDefVars.as:199-201` — but with willpower 6 that's
not the binding constraint; rank is.)

**Fix (roster data — rank bump applied 2026-06-04 in `acc.json` and `acc-new-units.json`):**
- `spearman_start_0`: `RANK` `1 → 2`, `ABILITY_0` `0 → 1`. Takes effect only after a DB reseed (see
  **Test setup**).

**The ability swap is now optional / cosmetic.** With rank fixed, both `abl_runthrough` and
`abl_stonewall` fire. Keep `abl_stonewall` for an always-usable self-buff in the demo (it is genuinely
`targetRule: SELF`, `rangeType: NONE` — confirmed by decompressing `abl_stonewall.json.z`) or revert to
`abl_runthrough`; either is fine.

**Tradeoff:** `RANK 2` adds 1 to party power (matchmaking sums `rank − 1`) — negligible for local
2-client tests where both sides read the same install.

### Fix B — Bug 1: the versus art is valid; confirm party membership, don't swap art

**Your test settled this.** The spearman portrait *does* render — it appears the instant the match is
found and the countdown begins. The search screen and the versus screen draw party portraits through
the **same** call: `GuiVersus.setupPartyTabs → context.getEntityVersusPortrait` (`GuiVersus.as:213`,
`GameGuiContext.as:245-254`) runs for your own side in `init()` and for the opponent's side in
`setOpponent()`. So the art file, the path, and the `versusPortrait` field are all valid — which means
**Tests B1 (swap the art) and B2 (swap the path) were testing a hypothesis the countdown render already
disproves.** Their "failure" is expected; drop both.

**What's actually left to confirm (one observation next run):**
- Is `spearman_start_0` actually in *your* queued party on the search screen? The served `party.ids`
  did **not** contain it, so unless it's added the search screen correctly shows no spearman — and the
  one seen at countdown is then the **opponent's** unit (red side, only drawn in `setOpponent()`).
  Adding the spearman to the party (see **Test setup**) resolves this.
- If it *is* in your party and the other five own-side portraits render during search while only the
  spearman slot is blank, that's a load-timing artifact (a freshly-added loose PNG isn't warm in the
  asset cache at `init()` time; it's loaded by the time `setOpponent()` fires a few seconds later) —
  cosmetic and self-resolving once cached.

No art edit is warranted until that observation distinguishes the two; current evidence points to "not
in the search-side party," not a broken portrait.

### Fix C — Bug 3: accept the lancer portrait (no code change)

Per decision, keep `spearman.portrait.swf` (lancer_v0 placeholder). The lancer is itself a
spear/lance-wielder, so it reads as a reasonable stand-in for a PoC. **Action: documentation only** —
record it as a known limitation in the source plan's "Out of scope" section and in
`findings_add_new_unit_process.md` when that playbook is written. Defer a real portrait to the
out-of-scope `.clips → .swf` conversion work.

### Fix D — Bug 4: give the spearman a 2-tile attack (corrected data-format model)

**The plan's file model was wrong, and three separate steps were missing — testing hit all three.**
`_ability_index.json.z` is **not** a container of ability objects; it's a manifest with a `refs` array
of file *paths* (plus a few embedded `abilities`). `BattleAbilityDefFactoryVars.as:101-121` loads each
`refs` entry as its own file and registers whatever `id` that file declares. Decompressing the live
files showed all three omissions at once: the spear clones exist on disk but are **not** in `refs`;
their internal `id` is **still `abl_melee_str`/`abl_melee_arm`** (only `rangeMax` was changed); and the
spearman's `attacks` were **never repointed** (`abl_spear_*` appears 0× in `character_classes.json.z`,
so it still inherits the melee attacks at `rangeMax: 1`). Reach is the attack ability's static
`rangeMax` (`BattleAbilityValidation.as:215-224`, `BattleAbilityDef.as:15`), so 1 tile is exactly what
those omissions produce.

**Corrected edits (TBSDecompiler):**
1. **Rename the clones' internal id.** In `abl_spear_str.json.z` set `id: "abl_spear_str"` (currently
   `abl_melee_str`); in `abl_spear_arm.json.z` set `id: "abl_spear_arm"`. Keep `rangeMax: 2`.
   ⚠️ If you add the file to the manifest with the id left as `abl_melee_str`, it registers a *second*
   `abl_melee_str` and **overwrites the real one — giving every melee unit 2-tile reach.**
2. **Add the clones to the manifest.** In `_ability_index.json.z`, add
   `"common/ability/abl_spear_str.json.z"` and `"common/ability/abl_spear_arm.json.z"` to `refs`.
3. **Repoint the spearman (the missing Edit D2).** In the spearman class block of
   `character_classes.json.z` — the same block where the `abl_stonewall` active was added — set
   `attacks: ["abl_spear_str", "abl_spear_arm"]`.

**`rangeType` is still a tested refinement.** Keep `rangeType: MELEE`; if the spearman auto-walks
adjacent instead of striking from 2 tiles, flip both clones to `rangeType: RANGED`, `rangeMin: 0`,
`rangeMax: 2` (precedent: `abl_runthrough` is a melee-flavored strike defined as RANGED/`rangeMax 2`).

**DJB-hash caveat:** adding manifest entries changes the ability registry, so both clients must run the
identical `_ability_index.json.z`, the spear `.json.z` files, and `character_classes.json.z`, or the
turn-0 state hash diverges.

### Minor finding (not a fix target)

The class `icon` field is `common/character/spearman/spearman.icon.png`, which **does not exist** in
the spearman folder. This is harmless: `EntityAppearanceDef.setupIcons` (`EntityAppearanceDef.as:42-50`)
*derives* the roster/party/init icon URLs by transforming the base path into existing siblings
(`spearman.icon.roster.png`, etc., which Batch 2 already replaced with tryggvi art). The literal base
`spearman.icon.png` is rarely read directly. Optional cleanup only; leave it unless a missing-base-icon
symptom appears.

---

## Critical files

**Edited (Factions install — not in repo):**
- `…\the banner saga factions\assets\common\ability\_ability_index.json.z` — add the two spear clone paths to the `refs` manifest (Fix D step 2). **First ability-index edit in the project.**
- `…\assets\common\ability\abl_spear_str.json.z`, `abl_spear_arm.json.z` — set internal `id` to `abl_spear_str`/`abl_spear_arm`, `rangeMax: 2` (Fix D step 1).
- `…\assets\common\character\character_classes.json.z` — repoint spearman `attacks` to the spear clones (Fix D / D2); spearman `actives` already holds `abl_stonewall` (optional, presentation only).

**Edited (roster data — in repo):**
- `bsf-server/data/acc.json` (served) and `acc-new-units.json` (staging) — `spearman_start_0`: `RANK 2`, `ABILITY_0 1` (applied 2026-06-04), plus a pending add to `party.ids` (Fix A). Requires a DB reseed to take effect.

**Read-only references (evidence cited above):**
- `%USERPROFILE%\Code\BSF\bsf-client\misc\factions_character_classes.json` — spearman block 1656-1735; backbiter (control) 1365-1530; `abl_stonewall` user at line 5.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\entity\def\EntityDef.as:316-342` (`setupClassAbilities`), `:168-179` (appearance/classAppearance).
- `…\engine\battle\ability\effect\op\model\Op_RunThrough.as` — proves runthrough targeting.
- `…\game\gui\GameGuiContext.as:245-254` and `…\engine\resource\ResourceManager.as:133-149` + `AssetIndex.as` — versus-portrait load path.
- `…\engine\battle\ability\model\BattleAbilityValidation.as:215-224`, `…\ability\def\BattleAbilityDef.as:13-15`, `…\engine\stat\def\StatType.as` — prove attack reach = ability `rangeMax`, `RANGE` stat unused, no `RANGEMOD` stat (Bug 4).
- `%USERPROFILE%\Code\BS_mod\Nafeij-s-BS3-Fixpack-1.4\…\common\ability\_ability_index.json` — readable ability index for targeting rules (`abl_stonewall` 5993, `abl_bringthepain` 3085, `abl_forgeahead` 3631) and attack ranges (`abl_melee_str` rangeMax 1 @4275).
- `%USERPROFILE%\Code\BS_mod\Nafeij-s-BS3-Fixpack-1.4\…\tbs3\…\character\character_classes.json:1263-1345` — BS3 spearman class showing the `RANGEMOD_MELEE` reach stat Factions lacks.

**Backups before edits:** reuse the source plan's `.bak-spearman-as-promotion-2026-05-29` convention
for `character_classes.json.z`, `_ability_index.json.z`, and the spear `.json.z` files (the `.orig`
copies already sitting in the ability folder serve this). A `spearman.assets-bak-6-2-26.zip` of the
folder already exists in the install.

---

## Execution order (each batch = its own What/Why/Tradeoff approval per `bsf-server/CLAUDE.md`)

1. **Batch A (rank fix — fixes the active no-op):** roster data — set `spearman_start_0` to `RANK 2`,
   `ABILITY_0 1` (done 2026-06-04) and add it to `party.ids`. Keep `abl_stonewall` or revert to
   `abl_runthrough` in the spearman `actives` (presentation only). See **Test setup** for the serving +
   DB reseed needed to make it take effect.
2. **Batch D (2-tile attack):** TBSDecompiler — back up `_ability_index.json.z` and the spear files;
   (1) set the clones' internal `id` to `abl_spear_str`/`abl_spear_arm` at `rangeMax: 2`; (2) add both
   to the `refs` manifest; (3) repoint the spearman `attacks` (D2). Relaunch, test reach; flip clones
   to `RANGED`/`rangeMin 0` if the unit auto-walks adjacent.
3. **Batch B (Bug 1 — observe, don't edit):** on the search screen, confirm whether the spearman is in
   your own party and whether the other five portraits render. No art edit unless that observation
   shows a real failure (it shouldn't — the countdown render proves the art is valid).
4. **Batch C:** documentation-only edits to the source plan + findings doc. No game/server change.

Bug 3 needs no execution beyond docs. Batch D's manifest + `character_classes.json.z` edits can share
one TBSDecompiler session + one backup. Batch A is roster data, not a `.json.z` edit.

---

## Test setup (serving the spearman — reseed, or promote in-client)

The server reads **`data/acc.json`** (`src/services/account.ts:9`, `src/db/account.ts:27`).
`upsertAccount` seeds a new account's `roster_json` / `party_ids_json` from it **only on first login**
(`account.ts:58-64`); later logins just bump `login_count`. So a test account already in `bsf.db` is
frozen — editing the JSON does nothing for it. `acc-new-units.json` is a **staging copy the server
never reads**; it must be copied over `acc.json` to take effect.

To actually play the spearman:
1. Put `spearman_start_0` (at `RANK 2 / ABILITY_0 1`) in `acc.json`'s `roster.defs` **and** in
   `party.ids` (replacing one slot to keep the party at 6). *Status 2026-06-04: rank fix applied in
   `acc.json` + `acc-new-units.json`; the `party.ids` addition is still pending.*
2. Reseed the test account — delete its row (`DELETE FROM accounts WHERE …`) or delete `bsf.db`.
3. `start-server.bat`, then re-login on both clients so they re-seed with the spearman in-party.

Without step 2, the spearman never reaches the board, which silently confounds all three bug tests (you
end up testing the spearman only as the opponent, or not at all).

**Alternative (existing account) — promote in-client, no reseed.** If the test account already exists
in `bsf.db` you don't have to touch the DB at all. `/unit/promote` (`roster.ts:44-83`) bumps a unit's
`RANK` and rewrites its `entityClass`, persisting both. So:
1. Apply the install `.json.z` edits (spearman class active + Fix D attacks/manifest) **first** —
   promotion sets the class, but the abilities and reach come from the class definition.
2. In-client, hire a rank-1 axeman if the roster has none (dismiss a spare unit to make room), then
   **promote it to the `spearman` class.** Rank → 2 makes the client derive `ABILITY_0 = 1` — exactly
   Fix A's active unlock; no hand-edit of `ABILITY_0` is needed (it's recomputed from rank every load).
3. Drag the spearman into the party in-client (persists via `saveParty`).

This sets up only the promoting account — repeat on the opponent if you want the spearman on both sides.
Cost: 20 renown for the 1→2 promotion, plus any hire cost.

## Verification

Re-run the source plan's loop (`Plan-Spearman-As-Axeman-Promotion.md` §Verification), focusing on the
previously-failing steps:

1. `yarn test` green (no server change here, but confirms nothing regressed).
2. `start-server.bat`, launch two clients via `launch-game-2p.ps1` (keep its
   `--versus_start --versus_countdown 0`). **These are not `--developer` clients**, whatever the
   script's argument list looks like — its trailing `--versus_start` overwrites the developer option,
   because all six run-mode options share one setting and the last one wins. If this step needs
   developer mode, type the command by hand with `--developer` last and accept landing at the main
   menu (one click on the combat option reaches the town). See
   [`docs/Development.md`](../docs/Development.md) → *Which screen a launch command lands on*.
3. **Bug 2 / step 9d (rank fix):** with `spearman_start_0` at `RANK 2 / ABILITY_0 1`, click the
   spearman's active in battle — it now fires (Stonewall applies its self-buff with no target prompt,
   or runthrough targets — whichever you kept). As a control, confirm a `RANK 1 / ABILITY_0 0` unit's
   active is greyed/inert, proving rank was the gate.
4. **Bug 4 (attack reach):** select the spearman in battle and target an enemy **2 tiles away** — the
   basic attack is valid and connects without first walking adjacent. Confirm an adjacent (1-tile)
   enemy is still attackable, and that an axeman/raider on the stock `abl_melee_*` still reaches only
   1 tile (proves the clones' renamed ids didn't overwrite the shared melee attacks).
5. **Bug 1 / steps 9a + 6:** with the spearman in your party, its portrait renders in your own
   search-screen slots (not only on the opponent's countdown side) and on the promotion picker.
6. **Bug 3 / step 7:** roster grid thumbnail is tryggvi; detail-view portrait is the lancer placeholder
   (expected/accepted) — no crash, unit is usable.
7. DJB hash matches across both clients through at least one full turn; end match cleanly; renown awarded.

**Rollback:** restore `character_classes.json.z.bak-…` and `_ability_index.json.z.bak-…`; restore
`spearman.icon.versus.png` backup; revert any `assets_config.json.z` edit.

---

## Caveats (what genuinely needs the live game)

- Bug 1's residual question (own-party render vs opponent-side render) needs one more search-screen
  observation; the art itself is confirmed good.
- `abl_stonewall` is confirmed `targetRule: SELF`, `rangeType: NONE` in Factions (decompressed
  `abl_stonewall.json.z`), so no fallback ability is needed — but recall its active only fires once the
  unit is rank ≥ 2.
- Bug 4's `rangeType` (MELEE vs RANGED) can only be settled by watching the spearman attack in-game.
- **DJB hash / cross-machine note:** Bug 4's manifest + ability edits change the registry, so every
  client in a match must run the *identical* `_ability_index.json.z`, the spear `.json.z` files, and
  `character_classes.json.z` or the turn-0 state hash diverges. Local 2-client testing is safe (both
  `--developer` clients read the same install); cross-machine play would require shipping the same
  edited files to both.
- **Roster/serving note:** the server reads `data/acc.json` and seeds a unit's roster/party into
  `bsf.db` only on the account's *first* login — reseed an existing test account (see **Test setup**).
- Edits are local-Steam-install-only (ability/`character_classes` files) plus local roster data;
  nothing is recompiled or redistributed.
