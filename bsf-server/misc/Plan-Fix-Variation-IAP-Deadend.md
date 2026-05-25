# Fix the broken "promote/variation" flow that dead-ends at Stoic's defunct store

## Context

The branch is named `bug/promote-units-fails`, but investigation found that the
core rank-up promote endpoint (`POST /services/roster/unit/promote`) **works
correctly** — server code at `bsf-server/src/services/roster.ts:44-83` matches
the Java reference, all 8 tests in `bsf-server/test/routes/roster.test.ts:100-182`
pass, and the user confirmed they can no longer reproduce a rank-up failure.

The **actual** reported failure happens in the same Promotion UI but on a
different path: clicking the **3rd unit color variation** in the variations
popup. The chain is:

1. Client checks if the player has the variation's `unlock_id` (IAP-gated).
2. Player doesn't, so client tries to open the in-game Steam overlay to buy it
   (`IapManager.purchase` in `engine/session/IapManager.as:69`).
3. Steam overlay isn't available (game launched outside Steam, or no overlay).
4. Client falls back to opening the web store URL hardcoded in
   `game/gui/pages/marketplace/GuiMarketplace.as:142`:
   `http://store.stoicstudio.com` → **HTTP 404** (Stoic Studio shut down in 2020).

Net effect: every paid color variation is unobtainable on the custom server.
Players get a confusing two-popup error chain and a dead link.

We can fix this **entirely server-side**, without patching the SWF: the client
treats a variation as already-owned (no IAP gate) when `hasUnlock(unlock_id)`
returns true. The unlocks list comes from `/account/info`. If the server
includes every variation's `unlock_id` in the player's `unlocks` array, the
3rd-variation click path becomes a normal purchase (renown only) instead of
an IAP path. The Java reference (`UnitVariationSvc.java`) also exposes a
`POST /services/roster/unit/variation/{sessionKey}/{unit_id}/{variation}/{lobby_id}`
endpoint to record the chosen variation; our server doesn't implement it yet,
so we add a minimal handler so the chosen variation actually persists.

## Recommended approach

Two-part server-only change:

1. **Grant every variation unlock to every account.** Extend the default
   `unlocks` array in `bsf-server/data/acc.json` and the
   `/account/info` response so the client never sees a locked variation.
2. **Implement `POST /services/roster/unit/variation/...` minimally** so when
   the player confirms a variation pick, the server records it on the unit and
   broadcasts to lobby members (matching the Java semantics, minus IAP).

This avoids client patching and removes the dead-store dead-end without
charging real money for items Stoic no longer sells.

## Critical files

### Read first (to confirm wiring)
- `bsf-server/data/acc.json` — `unlocks: []` at line 8 is the new-account default
  served via `/account/info`. Has to be populated.
- `bsf-server/src/services/account.ts` — `/account/info` handler; cross-check
  it uses `acc.unlocks` from the row, not a hardcoded `[]`.
- `bsf-server/src/db/account.ts` — confirm an `unlocks` column exists on
  `accounts` (or that the JSON blob carries it). If absent, the unlocks list
  must be merged into the response from a static source so existing accounts
  also get the grant without a DB migration.
- `bsf-server/src/services/roster.ts` — to register a new
  `RosterRouter.post("/unit/variation/...")` handler next to
  `unit/promote`, `unit/rename`, `unit/retire`, `unit/hire`.
- Reference: `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\web\svc\roster\unit\variation\UnitVariationSvc.java`
  (request shape, validation, `LobbyUnitVariationData` push).
- Reference: `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\game\gui\GuiPromotion.as:509-580`
  (the `onStoreOnlyVariationButtonClick` path that the user is hitting).
- Reference: `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\game\session\actions\UnitVariationTxn.as`
  (URL the client POSTs to: `services/roster/unit/variation/{session}/{unit_id}/{variation}/{lobby_id}`).

### Reuse, don't duplicate
- `saveRoster()` in `bsf-server/src/db/account.ts:95` — already the canonical
  way to persist a mutated `roster_json`; the new variation handler reuses it
  exactly the way `unit/rename` does (in-memory mutate → save → revert on
  failure pattern at `roster.ts:97-108`).
- `Session.pushData(...)` in `bsf-server/src/services/auth/auth.ts` — already
  used by `unit/retire` (`roster.ts:148-155`) to push a `RenownMessage`; we use
  the same path for the lobby variation broadcast.
- `ServerClasses` enum in `bsf-server/src/const.ts` — add `LOBBY_UNIT_VARIATION_DATA`
  next to existing `LOBBY_*` constants (mirrors `tbs.srv.data.LobbyUnitVariationData`
  from the Java reference).

### Files to change
1. `bsf-server/data/acc.json` — set `unlocks` to the full list of variation
   unlock_ids (decoded from the shipped `assets/common/iap/in_app_purchase.json.z`):
   `var_all`, `var_thrashers`, `var_axemasters`, `var_backbiters`,
   `var_skystrikers`, `var_bowmasters`, `var_siegearchers`, `var_warhawks`,
   `var_warmasters`, `var_warleaders`, `var_provokers`, `var_shieldmasters`,
   `var_strongarms`, plus the "all" bundles `var_all_raiders`,
   `var_all_archers`, `var_all_warriors`, `var_all_shieldbangers`. Keep the
   r3 unit unlocks (`raidmaster_iap_r3`, `warmaster_iap_r3`, `bowmaster_iap_r3`,
   `shieldmaster_iap_r3`) out of this grant — those govern hiring a rank-3 unit
   directly, which the Great Hall shop already covers per commit `4c7c8b0`.

2. `bsf-server/src/services/account.ts` — in the `/account/info` handler,
   merge the static variation-unlock list into the response's `unlocks`
   array (union with whatever the DB row has). This ensures **existing**
   accounts also get the grant without a migration. Comment the source
   (`assets/common/iap/in_app_purchase.json.z`) so a future contributor
   knows where the list came from.

3. `bsf-server/src/services/roster.ts` — add `RosterRouter.post("/unit/variation/:session_key?/:unit_id?/:variation?/:lobby_id?", ...)`:
   - Parse `unit_id`, `variation` (int), `lobby_id` from URL params
     (Java's `UnitVariationSvc.java:32-45` uses path params; our existing
     `roster.ts` handlers all use body, but variation must match the client
     URL above).
   - 401 if no session, 404 if `unit_id` not in roster.
   - Find the appearance def: needs the character-class appearance list.
     The server doesn't currently load this; for the minimal fix, accept any
     `0 ≤ variation < 16` (the AS3 model is a 16-bit acquire bitfield in
     `EntityDef.as:359`) and skip the unlock_id/cost validation — the client
     UI has already prevented the user from picking something they can't have.
   - Mutate the unit in-memory: set `unit.appearance_index = variation` and
     OR-in the bit on `unit.appearance_acquires` (default 0 if missing).
   - Persist via `saveRoster(session.steam_id_str, acc.roster_json)`; revert
     on failure (mirror the pattern at `roster.ts:97-108`).
   - If `lobby_id` is set and a lobby exists for it (see
     `bsf-server/src/services/lobby.ts`), push `LobbyUnitVariationData`
     (`class: ServerClasses.LOBBY_UNIT_VARIATION_DATA`, `unit_id`, `variation`,
     `user_id: session.account_id`) to other lobby members.
   - Respond `res.send()` (empty body; matches the project's other roster
     handlers and the AS3 `HttpJsonAction` tolerates empty bodies — verified
     at `engine/core/http/HttpJsonAction.as:27-69`).

4. `bsf-server/src/const.ts` — add `LOBBY_UNIT_VARIATION_DATA = "tbs.srv.data.LobbyUnitVariationData"`
   next to the other `LOBBY_*` entries.

5. `bsf-server/test/routes/roster.test.ts` — add a `describe("POST /services/roster/unit/variation...")`
   block with 4 tests, sibling to the existing `promote` suite at line 100:
   - applies variation 0 → `appearance_index` updated, `saveRoster` called once.
   - applies variation 7 → bit 7 set on `appearance_acquires`.
   - returns 404 for unknown `unit_id`.
   - reverts in-memory state when DB throws (`vi.mocked(saveRoster).mockRejectedValueOnce(...)`).
   Plus one extension to the existing `/account/info` test (file:
   `bsf-server/test/routes/account.test.ts` or wherever it lives) that
   asserts the response's `unlocks` includes `var_thrashers`.

6. `bsf-server/CHANGELOG.md` — add an entry following the project's
   plain-English-then-`*Technical:*` convention (see `CLAUDE.md` "Changelog
   Entries"). One paragraph: what was wrong (the 3rd color option opened
   a dead web store), why it mattered (players couldn't ever change unit
   colors), what we did (granted all color unlocks on the custom server and
   wired up the variation-save endpoint).

## Verification

End-to-end test (per the project's "After Completing Changes" workflow in
`bsf-server/CLAUDE.md`):

1. **Unit tests** — prompt user to run `yarn test` in `bsf-server/`. All 50
   existing tests still pass; the 4 new variation tests pass; the extended
   account-info test passes.
2. **Manual repro** with both clients:
   - User runs `start-server.bat` (rebuild + restart so the new `acc.json` and
     route load) and `launch-game-2p.ps1` (two clients in versus mode).
   - In Client A: enter Proving Grounds → pick any unit → open the variations
     popup → click the **3rd option** → confirm no "missing steam overlay"
     dialog, no "visit online store" popup, no browser tab opens.
   - The unit's portrait updates immediately to the new variation.
   - Server log (`bsf-server` stdout) shows `POST /services/roster/unit/variation/...
     200`.
   - In Client B (if A is in a lobby with B): the variation change is mirrored
     on B's view of A's unit (via the `LobbyUnitVariationData` push).
3. **Persistence** — close client A, relaunch, log in: the chosen variation
   survives (proves `saveRoster` actually wrote it).
4. **Regression** — promote a rank-1 unit to rank 2 (the original code path
   from this branch's name) and confirm it still works exactly as before.

If step 2 still shows the IAP error, the most likely cause is that
`/account/info` isn't actually surfacing the merged `unlocks` to the client —
log the response payload and diff against what the AS3 `AccountInfoTxn`
expects (`game/cfg/AccountInfoDef.as`).
