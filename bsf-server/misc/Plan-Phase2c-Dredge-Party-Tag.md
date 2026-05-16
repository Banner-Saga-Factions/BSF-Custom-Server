# Plan — Phase 2c: Unblock Dredge in the Party Row

_Drafted 2026-05-10. Successor to Phase 2b (commit `f5fd99b`)._

## Context

Phase 2b shipped seven new dredge purchasable entries to `acc.json` and
corrected their stats (commit `f5fd99b`). The remaining Phase 2b blockers
(per `findings_unit_extensibility.md:259–267`) are:

1. ✓ Stat fix — done.
2. **Proving Grounds portrait hang** — _partial fix already in flight._ The
   user has hand-edited `character_classes.json.z` to add
   portrait/back/promote/versus links to `dredge_stoneguard` (using
   `axeman/thrasher_v0` clip + icons as a stand-in). Result: Mead Hall lets
   the player hire `dredge_stoneguard` and the Proving Grounds page now
   loads.
3. Gate-check re-run.
4. ✓ Comment removal — done.

A new blocker surfaced in the gate-check attempt: when the user drags the
hired `dredge_stoneguard` from the roster row to a party row, the UI shows
a `0 / 0` counter beside the row and refuses the drop. Raider drags show
`1 / 3`, varl drags show `1 / 2`. Dredge cannot be added.

**Why this matters now:** until the player can actually deploy a dredge
unit into the party, the gate-check (Phase 2b pending item 3) cannot
complete, and the `cost: 9990` sentinel cannot be safely lowered. Without
a fix, the portrait-link work for `dredge_stoneguard` is wasted.

**Out of scope:**
- Portrait/asset fixes for the other 8 dredge classes (`grunt`, `torpor`,
  `scourge`, `bellower`, `slag/fire/doom/sun_slinger`). `stoneguard` is
  already done. The other 8 remain a follow-up in the same Phase 2b
  work-stream.
- Lowering the `cost: 9990` sentinel.
- Any SWF recompile.
- Server-side changes — the server doesn't validate party composition.

## Findings: how the X / Y counter works

Verified against `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\...`.

- **Counter widget:** `engine/gui/.../GuiRoster.as:491–517`. On
  `onGuiIconMove`, reads `entityClass.getPartyTagLimit(meta)` and writes
  that into `textPartyLimitTotal` (the "/3", "/2", or "/0" you see). The
  current count comes from `partyLimitNameDict` keyed by `partyTagDisplay`.
- **Per-class lookup:** `engine/entity/def/EntityClassDef.as:89–91`.
  ```
  public function getPartyTagLimit(param1:EntitiesMetadata) : int {
     return param1.getPartyTagLimit(_partyTag);
  }
  ```
- **Limits source-of-truth:** `engine/entity/def/EntitiesMetadata.as:18–28`.
  ```
  public function getPartyTagLimit(param1:String) : int {
     for each(var _loc2_ in partyTagLimits) {
        if(_loc2_.tag == param1) return _loc2_.limit;
     }
     return 0;          // <-- the bug surface
  }
  ```
  `partyTagLimits` is loaded from the **top-level** `partyTagLimits` array
  in `character_classes.json.z` via `EntitiesMetadataVars`.
- **Server-side validation:** `engine/entity/def/PartyDef.as:200–218`
  (`partyLimitsExceeded`) — same lookup; first dredge attempted makes
  `++count > 0` always true, so the drop is rejected.

**Root cause (one sentence):** `character_classes.json.z` has no
`partyTagLimits` entry for the tag `"dredge"`, so the lookup falls through
to the default `return 0`, and the counter renders as `0 / 0`.

There is no explicit "deny dredge" code path. Every race not present in
`partyTagLimits` is treated identically — silently capped at 0.

## Recommended Approach

**Single data edit** to the existing `character_classes.json.z` (the same
file the user just patched for portrait links). No SWF recompile, no
server change.

### Edit

In `C:\Program Files (x86)\Steam\steamapps\common\the banner saga factions\assets\common\character\character_classes.json.z`:

Locate the **top-level** `partyTagLimits` array. It currently contains
entries like `{ "tag": "raider", "limit": 3 }` and
`{ "tag": "varl", "limit": 2 }`. Add one new entry:

```
{ "tag": "dredge", "limit": 1 }
```

Save back as zlib-compressed AMF3 using whatever tool produced the working
portrait edit (JPEXS / `TBS_Decompiler3.2.3.air` / equivalent).

**Limit choice = 1** — matches today's reality: only `dredge_stoneguard`
has working portrait links, so the realistic max is 1 dredge anyway.
Bumping to 2 / 3 / 6 later is a one-number edit if more dredge classes
get unblocked.

### Pre-edit verification (one-time, cheap)

While the file is open, confirm the dredge entity classes do carry
`partyTag: "dredge"` (the AS3 lookup is by tag string, so the entity must
declare it). If any dredge class has a missing or differently-spelled
`partyTag`, set it to `"dredge"` while you're in there. Almost certain to
be fine — the `partyTag` field on `EntityClassDef` is loaded straight
from JSON (`EntityClassDefVars.as:69–72, 133`), and the prior decompile
grep showed `"partyTag": "dredge"` on dredge entries — but worth a
30-second visual check.

### Post-fix doc update

Append a short Phase 2c paragraph to `findings_unit_extensibility.md`
under the existing "Phase 2b" section, noting:
- The `partyTag` / `partyTagLimits` mechanism (so future readers don't
  re-discover it).
- That a `{tag: "dredge", limit: 1}` entry has been added to
  `character_classes.json.z`.
- That this is a **client-asset edit only** — not a code change in either
  repo, and not server-visible. Players who don't apply the same asset
  edit will continue to see `0 / 0`.

This doc edit is a separate approval step after the in-game change is
verified working.

## Tradeoffs / Risks

- **Asset-only fix, not code.** Lives in the Steam install, not in either
  git repo. Anyone running an unmodified install will still see `0 / 0`.
  That's acceptable: today's dredge entries are already gated behind
  `cost: 9990` and only the developer is meant to be able to hire them.
- **No gameplay validation downstream.** The server never inspects
  `partyTag`; the only enforcement is the client UI. A modified or hostile
  client could already field any composition regardless of this edit, so
  the edit doesn't expand any attack surface.
- **No backup needed beyond the existing `.orig`.** The install folder
  already has `character_classes.json.z.orig` next to the live file —
  rollback is `copy /Y character_classes.json.z.orig character_classes.json.z`.
- **Counter cosmetic detail.** `partyTagDisplay` is a localized string
  (`locale.translate(LocaleCategory.ENTITY, _partyTag)`). If no
  localization entry exists for `"dredge"`, the row label might render as
  the raw tag `"dredge"` instead of a pretty name. Cosmetic only — does
  not block gameplay.

## Critical Files

- `C:\Program Files (x86)\Steam\steamapps\common\the banner saga factions\assets\common\character\character_classes.json.z`
  — **only file modified.** Top-level `partyTagLimits` array gets one new
  entry.
- `C:\Program Files (x86)\Steam\steamapps\common\the banner saga factions\assets\common\character\character_classes.json.z.orig`
  — pre-existing backup; not touched.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\entity\def\EntitiesMetadata.as:18–28`
  — confirms the lookup logic; **not edited**, reference only.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\entity\def\EntityClassDef.as:89–91`
  — confirms per-class lookup wraps the metadata; **not edited**, reference
  only.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\entity\def\PartyDef.as:200–218`
  — confirms the same enforcement applies on commit; **not edited**,
  reference only.
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\game\gui\GuiRoster.as:491–517`
  — confirms the UI reads from the same lookup; **not edited**, reference
  only.
- `bsf-server/misc/findings_unit_extensibility.md` — Phase 2c paragraph
  appended in a follow-up doc-update step (after in-game verification,
  behind its own approval).

## Verification

1. **Edit applied:** Re-open the modified `character_classes.json.z` after
   save and confirm the new `{tag: "dredge", limit: 1}` entry is present
   in `partyTagLimits`. (Sanity: tooling round-trips correctly.)
2. **Client restart:** Fully relaunch the game client (no live reload for
   asset files).
3. **Counter check:** In the Mead Hall, drag `dredge_stoneguard` from the
   roster to a party row. The counter should now read `0 / 1` before the
   drop and `1 / 1` after. The drop should succeed.
4. **Drop denial check:** Drag `dredge_stoneguard` to a second party row
   while one is already in. The counter should read `1 / 1`, the row
   should highlight in the "limit reached" colour (per
   `updateSlotHighlight(..., 2)` at `GuiRoster.as:511`), and the second
   drop should be rejected. This proves the cap is being enforced at the
   new value.
5. **Negative regression:** Drag a raider — counter should still read
   `X / 3`. Drag a varl — counter should still read `X / 2`. (Confirms no
   other tag's limit was disturbed.)
6. **Gate-check progress:** With the dredge in the party, run a versus
   match against the developer's second client. Confirm no DJB hash
   divergence at turn 0 — that completes Phase 2b "Pending work" item 3
   for `dredge_stoneguard`. (Other dredge classes remain blocked on
   portraits.)
7. **Doc update:** Once steps 1–6 are confirmed in-game, present the
   Phase 2c paragraph for `findings_unit_extensibility.md` as a separate
   approval batch.
