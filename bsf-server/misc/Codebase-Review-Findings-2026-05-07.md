# BSF Codebase Review — Findings & Handoff

_Reviewed 2026-05-07 by 3 parallel Explore subagents (server security, concurrency, protocol alignment)._

This document is self-contained for handoff to a new chat. It includes context, findings, key insights, and lessons learned from the review session.

---

## 1. Context

**What BSF is:** A community revival server for *The Banner Saga Factions*, a defunct multiplayer turn-based strategy game (Stoic Studio, 2014). The Adobe AIR/Flash client communicates with this Express server over HTTP long-polling. All client protocol details were reverse-engineered from Fiddler captures.

**Repo layout:**
- `bsf-server/` — Node.js/TypeScript Express server (source of truth, this repo)
- `bsf-client/` — Original ActionScript/AIR client source (git submodule)
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\` — Decompiled shipped SWF (1,113 .as files: `engine/`, `game/`, `tbs/`, `lib/`, `GameMainAir.as`, `AneFixer.as`). Lives **outside** the BSF repo.

**full decompiled clients**
-factions: '%USERPROFILE%\Code\bsf-refs\client-swf-and-ane\' (raw SWF + ANE) and '%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\' (extracted AS3)
-banner saga 2: 'C:\decompile\bs2'
-banner saga 3: 'C:\decompile\bs3'



**Current branch:** `RichardElTaino-MVP_documentation-Phase1`

**Active goals (from `Plan-Enable-Mobile-Windows-Crossplay.md`):**
1. Add new units and abilities (6 ready via `acc.json` edit only) — **DONE 2026-05-09** (skystriker, provoker, warleader, axemaster, warhawk, strongarm now buyable in the Great Hall; verified in-game)
2. Discord OAuth authentication (90% built, two known bugs)
3. Mobile iOS/Android crossplay (server is platform-agnostic; mobile client needs Discord auth + asset path fixes)

---

## 2. Why This Review Happened

`/ultrareview` failed three times. The user pivoted to running the review directly in the terminal using **3 parallel Explore subagents**, each focused on a distinct review area, with prior research from `bsf-server/misc/` pre-loaded so agents could skip already-known territory.

**Pre-existing research (agents skipped these):**
- `findings_unit_extensibility.md` — Unit class whitelist, extensibility matrix, `acc.json` quick wins
- `Findings-Client-ActionScript-Crossplay.md` — Login response fields, entity naming `{account_id}+{index}+{unit_id}`, DJB hash divergence, long-poll behavior, `--server` override, NullSteamworks stub
- `findings_bs_modding.md` — Ability JSON variable-naming traps (`CHANGE_STAT`/`AMOUNT` vs `DAMAGE_STRARM`/`DAMAGE`), animation constraints, P-Code patching
- `Plan-Enable-Mobile-Windows-Crossplay.md` — `game_id` migration plan, OAuth state CSRF fix
- `BannerSagaDeveloperCheatsheet.md` — `--developer` flag bypasses client-side class whitelist

---

## 3. Review Findings — Ranked

### 3.1 Top 10 Blockers (fix before public deploy or crossplay)

*Status: blockers #1–#6 fixed; #7–#10 still open. Last updated 2026-05-08.*

| # | Severity | File:Line | Issue | Fix |
|---|---|---|---|---|
| 1 | Blocker | `services/battle/Battle.ts:407-410` | **Double endgame race** — `if (battle.winner === null)` check is async-unsafe; two concurrent `/killed` calls can both set winner and double-apply renown | Set `battle.winner` inside the same sync block as the check; or guard with `battle.finishedAt` flag |
| 2 | Blocker | `services/battle/Battle.ts:462-474` | **Silent renown loss** — `Promise.all([addRenown, addRenown, saveBattleResult])` is fire-and-forget; if any reject, in-memory `accountData.renown` is never updated but client already saw `BattleFinishedData` | Move `pushData()` into `.then()`; on `.catch()`, push an error message to client |
| 3 | Blocker | `services/auth/auth.ts:21-23` | ~~**Weak session keys** — only 8 bytes (64 bits). Brute-forceable in days at 10k guesses/sec~~ | Bump to 16 bytes (128 bits): `crypto.randomBytes(16).toString("hex")` — **FIXED 2026-05-08 — issue #53** |
| 4 | Blocker | `services/auth/discord.ts:26` (`TODO HIGH-1`) | ~~**OAuth CSRF** — no `state` param → account takeover via OAuth injection~~ | Implement state per `Plan-Enable-Mobile-Windows-Crossplay.md` Step 4 — **FIXED 2026-05-08 — issue #54** |
| 5 | Blocker | `app.ts:58-62` | ~~**Steam overlay path bypass** — `/services/session/steam/overlay/*` returns 200 unauthenticated; future routes under that prefix would inherit the bypass~~ | Move exemption inside the specific handler, not the prefix middleware — **FIXED 2026-05-08 — issue #55** |
| 6 | Blocker | `services/auth/auth.ts:146` | ~~**No login rate limiting** — enables Steam ID enumeration + session brute force~~ | Add `express-rate-limit`: 5 attempts/min/IP — **FIXED 2026-05-08 — issue #56** |
| 7 | Blocker | Missing route | `/services/roster/unit/stats/reset` — players cannot reset stat purchases | Add route; reset stats to defaults from `purchasable_units` template |
| 8 | Blocker | Missing route | `/services/battle/surrender` — players cannot surrender; trapped in losing battles | Add route; call existing `endgame()` with surrendering player as loser |
| 9 | Blocker | Missing routes (4) | `/services/lobby/*` — squad/party creation entirely non-functional | Implement at minimum stateless stubs returning 200 |
| 10 | Blocker | `services/auth/auth.ts:85` | **`vbb_name: null` hardcoded** in login response — client stores undefined for username | Change to `vbb_name: this.display_name` (one-line fix) |

### 3.2 Security Gaps (high-priority hardening)

- **Discord snowflake precision check is broken** — `discord.ts:96,126` uses `parseInt` then `.toString()` comparison; for 18-digit IDs both sides round identically, so the check passes even after precision loss. Use `BigInt` throughout.
- **`entityClass` not whitelisted server-side** — `services/roster.ts:77-88` accepts any string. Combined with `--developer` flag, players can field dredge/tutorial units in ranked play. Whitelist against `character_classes.json.z` keys.
- **JWT secret entropy not validated** — `app.ts:17-20` checks JWT_SECRET is set but not its length. Require ≥32 chars at startup.
- **`display_name` not sanitized** — `auth.ts:166-169` passes through with no length cap or character filter (XSS risk if web dashboard added later).
- **Chat messages unbounded** — `services/chat.ts:16-40` accepts any text length. Add 500-char cap + rate limit.
- **Session key extraction fragile** — `app.ts:64` extracts last URL segment as session key; routes like `/roster/unit/variation/{session_key}/{unit_id}/{variation}/{param6}` would extract `param6` instead. Blocks adding any route with trailing path params.
- **Renown costs are client-computed** — `services/roster.ts:174-175` accepts stat purchases without server-side cost validation. Patched clients could farm free upgrades.

### 3.3 Race Conditions

- **`pollingActive` listener leak** — `services/game.ts:27-45` doesn't `removeAllListeners("data")` when starting a new poll; client's instant 0-backoff reconnect can leave orphaned `onData` handlers attached to the session.
  - ⚠ **Correction (2026-07-28): "instant 0-backoff reconnect" is wrong.** The client sleeps a fixed gap between polls — 3 s normally, 1 s in battle. The 3000 ms constant it comes from is `HttpAction.send`'s **pre-send delay** argument, not a request timeout (`HttpCommunicator.as:135`; `HttpAction.as:106-114`). The leak itself was real and is since wrapped in `try/finally`, but do not reuse the "no gap between polls" premise — see [`../docs/client-contract.md`](../docs/client-contract.md) → R7.
- **Power level mismatch** — `services/queue.ts:144` snapshots power at queue entry, but `session.accountData` mutates via `/roster/*` calls. Player can queue at power 6 and play at power 12. Recompute power at match-creation time.
- **Battle exit with null opponent** — `Battle.ts:418-433` sets `battle.winner` then calls `endgame()`, which returns early on `data.opponent === null`. Battle left with winner set but no `BattleFinishedData` pushed. Client UI hangs.
- **`aliveUnits` init can throw mid-construction** — `Battle.ts:36-48` doesn't validate `accountData` is populated before iterating. If second player's accountData is still loading, constructor throws partway, but no try/catch wraps `new Battle()` in `queue.ts`.
- **Queue dual-splice fragility** — `queue.ts:84-85` calls `splice(indexOf(...))` twice; if either returns -1, splice removes the last item instead.
- **Session TTL eviction during battle** — `auth.ts:100-120` evicts the idle player but doesn't end the battle for the opponent. Opponent stuck in a battle with no opponent and no way to win.

### 3.4 Protocol Mismatches (Client → Server)

| Endpoint | Client class | Status |
|---|---|---|
| `/services/roster/unit/stats/reset` | `ResetStatsTxn` | ❌ Missing (Blocker #7) |
| `/services/battle/surrender` | `BattleTxnSurrenderSend` | ❌ Missing (Blocker #8) |
| `/services/lobby/*` (4 routes) | `LobbyTxn`, `LobbyOptionsTxn`, `LobbyInviteTxn` | ❌ Missing (Blocker #9) |
| `/services/roster/unit/variation` | `UnitVariationTxn` | ❌ Missing |
| `/services/account/tutorial` | `TutorialCompletedTxn` | ❌ Missing |
| `/services/tourney/join` | `TourneyJoinTxn` | ❌ Missing |
| `/services/iap/{init,info,finalize}` | IAP transaction classes | ❌ Missing (likely intentional) |
| `/services/battle/query` | `BattleTxnQuery` | ⚠️ Returns 404 for empty turn instead of `[]` |

**Ability JSON passthrough is safe today** — server never inspects ability data; just stores in-memory and re-sends. The `AMOUNT`/`DAMAGE` variable trap doesn't reach the server. Will become a risk if server-side ability validation is ever added.

**Mobile "UNSUPPORTED OS" path** — `GameMainAir.as:628-643` does NOT halt; it falls through with `assets="assets/"` and `gui="gui/"` defaults. Mobile clients launch but assets fail to load silently. Treat mobile as "unsupported until asset paths are properly resolved."

### 3.5 Quick Wins (low effort, high value)

1. **One-line vbb_name fix** — `auth.ts:85` change `null` → `this.display_name`
2. **Bump session key entropy** — `auth.ts:22` change `8` → `16`
3. **Add `/account/tutorial` stub** — single-line route that sets `acc.completed_tutorial = true`
4. **Add `/battle/surrender` route** — wraps existing `endgame()` with surrendering player as loser
5. **Validate JWT_SECRET length at startup** — single assertion in `app.ts:17`
6. **Add `display_name` regex validation** — `/^[a-zA-Z0-9 -]{1,32}$/`
7. **Cap chat message length to 500 chars**

### 3.6 Not Worth Fixing Now (documented for awareness)

- **Battle ID 80-bit entropy** — collision needs ~2^40 battles; fine for revival-server scale
- **Logout endpoint not validated** — idempotent, no real DoS risk
- **`/services/download/checksum`** — possibly dead code; verify before removing

---

## 4. Recommended Fix Sequencing

1. **Data integrity blockers** (1, 2) — prevent silent corruption
2. **Security blockers** (3, 4, 5, 6) — close auth gaps before any public deploy
3. **Missing routes** (7, 8, 9, 10) — restore broken gameplay features
4. **Security gaps + race conditions** — second pass after blockers clear
5. **Quick wins** — bundle into a single PR for fast progress

---

## 5. Key Insights About the Codebase

- **`tbs/srv/` (in decompiled client) is the protocol map.** ~50 ActionScript classes, one per server transaction. This was the most valuable file for the protocol-alignment review.
- **Server has 36 implemented routes; client makes ~36 distinct calls.** Ratio of missing routes (8) is high enough that several core features (surrender, lobby, stats reset) are broken today.
- **Battle state is in-memory only.** `battle.parties`, `aliveUnits`, `winner` live in the `battles` dict; only `battle_results` row hits DB at endgame. This means a server restart loses all in-progress battles.
- **`session.accountData` is the in-memory source of truth during a session.** DB writes via `saveParty()`/`saveRoster()` are sync; in-memory updates are immediate. Power-level mismatch race exploits this.
- **No migration runner exists.** `connection.ts` uses `CREATE TABLE IF NOT EXISTS` only. The planned `game_id` column will need a dedicated migration step or the auto-init pattern needs to grow `ALTER TABLE` support.
- **Plan doc says MySQL syntax (`INT UNSIGNED`, `ALTER TABLE ... ADD UNIQUE KEY`), but the server uses SQLite (`node:sqlite`).** The migration plan needs SQLite syntax, not MySQL.

---

## 6. Lessons Learned From This Review Session

- **`/ultrareview` failed 3 times** — root cause unclear. The pivot to in-terminal parallel Explore subagents was faster, cheaper, and produced more actionable output anyway.
- **3 parallel agents was the right number.** One per concern (security/concurrency/protocol). Combining them would have lost focus; splitting further would have produced redundant findings.
- **Pre-loaded "already researched" lists prevented wasted work.** Each agent skipped items already documented in `bsf-server/misc/` findings docs.
- **Decompiled code should live OUTSIDE the git repo.** Initially staged at `bsf-server/_review/decompiled/` (1,113 files), then moved to `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\` to keep the repo clean. The reviews still worked because subagents can read absolute paths.
- **Filtering decompiled files matters.** Of ~1,300 .as files in the SWF, only `engine/`, `game/`, `tbs/`, `lib/`, `GameMainAir.as`, and `AneFixer.as` were BSF code. Excluding `starling/`, `as3isolib/`, `com/adobe/`, etc. (third-party libs) cut review surface from 1,300 to 1,113 files.
- **The cheatsheet PDF couldn't be rendered (no `pdftoppm` on Windows)** — markdown alternative at `BannerSagaDeveloperCheatsheet.md` worked.
- **Most of the cheatsheet was for single-player BS1/2/3, not Factions.** Only the `--developer` flag implication (client-side class whitelist bypass → no server-side validation → ranked-play exploit) was relevant.

---

## 7. Files & References

**Findings documents (read first when continuing):**
- `bsf-server/misc/Plan-Enable-Mobile-Windows-Crossplay.md` — crossplay roadmap, server steps, client RE work
- `bsf-server/misc/Findings-Client-ActionScript-Crossplay.md` — what the client does at runtime (login, entity naming, long-poll, mobile detection)
- `bsf-server/misc/findings_unit_extensibility.md` — unit/ability extensibility matrix; immediate wins
- `bsf-server/misc/findings_bs_modding.md` — JPEXS/SWF modding guide; ability JSON gotchas
- `bsf-server/misc/BannerSagaDeveloperCheatsheet.md` — console commands, dev mode, command-line flags

**Repo guides:**
- `CLAUDE.md` (repo root) — coordination protocol between bsf-server and bsf-client
- `bsf-server/CLAUDE.md` — server architecture, working style ("Explain every edit before making it"), commands
- `bsf-server/.claude/rules/gotchas.md` — quick-reference for hardcoded surprises

**Decompiled client (outside repo):**
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\tbs\srv\` — client-side server interface (50 transaction classes; **start here for any protocol question**)
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\engine\` — game engine
- `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\game\` — game-specific code
- Prefer the 2013 source at `%USERPROFILE%\Code\bsf-refs\client-2013-as3\` when the file exists there — 97% of overlapping classes are signature-equivalent and the 2013 source is more readable (see root `CLAUDE.md` for the 12-file stale exception list)

---

## 8. To Continue in a New Chat

A fresh Claude can pick up by:

1. Reading this document for context
2. Reading the 5 prior findings docs in `bsf-server/misc/` for deeper background
3. Asking the user which fix sequencing tier to start with (blockers first is recommended)
4. Following `bsf-server/CLAUDE.md` working style: **explain every edit before making it** (What / Why / Tradeoff), then wait for `y` approval

The repo's pre-commit hook runs `yarn build && yarn test` — any fix must pass both before commit.
