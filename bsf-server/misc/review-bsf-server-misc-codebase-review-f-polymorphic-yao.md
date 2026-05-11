# Plan: BSF Server Blocker Fixes — Tiers 1, 2, 3

## Context

A 2026-05-07 codebase review (`bsf-server/misc/Codebase-Review-Findings-2026-05-07.md`) identified 10 blockers. This plan implements them in the recommended sequencing order from §4 of that document — three approval batches matching tiers 1–3. Tier 4 (security gaps + races) and Tier 5 (extra quick wins from §3.5) are explicitly deferred.

The active branch is `RichardElTaino-MVP_documentation-Phase1`. The pre-commit hook runs `yarn build && yarn test`. Per project working style (`bsf-server/CLAUDE.md`), every edit is presented as **What / Why / Tradeoff** and gated on `y` approval — each tier is its own approval cycle.

The branch already shows partial mitigations in the Battle.ts code (commented `C-1`, `M-4`, `HIGH-4`, `HIGH-5` markers from a prior review pass), so blockers #1 and #2 will tighten existing code, not introduce it from scratch.

---

## Approach

### Batch 1 — Data Integrity (`Battle.ts` only)

#### Fix #1 — Double endgame race (Battle.ts:407–411)

**Current state:** The check at line 408 is `if (party.length === 0 && battle.winner === null)`. The `// C-1` marker shows the race was acknowledged but not fully closed: `endgame()` is async, so a second concurrent `/killed` could in principle pass the check before the first sets `winner`.

**Fix:** Add `Battle.endgameStarted: boolean` (default `false`). Replace the check with `party.length === 0 && !battle.endgameStarted`. Set `battle.endgameStarted = true` on the same line as `battle.winner = ...`, before the `endgame()` call. Reuse the same flag in `/battle/exit` (line 423) and the new `/battle/surrender` route (Batch 3).

**Tradeoff:** One new boolean field on Battle. Cheap. Becomes the single mutex for "battle has finalized" so future routes (e.g., timeout-based forfeit) plug in cleanly.

#### Fix #2 — Silent renown loss (Battle.ts:462–545)

**Current state:** `Promise.all([addRenown, addRenown, saveBattleResult])` at lines 462–474 is fire-and-forget. The `pushData()` calls for `RenownMessage` and `BattleFinishedData` at lines 528–545 run *unconditionally*, before any DB write resolves.

**Fix:** Move the construction of `RenownMessage` + `BattleFinishedData` and the per-session `pushData()` loop *inside* the `.then()` block. On `.catch()`, push a fallback `BattleFinishedData` with `total_renown: 0` plus a chat-style error message ("Battle results could not be saved — please report") so the client UI doesn't hang.

Achievement progress data (lines 477–494) stays where it is — those are zero-deltas today and don't depend on renown.

**Tradeoff:** Players see the victory screen ~5–50 ms later (one DB roundtrip). Acceptable: endgame fires once per battle. Clients no longer see inflated renown without a backing DB row.

---

### Batch 2 — Security Blockers

**Files:** `auth.ts`, `discord.ts`, `app.ts`, `package.json`.

#### Fix #3 — Session key entropy (auth.ts:21–23)

`crypto.randomBytes(8)` → `crypto.randomBytes(16)`. 64 → 128 bits of entropy. Hex output goes from 16 to 32 chars. `crypto` is already imported.

**Tradeoff:** No client change. URL paths grow by 16 chars — well within HTTP limits. Existing in-memory sessions stay valid (only newly-issued keys differ).

#### Fix #4 — OAuth CSRF state (discord.ts:26–35, 81–115)

The `TODO HIGH-1` comment already prescribes the shape. Implementation:

1. Module-level `pendingStates: Map<string, number>` (state → expiry). Add a 5-min TTL sweeper via `setInterval` (mirror the session TTL sweeper at `auth.ts:99–120`).
2. `getDiscordOAuthURL()` returns `{ url, state }`; state is `crypto.randomBytes(16).toString("hex")`, also recorded in `pendingStates` with `Date.now() + 5*60*1000`.
3. `GET /login/discord/` handler sets `Set-Cookie: bsf_oauth_state=<state>; HttpOnly; SameSite=Lax; Path=/login/discord; Max-Age=300` directly on the response (no `cookie-parser` dependency — write the header manually). Then redirects to the Discord URL with `&state=` appended.
4. `/oauth-callback` parses `req.headers.cookie` (split on `;`, find `bsf_oauth_state=`), compares to `req.query.state`, checks `pendingStates` membership and expiry. Mismatch / missing / expired → redirect to `bsf://auth?error=invalid_state`. Match → delete from map, proceed.

**Tradeoff:** No new dependency. State map is in-memory — server restart mid-OAuth means user sees `invalid_state` and retries. Acceptable for revival-server scale.

#### Fix #5 — Steam overlay path bypass (app.ts:58–62)

The current `req.path.startsWith("/session/steam/overlay/")` is a prefix bypass. Replace with an explicit allowlist (`Set<string>`) of the actual overlay paths used by the client. Confirm the path set from `bsf-server/data/game_captures/` (Fiddler captures) and the decompiled client's `tbs/srv/` directory. If only one path is used in practice, hardcode it.

**Tradeoff:** Future careless additions under `/session/steam/overlay/X` no longer auto-bypass auth. Cost: maintaining the allowlist, which is small.

#### Fix #6 — Login rate limiting (auth.ts:146)

Add `express-rate-limit` (~30 KB, well-maintained). Apply to `AuthRouter.post("/login/:httpVersion", ...)` at 5 attempts / minute / IP, with a 1-minute lockout on threshold breach. Standard `429` response.

**Tradeoff:** New dep, but no smaller alternative without rolling our own. Rate-limit state is per-process, in-memory — fine for single-host deployment.

---

### Batch 3 — Missing Routes

**Files:** `auth.ts` (one-line), `roster.ts`, `Battle.ts`, **NEW** `services/lobby.ts`, `app.ts`.

#### Fix #10 — vbb_name hardcoded null (auth.ts:85, one line)

`vbb_name: null` → `vbb_name: this.display_name`. Per `Findings-Client-ActionScript-Crossplay.md` Item 3, the client stores `credentials.vbb_name = jsonObject.vbb_name`; populating it correctly matches protocol expectation.

#### Fix #7 — `/services/roster/unit/stats/reset` (new in roster.ts)

New `RosterRouter.post("/unit/stats/reset/:session_key?", ...)`. Body: `{ unit_id }` (per decompiled `ResetStatsTxn.as`). Logic:

1. Look up the unit in `session.accountData.roster_json` by `unit_id`.
2. Restore stats from the original `purchasable_units` template in `data/acc.json` matching the unit's `entityClass`.
3. Refund the renown spent on stat purchases via `addRenown(session.steam_id_str, refund)` (mirror the cost path in `/unit/stats/purchase`).
4. `saveRoster()`. Respond `res.send()`.

**Tradeoff:** Renown refund policy is a design call — full refund matches the symmetric "you can change your mind" UX implied by the route's existence. Open Question 1 below.

#### Fix #8 — `/services/battle/surrender` (new in Battle.ts)

New `BattleRouter.post("/surrender/:session_key", ...)`. Body: `{ battle_id, turn }` (per decompiled `BattleTxnSurrenderSend.as`). Logic mirrors the surrender branch already in `/battle/exit` (lines 422–426) — extract a shared helper `finalizeSurrender(data)` so both routes share one implementation:

```typescript
const finalizeSurrender = async (data: any): Promise<void> => {
    const battle: Battle = data.battle;
    if (battle.endgameStarted || !data.opponent) return;
    battle.winner = data.opponent.account_id;
    battle.endgameStarted = true;  // atomic guard from Fix #1
    await endgame(data);
};
```

`/exit` keeps its current behavior (calls `finalizeSurrender` if battle still live, then cleans up parties). `/surrender` calls `finalizeSurrender` and responds — does NOT delete from `battle.parties` (the player stays "in" the finished battle until the client disconnects, matching the `/exit` semantic).

Add `/surrender/` to the BattleRouter middleware exception (currently only `/exit/` is allowed when opponent is null).

**Tradeoff:** Small refactor to extract the helper. Both routes now share one tested codepath.

#### Fix #9 — `/services/lobby/*` (4 stub routes — Option 1: stateless stubs)

**Decision:** Stateless 200 stubs only. No real party/invite logic. Real lobby behavior is out of scope; tracked separately as a GitHub issue (see Post-Batch-3 step below).

New file `bsf-server/src/services/lobby.ts` exporting `LobbyRouter`. Mount in `app.ts` next to `RosterRouter`. Routes (per decompiled client):

- `POST /:action` (matches `LobbyTxn` — `param3` is action name, body is generic int)
- `POST /options` (LobbyOptionsTxn — body is `LobbyOptionsData` JSON)
- `POST /invite` (LobbyInviteTxn — body is `LobbyOptionsData` JSON)
- One additional route to be enumerated from `tbs/srv/` (likely `/leave` or `/start`)

All four return `res.send()` with empty 200 body. No state. The Flash client UI will progress past the squad-creation screen but two players cannot complete a real lobby flow — that's acceptable per the findings doc ("at minimum stateless stubs returning 200").

**Tradeoff:** Stubs unblock UI rendering without committing to a stateful design. The "Challenge a Friend" / private-match feature remains non-functional. Captured in a GitHub issue with the three implementation options for future scoping.

#### Post-Batch-3 step — File GitHub issue: "Lobby routes are stateless stubs"

Once Batch 3 is shipped, run `gh issue create` with a title like "Lobby routes are stateless stubs — Challenge-a-Friend feature non-functional". Body documents:

- **Current state:** 4 routes return 200 empty; no lobby state exists server-side.
- **Why it matters:** Players cannot create private matches or invite friends.
- **Three implementation options:**
  1. Stateless stubs (current — done in Batch 3)
  2. In-memory lobby state (mirror `Battle` class; ~200–400 LOC; lost on restart)
  3. DB-backed lobbies (adds schema + migration; persistent invite history)
- **Recommendation:** Option 2 if/when the feature is prioritized; Option 3 only if invite history becomes a product requirement.
- **Reference:** decompiled `tbs/srv/LobbyTxn.as`, `LobbyOptionsTxn.as`, `LobbyInviteTxn.as`, `LobbyOptionsData`.

---

## Critical Files Summary

| File | Batches | Reason |
|------|---------|--------|
| `bsf-server/src/services/battle/Battle.ts` | 1, 3 | Race fix + renown reorder + /surrender |
| `bsf-server/src/services/auth/auth.ts` | 2, 3 | Session key entropy + rate limit + vbb_name |
| `bsf-server/src/services/auth/discord.ts` | 2 | OAuth state CSRF |
| `bsf-server/src/app.ts` | 2, 3 | Steam overlay scoping + lobby mount |
| `bsf-server/package.json` | 2 | `express-rate-limit` dep |
| `bsf-server/src/services/roster.ts` | 3 | /unit/stats/reset route |
| `bsf-server/src/services/lobby.ts` (new) | 3 | Lobby stubs |

## Existing Utilities to Reuse

- `endgame()` at `Battle.ts:438` — surrender route reuses
- `addRenown()` at `db/account.ts:67` — stats-reset refund reuses
- `saveRoster()` in `db/account.ts` — stats-reset persistence
- BattleRouter middleware exception pattern at `Battle.ts:188` area — surrender follows the same `/exit`-style allowance for null opponent
- `Session.account_id` at `auth.ts:75` — surrender uses to identify winner
- `crypto.randomBytes(...)` already imported in `auth.ts:1` — used for new state values
- TTL sweeper pattern at `auth.ts:99–120` — mirrored for `pendingStates` cleanup

---

## Verification

After **each batch**, in order:

1. `yarn build` must compile.
2. `yarn test` must pass all 50 existing tests.
3. Targeted manual tests below.
4. Pre-commit hook (auto-runs build + test) must pass on commit.

### Batch 1 — Data integrity
- Run `test-2p-match.bat` end-to-end. Verify renown awarded exactly once and `BattleFinishedData` arrives.
- Add a unit test that fires two `/killed` calls back-to-back via Supertest and asserts `addRenown` is invoked exactly twice (winner + loser), not four times. Spy on `addRenown`.
- Force a DB-write rejection (mock `addRenown` to throw) and verify clients receive the error message rather than inflated `RenownMessage`.

### Batch 2 — Security
- Login response: `session_key` is 32 hex chars (was 16).
- `GET /login/discord/`: response sets `Set-Cookie: bsf_oauth_state=...` and the redirect URL contains `&state=`. Callback without the cookie redirects to `bsf://auth?error=invalid_state`.
- Hit `/services/session/steam/overlay/<path-not-on-allowlist>` with no auth: should now 403, not 200. Hit a known-allowlisted overlay path: still 200.
- Send 6 login attempts within 60 s from one IP: 6th returns 429.

### Batch 3 — Routes
- Login response: `vbb_name === display_name`, not null.
- Stats reset: purchase a stat upgrade, then POST `/services/roster/unit/stats/reset/<session_key>` with `{ unit_id }`. Verify stats restore and renown refund.
- Surrender: in a 2p battle, POST `/services/battle/surrender/<session_key>` from one player. Both receive `BattleFinishedData` with the surrendering player as loser. Battle is removed.
- Lobby: hit each of the 4 routes — each returns 200 empty body. Client UI progresses past squad creation.

### End-to-end
After all three batches: full `launch-game-2p.ps1` run. Login → queue → battle → endgame must complete cleanly with no console errors.

---

## Resolved Decisions

1. **Lobby scope** — Option 1: stateless 200 stubs. Real implementation tracked as a follow-up GitHub issue (created post-Batch-3).
2. **Stats-reset renown refund** — Full refund. Mirror the cost path in `/unit/stats/purchase` so every renown spent on the unit's stat upgrades is added back via `addRenown()`.
3. **Batch granularity** — Three separate commits, one per tier. Each gated on its own `y` approval cycle per `bsf-server/CLAUDE.md` working style. Each tier shippable / revertable independently.
4. **Issue tracking** — 10 GitHub issues, one per blocker, plus 1 follow-up issue for the lobby-stubs tradeoff. Existing related issues (#43 renown desync, #46 vbb_name fallback) get cross-linked but not closed by us — closing waits until each is verified resolved.
5. **Workflow split** — Tier 1 (data integrity) is implemented in the current chat where Battle.ts context is freshest. After Tier 1 ships, a new chat picks up Tier 2 + Tier 3 using this plan file as the handoff entry point.

---

## Pre-Tier-1 Step — Create GitHub Issues (Banner-Saga-Factions/BSF-Custom-Server)

Before Batch 1 implementation begins, create 10 issues — one per blocker — via `gh issue create`. Suggested titles (all live in the same repo as existing #18–#43):

| # | Title | Cross-link |
|---|-------|-----------|
| 1 | bug: double endgame race in /battle/killed (Battle.ts:407–411) | adjacent: #19 |
| 2 | bug: silent renown loss when DB write fails after pushData (Battle.ts:462–474) | duplicates: #43 |
| 3 | security: session keys are 64-bit, brute-forceable (auth.ts:21–23) | — |
| 4 | security: Discord OAuth missing CSRF state parameter (discord.ts TODO HIGH-1) | — |
| 5 | security: /services/session/steam/overlay/* prefix bypass exempts future routes (app.ts:58–62) | — |
| 6 | security: no rate limit on /services/auth/login (auth.ts:146) | — |
| 7 | feat: missing /services/roster/unit/stats/reset route (ResetStatsTxn) | — |
| 8 | feat: missing /services/battle/surrender route (BattleTxnSurrenderSend) | — |
| 9 | feat: missing /services/lobby/* routes — stubs only | (follow-up issue tracks Option 2/3) |
| 10 | bug: vbb_name hardcoded null in login response (auth.ts:85) | adjacent: #46 |

Each issue body includes: severity from findings doc, file:line, fix sketch, link to `bsf-server/misc/Codebase-Review-Findings-2026-05-07.md` §3.1. Tier 1 issues (#1, #2) are the only ones that need to be open *before* Tier 1 implementation begins; the rest can be batched.

After Tier 1 ships, the second chat continues by reading: this plan file → the relevant tier issues → the Codebase-Review-Findings doc.
