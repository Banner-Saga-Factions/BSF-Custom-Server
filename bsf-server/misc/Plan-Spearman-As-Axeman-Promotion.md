# Plan — Spearman as Axeman Promotion Option (PoC)

_Drafted 2026-05-29. Successor to `Plan-Spearman-Dredge-Cleanup-BS3-PoC.md` §2.1A path. Pivots after user testing on 2026-05-28 and follow-up investigation on 2026-05-29._

---

## Current state (read this first if picking up cold)

- **Batches 1, 2, and 3 are complete as of 2026-06-02.** Spearman class def was wired as axeman promotion-target (rank 2–4, `abl_runthrough` active, tryggvi art icons, fixed `promotePortrait`). Tryggvi art was copied for 6 icon files. `spearman_base` was removed from `acc.json`.
- **Verification run 2026-06-02 — results:**
  - ✓ Step 5 — Spearman absent from Mead Hall shop.
  - ✓ Step 6 — Promotion picker shows tryggvi Spearman as third choice alongside Thrasher/Backbiter; promotion icon shows tryggvi art.
  - ✗ Step 7 — Roster shows "Ludin" art for the promoted spearman instead of tryggvi. Likely the detail-view `portrait.swf` (still a lancer placeholder — BS3 uses `.clips` format, not `.swf`); the grid thumbnail `icon.roster.png` may be correct. Needs disambiguation.
  - ✓ Step 8 — Party-tag counter shares axeman's 3-slot limit.
  - ✗ Step 9a — Bug 2 (search-screen portrait) still not rendering despite replacing `spearman.icon.versus.png`. Spearman IS present in the party during 2-player matches (server sends correct party data) but the portrait slot is empty. Root cause: `appearances[0].versusPortrait` in the class def may be empty or pointing to a `.swf` path rather than the PNG. Check in TBSDecompiler.
  - ✓ Step 9b — Spearman renders in battle; action panel shows `abl_runthrough` + End + Rest.
  - ✗ Step 9d — `abl_runthrough` does nothing when clicked. Hypotheses: stat prerequisite (STRENGTH/willpower) not met at rank-2 base stats; AMF3 string save issue; client-side class restriction. Verify Backbiter still works as control; re-read spearman `actives` in TBSDecompiler.
- **Post-surrender regression — re-diagnosed (2026-06-02):**
  - "Spearman not in proving grounds" in 2-player mode is **expected behavior** — `--versus_start --versus_countdown 0` bypasses the proving grounds screen. The party comes from the server's stored data; spearman IS present in the match.
  - **H1 (Steam auto-verify) ruled out.** Single-player launch still shows spearman in proving grounds and the axeman promotion option. Batch 1 edits in `character_classes.json.z` are intact.
  - **H2 (server roster stripping) moot for now.** Server correctly includes spearman in 2-player party data despite `acc.json` removal. Earlier disappearance was likely a misread of the `--versus_start` proving-grounds bypass. Monitor for recurrence after further testing.
- **Three confirmed open bugs for next session:**
  1. **Bug 2 — search-screen portrait empty.** `spearman.icon.versus.png` is correct tryggvi art (83,090 bytes) but portrait slot still doesn't render. `appearances[0].versusPortrait` in the class def is the suspected root cause — check its exact value in TBSDecompiler.
  2. **`abl_runthrough` non-functional.** Appears in action panel but clicking it does nothing. Re-read the spearman `actives` array in TBSDecompiler to confirm the AMF3 save is correct, then investigate stat prerequisites.
  3. **Roster detail view shows Ludin/lancer art.** `portrait.swf` is a lancer placeholder (BS3 `.clips` format is incompatible with Factions `.swf`). May be acceptable for PoC; see Out of scope §.
- **Next action when continuing:**
  1. Open `character_classes.json.z` in TBSDecompiler → read the spearman block → check `appearances[0].versusPortrait` and `actives` array. These two field values diagnose Bugs 2 and 9d simultaneously.
  2. If `versusPortrait` is empty or a non-PNG path, set it to `common/character/spearman/spearman.icon.versus.png` and save (new Batch 1a edit — present as What/Why/Tradeoff per CLAUDE.md before applying).
  3. If `actives` looks correct, investigate `abl_runthrough` stat prerequisites by comparing Backbiter's STRENGTH at rank 2 with the promoted spearman's.

---

## Context (the why)

### Findings from the 2026-05-29 investigation

- **The shipped Factions spearman class def is a stub** — the user's edits and Stoic's original both contributed broken fields. The user confirmed they'd edited `backPortrait` (pointed at wardog), `promotePortrait` (malformed `.portrait/.png` path), and `partyTag` (set to `axeman`). The empty combat `actives` and locked `RANK 1, 1` range were Stoic's original stub.
- **`PlanAddNewUnits.md:122-123` was wrong about BS1/BS2/BS3 file format.** All three games ship `character_classes.json.z` as **AMF3** (same `\x0a\x0b` magic as Factions) — not plain JSON inside zlib as the plan claimed. Inflated `bs1/bs2/bs3_character_classes.bin` files saved to `bsf-server/misc/` for cross-reference. Implication: the TBSDecompiler workflow we already use applies to all four games. (A separate batch will fix the plan claim — out of scope here.)
- **BS1/2/3 each ship ~36 `abl_*` IDs vs Factions' 18.** The extras include spear-themed abilities Factions never had: `abl_impale`, `abl_pigsticker`, `abl_overwatch`, `abl_pin`. Porting any of them requires `_ability_index.json.z` AMF3 edits and is deferred from this plan (see "Out of scope" §).
- **BS3 ships a full `tryggvi` asset set** under `%PROGRAMFILES(X86)%\Steam\steamapps\common\tbs3\assets\common\character\spearman\`. Tryggvi is BS1/2/3's named spear-wielding hero — the natural visual donor for a Factions spearman class.
- **Factions' shipped `spearman.icon.versus.png` is 66,606 bytes — byte-identical-size to axeman's**, suggesting a Stoic placeholder, not real spearman art. The user observed it didn't render in the search screen.

### Findings from 2026-06-02 execution

- **BS3 uses `.clips` format for animated portraits, not `.swf`.** `tryggvi.portrait.swf` does not exist in the BS3 install. Factions requires `.swf` for portrait animations — the existing `spearman.portrait.swf` (a lancer_v0 placeholder, 347,328 bytes) had to stay. This is why the promoted spearman's detail view shows lancer/"Ludin" art rather than tryggvi.
- **`tryggvi.icon.promotion.png` does not exist in BS3.** Tryggvi is a named hero, not a promotable class, so he has no promotion icon. A substitute was created by scaling `tryggvi.icon.versus.png` (159×492) to 321×932 using PowerShell + `System.Drawing` (bicubic interpolation, crop 61 px from bottom). Result: 286,937 bytes at the correct dimensions.
- **All original Factions `spearman/*` assets were lancer_v0 placeholders.** Every spearman icon and the portrait SWF were byte-for-byte identical to the corresponding `lancer_v0.*` file. After Batch 2, the 6 copyable tryggvi icons differ; the portrait SWF remains a lancer placeholder.
- **H1 (Steam auto-verify) ruled out.** After game and server restart, single-player launch still shows spearman in proving grounds and the axeman promotion option intact. `character_classes.json.z` Batch 1 edits survive restarts.
- **H2 (server roster stripping) moot for now.** In 2-player mode with `--versus_start`, spearman appears in the match party despite its removal from `acc.json` `purchasable_units`. "Not in proving grounds" in that mode is expected — `--versus_start` bypasses the proving grounds screen entirely.
- **Bug 2 root cause is likely `appearances[0].versusPortrait` in the class def**, not the art file itself. The PNG was replaced with correct tryggvi art (83,090 bytes, confirmed in folder) but the portrait slot still doesn't render. The field may be empty, point to a `.swf`, or contain a malformed path. Next step: read it directly in TBSDecompiler.

### Decisions (locked in 2026-05-29 user reply)

| Decision point | Choice | Reason |
|---|---|---|
| `acc.json` conflict (rank-1 buyable vs rank-2 promotion target) | **(A) Remove `spearman_base` from `acc.json`** — promotion-only | Cleanest; matches how thrasher/backbiter work today |
| Ability scope | **Cheap** — substitute `abl_runthrough` (backbiter's charging strike) | Closest existing analog to a spear charge; no `_ability_index.json.z` work |
| Art swap | **Yes** — copy BS3 `tryggvi.*` over Factions' placeholder spearman art | May incidentally fix Bug 2 (the placeholder PNG may be what's failing) |

---

## Critical files

### To be modified

- **`%PROGRAMFILES(X86)%\Steam\steamapps\common\the banner saga factions\assets\common\character\character_classes.json.z`** — five field edits inside the spearman class block (via TBSDecompiler).
- **`%PROGRAMFILES(X86)%\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\`** — seven asset files overwritten with BS3 tryggvi versions; one new file added.
- **`%USERPROFILE%\Code\BSF\bsf-server\data\acc.json`** — remove the `spearman_base` `PurchasableUnitData` entry.

### Read-only references

- `%USERPROFILE%\Code\BSF\bsf-client\misc\factions_character_classes.json` — decoded Factions class registry. Lines 1656-1735 are the spearman block. Canonical source for the edit layout.
- `%PROGRAMFILES(X86)%\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.*` — asset donor.
- `%USERPROFILE%\Code\BSF\bsf-server\misc\bs3_character_classes.bin` — inflated BS3 registry (raw AMF3 bytes; use for cross-checking ability IDs).
- `%USERPROFILE%\Code\BSF\bsf-server\misc\Plan-Spearman-Dredge-Cleanup-BS3-PoC.md` — prior plan; §2.0 gate check and §2.3 verification loop are reusable.
- `%USERPROFILE%\Code\BSF\bsf-server\misc\PlanAddNewUnits.md` — three-phase master plan; §3 AMF3/JSON claim needs correction in a separate batch.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\entity\def\EntityClassDefVars.as` — class-def schema (validates `parent`, `actives`, `partyTag`, etc.).
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\entity\def\EntityAppearanceDefVars.as` — appearance schema (validates `versusPortrait`, `icon`, etc.).
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\game\gui\pages\GuiVersus.as:213` — search-screen call site for `getEntityVersusPortrait`. Confirms `versusPortrait` is the field that drives Bug 2.

### Backups (must create before each batch)

- Before Batch 1: `character_classes.json.z.bak-spearman-as-promotion-2026-05-29`
- Before Batch 2: per-file `.bak-2026-05-29` copies of the 7 spearman assets that will be overwritten.
- Before Batch 3: `acc.json` is tracked in git, so `git diff bsf-server/data/acc.json` is the rollback view.

---

## Planned edits

> **Picking this up cold?** This section is a complete, follow-along guide written for someone who has never touched the Factions codebase and doesn't know the folder layout. Read **Orientation** once, do the one-time **Tooling setup**, then work the three batches in order. Per `bsf-server/CLAUDE.md`, each batch must still be presented to the user as its own What/Why/Tradeoff message ending in "Reply y to approve" — this guide is the working spec, not the approval message itself.

### Orientation — what you're changing and where it lives

Spearman today is a rank-1 unit you buy in the Mead Hall shop. These edits turn it into a **rank-2 promotion option of the axeman** (sitting next to Thrasher and Backbiter), give it a real combat ability, and swap in Banner Saga 3 "Tryggvi" art. The work touches **three separate places**, one per batch:

| Batch | What changes | Where it lives | How you edit it |
|---|---|---|---|
| 1 | The spearman **class definition** — its stats, abilities, promotion wiring, portrait links | A compressed game-data file inside the **Factions game install** (not in this repo) | TBSDecompiler (see Tooling setup) |
| 2 | The spearman **art files** — icons + portrait | The Factions install's `character\spearman\` folder | Windows file copy (PowerShell) |
| 3 | The spearman **shop entry** the server hands the client | `bsf-server\data\acc.json` (this repo) | Any text editor |

Folders you'll paste a lot:

- **Factions install:** `%PROGRAMFILES(X86)%\Steam\steamapps\common\the banner saga factions\`
  - Class-def file (Batch 1): `assets\common\character\character_classes.json.z`
  - Spearman art folder (Batch 2 target): `assets\common\character\spearman\`
- **Banner Saga 3 install (art donor for Batch 2):** `%PROGRAMFILES(X86)%\Steam\steamapps\common\tbs3\assets\common\character\spearman\`
- **This repo's server data (Batch 3):** `bsf-server\data\acc.json`
- **Read-only reference — the decoded class registry:** `bsf-client\misc\factions_character_classes.json`. This is a plain-text, human-readable copy of the same data that lives (compressed) inside `character_classes.json.z`. The spearman block is at **lines 1656–1735**. Keep it open beside you during Batch 1 to see the exact field layout you're editing.

Two facts that keep you out of the project's known traps:

- **`.json.z` is NOT a SWF and is NOT edited in JPEXS.** It's a zlib-compressed AMF3 blob. You edit it with **TBSDecompiler** (next section). JPEXS/FFDec is only for the compiled game `.swf`; you don't need it here. (Older plan docs that say "open the `.json.z` in JPEXS" are imprecise — ignore that wording.)
- **You don't recompile or redistribute anything.** Every change lands in your own local Steam install plus one server file. You launch the game with the `--developer` flag so it accepts the spearman class (which isn't on the public whitelist). Other players see none of this.

### Tooling setup (one-time)

You need **TBSDecompiler** to open and re-save `character_classes.json.z`.

1. **Install the Adobe AIR runtime** — TBSDecompiler is an AIR app. Get the HARMAN AIR runtime (33.1.1.533 or newer) from `https://airsdk.harman.com/runtime` and run the installer.
2. **Install TBSDecompiler.** The installer `TBS_Decompiler3.2.3.air` ships in this repo at `bsf-client\misc\TBS_Decompiler3.2.3.air`. Double-click it; the AIR runtime launches the installer. (If Windows saves it as `.zip`, rename the extension back to `.air`.)
3. **Point it at the game.** Launch TBSDecompiler → **Change Assets Directory** tab → set the folder to your Factions install (`...\steamapps\common\the banner saga factions`). The left panel then fills with the `common` / `saga` file tree.

The edit loop you'll use in Batch 1:

- In the left panel, navigate to the `.json.z` file and open it — TBSDecompiler shows it as readable JSON text.
- **Copy that text into a real editor** (VS Code / Notepad++) so you can search and edit comfortably.
- **Paste the edited text back into TBSDecompiler and save** — it re-compresses to AMF3 + zlib for you.
- **Always back up the original first** (each batch says exactly what to back up).

### Batch 1 — Edit the spearman class definition (TBSDecompiler)

**File:** `...\the banner saga factions\assets\common\character\character_classes.json.z`

1. **Back up first.** Copy the file to `character_classes.json.z.bak-spearman-as-promotion-2026-05-29` in the same folder. If a `.orig` baseline already sits beside it, leave that untouched — it's the master backup.
2. Open `character_classes.json.z` in TBSDecompiler and copy the text into your editor.
3. **Find the right object.** Search for `"id": "spearman"`. ⚠️ Searching just `spearman` lands on false hits — the lancer class has `"parent": "spearman"`, and the spearman block's own art paths contain the word. The object you want is the single one whose **`id` field equals `spearman`** (cross-check it against `factions_character_classes.json` lines 1656–1735 — same object).
4. **Make these five field changes** inside that object. The "Current value" column is exactly what ships today (verified against the decoded registry); if a current value doesn't match what you see, **stop** — you're probably in the wrong object.

| # | Field (where to find it) | Current value | New value | Why |
|---|---|---|---|---|
| 1 | `parent` (top level of the object) | `""` | `"axeman"` | Wires spearman into axeman's promotion tree so it shows up next to Thrasher/Backbiter on the promotion picker |
| 2 | the `RANK` entry inside the `stats` array — the object `{ "max": 1, "min": 1, "stat": "RANK" }` | `min: 1, max: 1` | `min: 2, max: 4` | A promotion target starts at rank 2 and can level to rank 4 (same range as Thrasher/Backbiter) |
| 3 | `actives` (top level) | `["abl_end", "abl_rest"]` | `["abl_runthrough", "abl_end", "abl_rest"]` | Gives spearman a charging-strike combat ability. `abl_runthrough` already exists in Factions (Backbiter uses it), so no ability-file edit is needed |
| 4 | `appearances[0].backPortrait` | `common/character/warrior/wardog_v0.portrait_back.png` | `""` (empty string) | Clears a wardog stand-in left over from earlier work; matches lancer (also empty) |
| 5 | `appearances[0].promotePortrait` | `common/character/spearman/spearman.portrait/spearman.icon.init.active.png` | `common/character/spearman/spearman.icon.promotion.png` | Points at a real PNG (the one **Batch 2** copies in). The current value treats `spearman.portrait/` — an art-clip namespace, not a folder — as a directory, so it can't resolve |

**Leave these alone — already correct, don't "fix" them:**

- `partyTag: "axeman"` — inherits axeman's shared 3-slot party limit; no separate limit edit needed.
- `passive: "pas_shieldwall"` — already in Factions' ability registry.
- `attacks: ["abl_melee_str", "abl_melee_arm"]` — basic strike, already verified working.
- `appearances[0]` → `icon`, `versusPortrait`, `portrait`, `anims`, `sounds`, `vfx` — all already point at existing `spearman.*` paths.

5. **Save** by pasting the edited text back into TBSDecompiler and saving.
6. **Verify the round-trip.** Re-open `character_classes.json.z` in TBSDecompiler and confirm your five changes are present. If it won't re-open or the edits are missing, restore the `.bak` and redo — a bad save corrupts the file.

### Batch 2 — Copy spearman art from the Banner Saga 3 install

You're replacing Factions' placeholder spearman art with BS3's "Tryggvi" art (Tryggvi is BS1/2/3's spear hero). Source files are named `tryggvi.*`; you rename them to `spearman.*` as you copy.

- **Source folder:** `%PROGRAMFILES(X86)%\Steam\steamapps\common\tbs3\assets\common\character\spearman\`
- **Target folder:** `%PROGRAMFILES(X86)%\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\`

**Step 0 — confirm every source exists before copying anything.** In PowerShell, `Test-Path` each `tryggvi.*` source below. If any is missing, **stop and report** — do not copy a partial set.

**Step 1 — back up the 7 files you're about to overwrite** (the 8th is brand new). Copy each existing Factions target to `<name>.bak-2026-05-29` in place first.

**Step 2 — copy with rename** (PowerShell `Copy-Item ... -Force`):

| BS3 source (`tbs3\...\spearman\`) | Factions target (`the banner saga factions\...\spearman\`) | Action |
|---|---|---|
| `tryggvi.portrait.swf` | `spearman.portrait.swf` | overwrite (back up first) |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.portrait.swf" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.portrait.swf" -Force
| `tryggvi.portrait_back.png` | `spearman.portrait_back.png` | **new file** — Factions has none; harmless because Batch 1 set `backPortrait: ""` |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.portrait_back.png" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.portrait_back.png" -Force
| `tryggvi.icon.versus.png` | `spearman.icon.versus.png` | overwrite — **this is the targeted fix for the missing search-screen portrait** |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.icon.versus.png" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.icon.versus.png" -Force
| `tryggvi.icon.init.active.png` | `spearman.icon.init.active.png` | overwrite |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.icon.init.active.png" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.icon.init.active.png" -Force
| `tryggvi.icon.init.order.png` | `spearman.icon.init.order.png` | overwrite |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.icon.init.order.png" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.icon.init.order.png" -Force
| `tryggvi.icon.party.png` | `spearman.icon.party.png` | overwrite |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.icon.party.png" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.icon.party.png" -Force
| `tryggvi.icon.roster.png` | `spearman.icon.roster.png` | overwrite |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.icon.roster.png" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.icon.roster.png" -Force
| `tryggvi.icon.promotion.png` | `spearman.icon.promotion.png` | overwrite — pairs with Batch 1 edit #5 |
Copy-Item -Path "${env:ProgramFiles(x86)}\Steam\steamapps\common\tbs3\assets\common\character\spearman\tryggvi.icon.promotion.png" -Destination "${env:ProgramFiles(x86)}\Steam\steamapps\common\the banner saga factions\assets\common\character\spearman\spearman.icon.promotion.png" -Force

**Do NOT copy these** (deliberate — keep Factions' existing versions):

| BS3 source | Why skip |
|---|---|
| `tryggvi.anim.json.z` | BS3's animation rig may not line up with Factions' battle-anim hooks → risk of T-pose / broken combat anims. Factions' existing `spearman.anim.json.z` is already verified working. |
| `tryggvi.sound.json.z` | Same risk — keep Factions' `spearman.sound.json.z`. |
| `tryggvi.portrait.swf` | **Does not exist in BS3.** BS3 uses `.clips` format for animated portraits; Factions requires `.swf`. Keep the existing `spearman.portrait.swf` (lancer_v0 placeholder). Confirmed missing at Step 0 during 2026-06-02 execution. |
| `tryggvi.icon.promotion.png` | **Does not exist in BS3.** Tryggvi is a named hero with no promotion icon. **Create a substitute instead:** resize `tryggvi.icon.versus.png` (159×492) to 321×932 using PowerShell + `System.Drawing` (bicubic, crop 61 px from bottom). The existing `spearman.icon.promotion.png` is a lancer placeholder at the correct dimensions and works as a fallback if the resize is skipped. Confirmed missing at Step 0 during 2026-06-02 execution. |

### Batch 3 — Remove the spearman shop entry from `acc.json`

**File:** `bsf-server\data\acc.json` (in this repo).

This file is the server's default shop/roster data. Removing the spearman entry takes it out of the Mead Hall shop, so the only way to get a spearman becomes "promote an axeman" — the whole point of this plan. Promoted spearmen get their stats from the class-def ranges you set in Batch 1, **not** from this file, so the old hand-tuned buyable stats here no longer apply.

1. Find the spearman purchasable: search for `"id": "spearman"`. It's a `PurchasableUnitData` object currently at **lines 74–134** (the `"entityClass": "spearman"` line confirms it). Line numbers can drift — confirm at edit time.
2. **Delete the entire object** — from its opening `{` through its closing `},` (the brace **and** the trailing comma). Dropping that trailing comma matters: the entry just before spearman already ends with a comma, so once spearman is gone that comma cleanly separates the previous entry from the `axeman` entry that follows, and the array stays valid JSON.
3. Save. No backup file needed — `acc.json` is tracked in git, so `git diff bsf-server/data/acc.json` shows the change and `git checkout bsf-server/data/acc.json` reverts it.
4. The server reads `acc.json` once at startup, so **restart the server** (`start-server.bat`) to pick up the change.

Once all three batches are applied, run the **Verification** loop in the next section.

---

## Verification

Adapted from §2.3 of `Plan-Spearman-Dredge-Cleanup-BS3-PoC.md`. Run after all three batches are applied.

1. `yarn test` — green (server tests unaffected).
2. `start-server.bat`.
3. Launch Factions with `--developer` in Steam launch options, **last on the line**.

> **`--developer` has to be the last run-mode option on the line, or it is cancelled.** All six of them write one setting and the last one wins. **None of the `launch-game-*.ps1` scripts qualify** — every one of them puts `--versus_start` after `--developer`, which both cancels it and sends the client to the match search instead of the town. For a versus test that needs developer mode, put `--versus_start` early and `--developer` last: the request for a match is never taken back, so you get both, arriving at the main menu and reaching the match search in one click. *(Measured in the running game on 2026-09-05.)* See [`docs/Development.md`](../docs/Development.md) → *Which screen a launch command lands on*.

4. Login → tutorial intro does NOT replay (regression check for the 2026-05-25 swallow bug).
5. Mead Hall shop → spearman is NOT listed (confirms Batch 3).
6. Open the promote-axeman UI on an existing rank-1 axeman → promotion picker shows **Spearman** as a third choice alongside Thrasher and Backbiter. The icon shown is the new BS3 tryggvi art.
7. Promote into spearman → unit becomes rank-2 spearman in the roster; roster icon is BS3-derived.
8. Drag promoted spearman into a party row → party-tag counter increments against the `axeman` 3-slot limit (shared with axeman/thrasher/backbiter).
9. Run a 1v1 versus match against a second client that is really in developer mode (see the note at step 3 — a launcher script will not do it):
   - **Search-screen party tabs:** spearman's icon renders for all 6 party portraits (fixes Bug 2).
   - Battle: spearman renders, action panel shows `abl_runthrough` + End + Rest.
   - Spearman executes `abl_runthrough` (charging strike) without freeze.
   - DJB hash matches across both clients through at least one full turn.
10. End match cleanly; renown awarded.
11. Optional — Promote a second axeman into spearman to confirm party-row works with multiple spearmen.

If any step fails, immediate rollback:

- Restore `character_classes.json.z.bak-spearman-as-promotion-2026-05-29`.
- Restore the 7 `.bak-2026-05-29` asset files.
- `git checkout bsf-server/data/acc.json`.

---

## Out of scope (future plans)

- **Real BS3 spear ability port** (`abl_impale`, `abl_pigsticker`, `abl_overwatch`). Needs `_ability_index.json.z` AMF3 edits, TBSDecompiler-based ability def transplant, and `AMOUNT`/`DAMAGE` variable handling per `findings_bs_modding.md:18`. Separate plan.
- **Lancer rank-3 promotion chain.** Lancer is the next promotion above spearman (per `parent: spearman` in registry), also has empty `actives`. If this PoC works, lancer follows the same template — `actives: ["abl_runthrough", ...]` substitution and BS3 art swap from the same `lancer_v0.*` BS3 assets.
- **Public distribution.** All edits are local-Steam-install-only. Other players see none of it. Distribution model deferred per project policy.
- **`PlanAddNewUnits.md` correction.** §3 "BS3 is plain JSON" claim is wrong; needs amend. Bundle with the future BS ability-port plan.
- **Documenting the new promotion path in `bsf-server/misc/findings_add_new_unit_process.md`.** That playbook doc was outlined in `Plan-Spearman-Dredge-Cleanup-BS3-PoC.md` §5 but never written. Once this plan is verified working, the spearman-as-promotion workflow should appear there as the second worked example.

---

## Tradeoffs and risks

- **Animation mismatch risk (Batch 2).** Not copying BS3's `tryggvi.anim.json.z` keeps Factions' existing spearman battle anims, but those were authored against the *placeholder* spearman model — the BS3 portrait/SWF may animate visibly wrong on Factions' rig. Symptom: T-pose or stuck idle in battle. Mitigation visible in step 9. Fallback: also copy `tryggvi.anim.json.z`, accept unknown BS3-vs-Factions compat risk; or revert all art and live with the search-screen miss.
- **Existing rank-1 spearman silently clamps to rank 2.** Any spearman currently in the user's roster (carried over from the 2026-05-28 testing) will get its RANK stat clamped from 1 to 2 at next login because of the new class-def range (`min: 2`). Other stats may also adjust to fit the new ranges. No data loss but the unit's combat profile changes.
- **Promotion UI rendering with three choices.** Today axeman only has two promote options (thrasher, backbiter). The picker UI may not lay out cleanly with three. Visible in step 6.
- **User's stat-tuning work goes away.** The `clampStats`-tuned `acc.json` spearman entry is deleted in Batch 3. Promoted spearmen derive stats from the class def, not from `acc.json`. Acceptable per decision (A).
- **Power-level mismatch race** (`Codebase-Review-Findings-2026-05-07.md` §3.3). Adding a rank-2 unit accessible via promotion widens the power spread slightly. Pre-existing bug; do not block this plan on it.
- **TBSDecompiler save risk.** TBSDecompiler saves overwrite the file. Always make per-task `.bak-<date>` backups before saving. The project's `.orig` baseline is already in place and not touched.
- **Single-developer bus factor** (persistent project risk). This plan is intended to be picked up cold from this document; the "Current state" and "Next action" anchors at the top should let a future contributor (or future Claude session) continue without re-deriving the context.

---

## Order of operations when continuing

1. **Present Batch 1 as a full What/Why/Tradeoff approval message.** Wait for explicit `y`.
2. Apply Batch 1 via TBSDecompiler. Backup first. Save. Verify by re-opening the file and re-reading the spearman block.
3. **Present Batch 2.** Wait for `y`. Apply via PowerShell `Copy-Item` with `-Force`. Backup originals first.
4. **Present Batch 3.** Wait for `y`. Apply via Edit tool to `acc.json`.
5. Walk the verification loop (steps 1-11 above). Report per-step pass/fail.
6. On any failure: rollback per "rollback" notes in §Verification. Diagnose. Re-plan if needed.
7. Once green: prompt user about updating `Plan-Spearman-Dredge-Cleanup-BS3-PoC.md` and `PlanAddNewUnits.md` to record the lessons learned (separate approval cycle).
8. Prompt user about creating a git commit (per `bsf-server/CLAUDE.md` "After Completing Changes" §).
