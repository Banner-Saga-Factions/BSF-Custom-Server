# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---
## [Unreleased]

### 🔒 Security: OAuth state, session entropy, overlay scoping, login rate limit

Tier 2 of the 2026-05-07 codebase review (`misc/Codebase-Review-Findings-2026-05-07.md` §3.1, blockers #3–#6). All four fixes ship together. Tracked as GitHub issues #53–#56.

**Issue #53 — Session keys are now harder to guess**

When you log in, the server gives your game client a secret string called a "session key". Every later request from your client carries that string so the server knows which logged-in player it's talking to. Before today, the key was 16 characters long. That's small enough that, with patience and a fast computer, an attacker could grind through random guesses until they hit a live key and then start acting as that player without ever knowing their password. We doubled the length to 32 characters. Each extra character multiplies the number of possible values by a huge factor — the keyspace is now in the same league as the random IDs used by major web frameworks, far beyond what any current or near-future hardware can brute-force.

You don't need to do anything as a player; the change is invisible. Anyone already logged in stays logged in.

*Technical:* `generateKey()` in `src/services/auth/auth.ts` now uses `crypto.randomBytes(16)` (was `8`). 64 → 128 bits of entropy.

**Issue #54 — Discord login can no longer be hijacked mid-flow**

Logging in with Discord works in three hops: you click "log in with Discord", Discord asks you to approve, then Discord sends your browser back to us with a code we exchange for your identity. The weak spot was that nothing tied that round-trip to *your specific browser*. An attacker could craft a link that, when you clicked it, would finish *their* Discord login inside your browser — and you'd come out the other side with the attacker's Discord account silently linked to your game session. The attacker could then log in to your game whenever they wanted.

We now hand each login attempt a unique random token. We tuck a copy into a cookie that only your browser holds, and we tag the round-trip URL with the same token. On the way back, both copies have to match — and the token is single-use, so a captured token can't be replayed. If anything is missing, mismatched, or expired, the login is refused with `error=invalid_state` and the attacker's setup never completes.

*Technical:* `src/services/auth/discord.ts` generates a 128-bit `state` on `GET /login/discord/`, stores it in a module-level `pendingStates` Map (5-min TTL, swept every 60 s), and sets a `bsf_oauth_state` HttpOnly cookie (`SameSite=Lax`, `Path=/login/discord`, `Max-Age=300`). The callback validates query state vs cookie state vs map membership; one-shot deletion runs on success. No new dependency.

**Issue #55 — The Steam-overlay free pass is now scoped exactly**

When the Steam overlay pops up over a match, the game sends a quick "the overlay opened" ping to the server. That ping doesn't carry login info because it can fire before the player is fully signed in, so we have to let it through without authentication. The old rule was "let through *anything* whose URL starts with `/services/session/steam/overlay/`." That worked for today's traffic but was a footgun: if anyone in the future added a new route under that prefix — say a debug or admin route by accident — it would silently skip the login check too. We replaced the broad rule with a precise pattern that only matches the actual shape the real Steam overlay sends. Anything else under that prefix is now treated like every other route: no session, no entry.

*Technical:* `src/app.ts` middleware now matches `/session/steam/overlay/<session_key>/<true|false>` via precompiled regex instead of `startsWith`.

**Issue #56 — Login attempts are rate-limited**

The login route accepted as many attempts per second as anyone cared to send. That's the standard setup attackers use to grind through Steam IDs in bulk or to probe for weaknesses without anyone noticing. We now cap any single source at 5 login attempts per minute. Real players never hit that — even with a flaky network and a few retries, you'd typically see at most one or two attempts. Only automated traffic exceeds the cap, and the 6th attempt within a minute is bounced with a "too many login attempts, try again in a minute" message until the window resets.

The cap is enforced per-IP and lives in the server's memory; restarting the server clears the counters. That's intentional for the small single-host deployment we run today.

*Technical:* `AuthRouter.post("/login/:httpVersion", ...)` is wrapped with `express-rate-limit` configured at 5/min/IP, returning 429 + JSON body + `RateLimit-*` headers. Skipped when `NODE_ENV=test` because the test suite shares one source IP.

**New dependency:** `express-rate-limit ^8.5.1` (~30 KB).

**Test coverage:** `src/services/auth/discord.test.ts` adds 3 new tests for the OAuth state path (no cookie, mismatched cookie, replay) and updates 5 existing callback tests to seed state via a `startFlow()` helper. `test/routes/auth.test.ts` splits the overlay test into "valid shape passes 200" and "other paths return 403". 141 tests pass.

Affected: `src/services/auth/auth.ts`, `src/services/auth/discord.ts`, `src/services/auth/discord.test.ts`, `src/app.ts`, `test/routes/auth.test.ts`, `package.json`, `yarn.lock`.

### ✨ Missing routes — username on login, stats reset, surrender, lobby stubs

Tier 3 of the 2026-05-07 codebase review (`misc/Codebase-Review-Findings-2026-05-07.md` §3.1, blockers #7–#10). All four fixes ship together. Tracked as GitHub issues #57–#60. URL paths and request bodies were verified against the decompiled Flash client before implementation.

**Issue #57 — Your username now comes back on login**

When you logged in, the server's reply was supposed to tell the client your in-game username so it could show it in chat, the lobby, the title bar, and so on. That field was always being sent as empty. The client dutifully stored "empty" as your username, so for the rest of your session anything that displayed the name had nothing to display. The server now sends back your real display name in that field, the same one you see in the top corner of the game, so chat handles and labels show the right thing immediately on login.

*Technical:* `Session.asJson()` in `src/services/auth/auth.ts:88` returns `vbb_name: this.display_name` (was `null`).

**Issue #58 — You can reset a unit's stats again**

The Proving Grounds has a "reset stats" button on each unit that asks the server to roll the unit's stats back to its factory defaults — useful if you've spent renown badly and want a do-over. The server never had that route, so clicking the button quietly did nothing. We added the route. The server looks up the unit on your roster, finds the original "factory" stat values from the same template the unit was first hired from, replaces the unit's current stats with those, and saves the roster. If the database write fails, the in-memory stats are restored to what they were before the reset so you don't end up with a unit whose displayed stats don't match what's persisted.

No renown is refunded on reset. That matches the existing design choice for stat purchases — the server doesn't track renown spent on stat upgrades (it's computed by the client locally), so refunding here would mint free renown out of nothing.

*Technical:* New `RosterRouter.post("/unit/stats/reset/:session_key?", ...)` in `src/services/roster.ts`. Body `{ unit_id }`. Looks up template by `entityClass` (the canonical class key — the per-unit `id` is mutated to `<class>_start_<n>` during hire). Restores `unit.stats` from `PURCHASABLE_UNITS.units[].def.stats`, calls `saveRoster()`, rolls back on failure. Verified against `c:\decompile\bsf\scripts\scripts\game\session\actions\ResetStatsTxn.as` for URL and body shape.

**Issue #59 — Surrender works end-to-end now**

Before this release, players had no way to surrender mid-battle. The only escape was to close the battle window outright, which made you lose, but only sometimes — and didn't always award renown to the other side cleanly. We added a real surrender route, and along the way we found and fixed a separate bug that was making surrenders look broken even with the route in place.

The new route, when called, marks the battle as finished with the surrendering player as loser, awards the standard win-bonus renown to the opponent, and saves the result to the database. The same finishing logic is now shared between the surrender route and the existing "exit battle" route, so they can never disagree on who won.

*The bug we caught:* the surrendering player saw the victory/defeat popup correctly, but the **winning player would stay frozen on the battle screen forever**. The reason: the Flash client only knows a battle has ended in two situations — the last enemy unit died on screen (then it transitions to the finished state on its own), or the server sends a special "your opponent surrendered" message. The server was never sending that message. So the surrendering player exited cleanly through their own internal flow, while the winning player kept waiting for an action that would never come. The server now sends that "your opponent surrendered" message to the winner immediately before the renown and battle-finished messages, which is what the client expects and what triggers the winner's transition into the victory screen.

*Technical:* New `BattleRouter.post("/surrender/:session_key", ...)` in `src/services/battle/Battle.ts`, body `{ battle_id, turn }` (turn ignored server-side). Refactored the inline surrender branch from `/exit` into a shared `finalizeSurrender(data)` helper. New `ServerClasses.BATTLE_SURRENDER_DATA = "tbs.srv.battle.data.client.BattleSurrenderData"` in `src/const.ts`; `finalizeSurrender` pushes a `BattleSurrenderData` payload (with `user_id` = surrendering player's `account_id`) to the opponent before invoking `endgame()`, which triggers `BattleStateFinish` per `BattleFsm.as:273-289`. Middleware exception at `Battle.ts:193` extended to allow `/surrender/` when opponent is gone (mirrors `/exit/` semantics). Verified against `c:\decompile\bsf\scripts\scripts\engine\battle\fsm\txn\BattleTxnSurrenderSend.as` and `BattleFsm.as`.

**Issue #60 — The squad-creation UI no longer 404s**

The game has a squad/party flow ("Challenge a Friend") where two players can lobby up before a private match. The Flash client makes eight different calls into a `/services/lobby/*` namespace — join, exit, ready, options, invite, and so on. The server had none of those routes, so the moment a player opened the squad-creation screen the client would start hitting 404s, and the screen would freeze instead of advancing. We're not building real lobby state yet — that's tracked as a follow-up — but we needed to stop the 404s. The new lobby file responds 200 with an empty body for every URL shape under `/services/lobby/`, which is enough for the UI to advance past the create-squad screen. Two players still can't actually complete a real lobby flow (no shared state, no invite delivery), but the screen no longer freezes and the client doesn't error out.

A separate follow-up issue will track the three options for making lobbies actually work — purely in-memory mirror of the `Battle` class, or DB-backed with persistent invite history, or stay stateless. We picked stateless for now because nothing in the current revival deployment needs real lobbies yet.

*Technical:* New `src/services/lobby.ts` exports `LobbyRouter` with a single catch-all `LobbyRouter.post("/:first/:session_key?", (_, res) => res.send())` covering `LobbyTxn` (6 actions: uninvite/join/decline/exit/ready/unready), `LobbyOptionsTxn`, and `LobbyInviteTxn`. Mounted in `src/app.ts` next to `RosterRouter` at `/lobby`. Verified against `c:\decompile\bsf\scripts\scripts\game\session\actions\Lobby*Txn.as` and `game\cfg\Lobby.as`.

**Test coverage:** 26 new tests across three files. `test/routes/roster.test.ts` adds a `describe("POST /services/roster/unit/stats/reset/:session_key")` block (happy path, missing `unit_id`, unknown unit, DB-failure rollback). `test/routes/battle.test.ts` adds a `describe("POST /battle/surrender/:session_key")` block (happy path, second concurrent call is a no-op, opponent-disconnected case, BattleSurrenderData-before-BattleFinishedData ordering for the winner). New file `test/routes/lobby.test.ts` smoke-tests every observed client URL shape returns 200. 157 tests pass.

Affected: `src/services/auth/auth.ts`, `src/services/roster.ts`, `src/services/battle/Battle.ts`, `src/services/lobby.ts` (new), `src/app.ts`, `src/const.ts`, `test/routes/roster.test.ts`, `test/routes/battle.test.ts`, `test/routes/lobby.test.ts` (new).

### 📚 Docs sweep — post-SQLite consistency pass

Brought every doc in `docs/` in line with the current SQLite + Node 24
codebase and stitched the cross-references back together. No code
changes.

- **`README.md`** — added cross-links to `docs/HISTORY.md` and
  `CONTRIBUTING.md` from the project overview / quick-start.
- **`CONTRIBUTING.md` § 7** — verified the doc cross-reference table
  matches the on-disk file set.
- **`docs/serverEndpoints.md`** — rewritten. Added a transport-map
  column distinguishing direct-response routes from long-poll-relay
  routes, filled in previously missing endpoints (Proving Grounds /
  roster routes, `/debug/*` test hooks, Discord OAuth flow), and
  resolved the outstanding "TBI" placeholders against the current
  source.
- **`docs/Development.md`** — light pass. Bumped Node prerequisite to
  24+, added `start-server.sh` alongside `start-server.bat`, removed
  stale MySQL references, corrected the project-structure tree to
  `bsf-server/` (monorepo layout) and noted the `bsf-client/` submodule.
- **`docs/gameFlow.md`** — replaced broken `[some link here]`
  placeholders with real anchors into `serverEndpoints.md` and
  `dataStructures.md`. Tightened hedging on items now confirmed by the
  code (queue 5-min sweep, location no-op, surrender endgame).
- **`docs/dataStructures.md`** — preserved the original field-by-field
  layout while resolving the items now known from captures and code
  (e.g. the 32-bit `account_id` rationale on `BattlePartyData.user`,
  the `BattleKilledData` class-name reuse quirk, `EntityDef.name`
  being required). Genuinely-unknown fields stay flagged **To be
  investigated**.
- All updated docs now carry a `*Last updated: YYYY-MM-DD*` footer so
  staleness is visible at a glance.

### 📚 Docs sweep — new files and ARCHITECTURE.md overhaul

Created `CONTRIBUTING.md`, `start-server.sh`, `docs/ARCHITECTURE.md`
(major rewrite), and `docs/HISTORY.md` (new). No code changes.

- **`CONTRIBUTING.md`** — new single source of truth for local dev, testing,
  git workflow, coding standards, and the memory-management rules required
  to keep the server stable on the 1 GB e2-micro host. Verified facts baked
  in: Node `>=24`, monorepo layout (`bsf-server/` + `bsf-client/` submodule),
  `simple-git-hooks` pre-commit hook, 32-bit `account_id` vs 64-bit Steam ID
  rule, `STEAM_ID_BASE`, idle eviction at 30 min, `QUEUE_TIMEOUT_MS = 5 min`,
  MQTT-installed-but-unused, Discord 501 gotcha.
- **`start-server.sh`** — Linux/macOS equivalent of `start-server.bat`. Builds,
  kills any stale process on port 8082 (via `lsof` or `fuser`), then
  `exec node build/index.js`.
- **`docs/ARCHITECTURE.md`** — replaced all MySQL references with SQLite
  (`node:sqlite`, WAL, `./data/bsf.db`). Added Endpoint Transport Map
  covering every `/services/*` route plus `/health`, `/debug/*`, and the
  Discord OAuth trio. Added Database Layer section, Health & Debug Endpoints
  section, and MQTT-installed-but-unused disclosure. Updated ASCII diagrams.
  Moved Stoic-stack history to `docs/HISTORY.md`.
- **`docs/HISTORY.md`** — new file capturing the original Stoic stack
  (Java / MySQL / RabbitMQ), the reverse-engineering origin from Fiddler
  captures, and key design evolutions (MySQL → SQLite, MQTT shelved,
  Discord OAuth incomplete).

### 📚 Docs annotation review pass

Verified all `[claude ai]` annotations from the prior docs sweep against
the live `src/` codebase, then promoted accepted notes to plain prose,
corrected two factually-wrong annotations, and applied replacement
recommendations. No code changes.

- **Verification** — 7 side claims checked; 5 confirmed correct, 2 corrected
  before promotion: Discord route name (`session-exchange` →
  `/login/discord/session`; 501 fires from ServiceRouter middleware, not the
  route) and account update routes (`/account/party/update` +
  `/account/roster/update` → `/account/update` and `/roster/party/arrange`).
- **`docs/dataStructures.md`** — 11 annotations promoted. `"scene"` example
  corrected from `"proving_grounds"` → `"greathall"` (matches reference
  capture `0058_s.txt`). `BattleSyncData.hash` description corrected: server
  is a relay-only pass-through, not a hash validator (verified in `Battle.ts`).
- **`docs/gameFlow.md`** — all annotations promoted. Party Change route
  corrected from `services/???/arrange/` placeholder to
  `services/account/update/`. Kill section typo fixed
  (`battle/move/` → `battle/killed/`).
- **`docs/serverEndpoints.md`** — all HTML-comment annotations converted to
  visible markdown. Inline field descriptions updated for `hash`, `entity`,
  `randomSampleCount`, `execution_id`, `level`, `tiles`, and `user_id`.
  Added new sections for Chat, Discord OAuth, Health, and Debug endpoints
  (previously implemented but undocumented). Quick Reference table extended
  with 6 new rows.
- **`CHANGELOG.md`** — moved from `docs/CHANGELOG.md` to the repo root.
  All cross-links updated across `CONTRIBUTING.md`, `docs/dataStructures.md`,
  `docs/serverEndpoints.md`, `docs/Development.md`, and `.claude/commands/`.

## [0.4.5] - 2026-05-06

### Fixed
- **Matchmaking:** Fixed an issue where matches would fail to load and kick players back to the Great Hall. Random map selection is now handled securely on the server-side to ensure the client always receives a valid, loadable map asset string.

## [0.4.4] - 2026-05-06

Documentation refresh:

- New CONTRIBUTING.md at repo root: single source of truth for local dev setup,
  testing, git workflow, coding standards, and the memory-management rules
  required to keep the server stable on the 1 GB e2-micro host. Replaces the
  old root CONTRIBUTING.md and folds in the substance of the prior
  CONTRIBUTING_NEW.MD draft.

- New start-server.sh at repo root: Linux/macOS equivalent of start-server.bat.
  Builds, kills any stale process bound to port 8082 (lsof or fuser), then
  exec's node build/index.js.

- docs/ARCHITECTURE.md: replaced all MySQL references with SQLite (node:sqlite,
  WAL, default ./data/bsf.db). Added an Endpoint Transport Map covering every
  /services/* route plus /health, /debug/*, and the Discord OAuth trio (with
  /login/discord/session-exchange flagged as 501 Not Implemented). Added a
  Database Layer section and a Health & Debug Endpoints section. Documented
  that async-mqtt ships in dependencies but no source file imports it. Moved
  the Stoic-stack history out to docs/HISTORY.md. Updated the ASCII diagrams.

- docs/HISTORY.md: new file capturing the original Stoic stack
  (Java / MySQL / RabbitMQ), the reverse-engineering origin from Fiddler
  captures, and the key design evolutions (MySQL -> SQLite, MQTT
  introduced-then-shelved, Discord OAuth incomplete).

- CONTRIBUTING.md docs/Development.md: Replace MySQL/Node-18 README with SQLite/Node-23.4+ version grounded in
  package.json engines, src/db/connection.ts, and src/services/auth/auth.ts.
- Add Start Here routing table, Tech Stack, Quick Start (Win + Linux),
  yarn test verification step, and collapsed What Works Today block.
- Move launch-arg tables, project tree, troubleshooting, and Fiddler
  references out of README; flag follow-up homes in handoff doc.
- Add docs/_handoff.md capturing verified source facts, open questions,
  and style guardrails so CONTRIBUTING.md and ARCHITECTURE.md work
  resumes cleanly in a new chat.'

## [0.4.3] - 2026-05-04

Fixed: Admin database queries now use CAST(user_id AS TEXT) to prevent Node.js RangeError when handling 64-bit Steam IDs.

[0.4.2] - 2026-05-02

🔧 Fix CI — upgrade GitHub Actions to Node 23

The CI workflow was pinned to Node 20, but package.json declares engines: { node: ">=23.4.0" }. yarn install enforces that requirement and exits with code 1, so every CI run was failing before a single test executed.

Fix: updated .github/workflows/ci.yml to use node-version: 23, matching the minimum the app requires (node:sqlite needs 22.5+; the engines floor is 23.4.0 for stability).

Affected: .github/workflows/ci.yml.

Also updated docs/Development.md: reordered single-player launch args for clarity and added a GCP/DuckDNS launch command block for testing against the live cloud server.

## [0.4.3] - 2026-05-02

### 🔧 Fix CI — upgrade GitHub Actions to Node 23

The CI workflow was pinned to Node 20, but `package.json` declares
`engines: { node: ">=23.4.0" }`. `yarn install` enforces that requirement and
exits with code 1, so every CI run was failing before a single test executed.

Fix: updated `.github/workflows/ci.yml` to use `node-version: 23`, matching
the minimum the app requires (`node:sqlite` needs 22.5+; the engines floor is
23.4.0 for stability).

Affected: `.github/workflows/ci.yml`.

Also updated `docs/Development.md`: reordered single-player launch args for
clarity and added a GCP/DuckDNS launch command block for testing against the
live cloud server.

---

## [0.4.2] - 2026-05-02

### 🐛 Bug Fixes: Four Ultrareview Findings (Data Loss, Security, Disconnect)

Four bugs identified by the ultrareview agent, all present since the Proving
Grounds (0.3.x) and SQLite (0.4.x) streams, fixed in this release.

**Bug 1 — Paid barracks expansions were silently destroyed on every roster mutation**

`saveRoster`, `saveRosterAndSpendRenown`, and `saveRosterAndParty` all wrote
`roster_rows = <unit count>` on every call. Because `roster_rows` is the
barracks **capacity** (the slot limit purchased via `/roster/unlock`), any
roster operation — promote, rename, retire, hire, stat upgrade — immediately
overwrote it with the current unit count, reverting any `/roster/unlock`
expansion. A player who spent 60 renown to unlock a barracks slot and then
promoted a unit would find their capacity reverted the next time they logged in.

Fix: removed `roster_rows` from the SET clause of all three `saveRoster*`
helpers. Only `expandBarracks()` and `upsertAccount()` may now write
`roster_rows`. Also removed the matching in-memory line in
`POST /account/update` that clobbered `acc.roster_rows` within the same
session.

Affected: `src/db/account.ts`, `src/services/account.ts`.

**Bug 2 — Steam ID precision loss caused all DB writes to silently no-op for real players**

17-digit Steam IDs are too large for IEEE-754 `Number` to represent exactly
(the unit of last place in that range is 16, so IDs like `76561198354572130`
round to `76561198354572128`). Login correctly preserved the exact string in
`session.steam_id_str`, but every DB call after login passed `session.user_id`
(the imprecise `Number`) instead. The resulting `WHERE user_id = ?` clause
matched zero rows — renown awards, battle records, party saves, and every
Proving Grounds mutation (promote, rename, retire, hire, stat upgrade, barracks
unlock) silently failed for any player whose Steam ID doesn't round-trip through
`Number`. The in-memory session showed the correct state, so players saw their
changes within the session, but everything disappeared on next login.

Fix: replaced `session.user_id` with `session.steam_id_str` at all eleven DB
callsites. Also widened the `saveBattleResult` signature to accept
`number | string` for the winner/loser ID parameters.

Affected: `src/services/battle/Battle.ts`, `src/services/account.ts`,
`src/services/roster.ts`, `src/db/battles.ts`.

**Bug 3 — Long-poll silently discarded buffered data when a client disconnected mid-poll**

The 10-second long-poll handler attached a `session.once("data", onData)`
listener but never registered `req.on("close")`. When a client disconnected
mid-poll (game crash, network drop, AIR client retry), the listener remained
alive. If `session.pushData()` fired during that window — most critically,
when matchmaking created a battle and pushed `BattleCreateData` to both
players — `onData` ran against the dead socket, then cleared `session.data = []`
unconditionally. The reconnecting client's next poll returned nothing, so the
player never received the battle-start message and was left in a broken state.

Fix: added `req.on("close", onClose)` at the start of Path B; `onClose` clears
the timer, removes the data listener, and resets `pollingActive`. `onData` also
guards `res.send()` behind `!res.writableEnded` and removes the close listener
before draining the buffer.

Affected: `src/services/game.ts`.

**Bug 4 — Any authenticated player could corrupt or freeze a live battle**

The BattleRouter middleware verified that a `battle_id` existed but never
checked that the requesting session was actually one of the two participants.
An authenticated player who knew a victim's `battle_id` could hit `/exit` on
that battle, which set `battle.winner` to a garbage value and permanently
suppressed the natural endgame — both real participants would finish the match
without ever receiving `BattleFinishedData` or renown. The same gap allowed
injection of fake move/action/kill events into a real participant's poll buffer.
(`battle_id` is 80-bit random so guessing is infeasible, but the check is
still required as defense-in-depth.)

Fix: added a one-line guard in `BattleRouter.use`:
`if (!(sessionKey in battle.parties)) return res.sendStatus(403);`

Affected: `src/services/battle/Battle.ts`.

**Test coverage**

Added 6 new tests and updated 3 existing tests to cover all four fixes:
- `src/db/account.test.ts` — updated `saveRoster*` tests to assert `roster_rows`
  is no longer in the SQL params
- `test/routes/account.test.ts` — verifies `roster_rows` is unchanged after a
  roster update with a pre-expanded barracks capacity
- `test/routes/battle.test.ts` — participant guard returns 403 for outsiders on
  `/exit` and `/move`; `battle.winner` not corrupted by non-participant `/exit`;
  `addRenown` receives the exact `steam_id_str`, not the precision-lost
  `user_id` string (uses STEAM_ID_BASE+17 / STEAM_ID_BASE+33, which are not
  multiples of 16 and therefore not exactly representable as IEEE-754 doubles)
- `test/routes/game.test.ts` — client disconnect mid-poll resets `pollingActive`
  to false and leaves buffered data intact for the next poll

**Other**

- `src/db/account.ts` (`upsertAccount`): also updates `username` on conflict,
  so a returning player's display name syncs if it changed on Steam.
- `src/services/auth/auth.ts`: login route now uses `req.body.display_name`
  if the client sends one (the AIR client does include this field).
- `.claude/rules/db.md`: corrected the `saveRoster` atomicity rule — the old
  rule mandated writing `roster_rows` alongside `roster_json`, which was the
  root cause of Bug 1.

---

## [0.4.1] - 2026-05-01

### 🧪 Test Coverage: SQLite Migration Tests and Route Coverage Expansion

After the MySQL → SQLite migration (0.4.0), the test suite needed to catch up:
coverage had dropped to 50% statements, 45% functions, and 32% branches — all
below the configured CI thresholds. This adds 80 new tests across 8 new/extended
test files to bring all three metrics above the thresholds.

**Coverage before → after**
- Statements: 50.52% → 75.02%
- Functions: 45.39% → 78.84%
- Branches: 32.82% → 67.31%

**New test files**
- `src/util/serialization.test.ts` — tests `RawInt`, `rawIntValue()`, and
  `safeJsonStringify()` for large-integer JSON precision safety
- `src/db/connection.test.ts` — uses a real in-memory SQLite DB
  (`DB_PATH=:memory:`), bypassing the global mock; tests `query()`,
  `queryOne()`, and `queryUpdate()` against actual SQL
- `test/routes/roster.test.ts` — 38 tests covering all 7 Proving Grounds
  routes, including validation branches and DB-error state-reversion for
  promote, rename, retire, hire, stats/purchase, and unlock
- `test/routes/chat.test.ts` — global broadcast, battle-specific broadcast,
  and no-op for sessions outside a battle
- `test/routes/game.test.ts` — leaderboard, immediate flush (Path A),
  concurrent-poll guard (429), mid-poll data delivery, and location no-op
- `test/routes/download.test.ts` — both routes return 404 when
  `factions.tar.gz` is absent (the production binary is not in the repo)
- `src/services/auth/discord.test.ts` — OAuth URL construction, callback error
  allowlisting (XSS guard), Snowflake precision rejection, token-fetch failure,
  and JWT session exchange

**Extended test file**
- `src/db/account.test.ts` — added 10 tests for all 7 DB operation functions
  (`getAccountByUserId`, `upsertAccount`, `addRenown`, `saveParty`,
  `saveRoster`, `saveRosterAndSpendRenown`, `saveRosterAndParty`,
  `expandBarracks`), verifying SQL argument shapes against the mocked helpers

**Production code changes (required for testability)**
- `src/db/connection.ts` — accepts `:memory:` as a valid `DB_PATH`; skips WAL
  setup for in-memory databases (WAL is unsupported in SQLite memory mode)
- `vitest.config.ts` — added `DB_PATH=:memory:` to the test env block; excluded
  `BattlePartyData.ts` and `BattleTurnData.ts` from coverage thresholds (pure
  TypeScript interface files with no executable code)

**Bug fix in test infrastructure**
- `test/setup.ts` — the global `query` mock was returning `{ affectedRows: 1 }`
  (a MySQL-era leftover); corrected to `[]` to match the real SQLite `query()`
  return type

---

## [0.4.0] - 2026-04-30

### 🧪 Test Framework: Automated Tests, CI, and Pre-commit Hook

Introduced vitest as the test runner and wired a full automated test suite covering the three core service layers. Prior to this, `yarn build` (TypeScript compile) was the only automated correctness check.

**Tooling**
- Installed `vitest`, `@vitest/coverage-v8`, `supertest`, `@types/supertest`, `simple-git-hooks`
- Added scripts: `yarn test`, `yarn test:watch`, `yarn test:coverage`, `yarn test:ci`
- `vitest.config.ts` — includes `src/**/*.test.ts` and `test/routes/**/*.test.ts`; 70% line/function coverage thresholds; JWT_SECRET injected via env so the app doesn't throw at import time
- `test/setup.ts` — globally mocks `src/db/connection` so no real MySQL connection is needed; suppresses console output during test runs

**50 tests across 9 files**
- `src/const.test.ts` — verifies GameModes and ServerClasses protocol strings match the original client
- `src/db/account.test.ts` — tests `parseRow()` JSON parsing, double-parse guard, and type casting
- `src/services/auth/auth.test.ts` — tests Session shape, sessionHandler CRUD, and `getInitialData()` concat regression
- `src/services/queue.test.ts` — tests matchmaking pairing, power mismatch guard, vs_type mismatch guard, self-match prevention
- `src/services/battle/Battle.test.ts` — tests constructor party/aliveUnits setup and `setReliableMessageData()` shape
- `test/routes/auth.test.ts` — login (valid/invalid steam_id), logout, session middleware (403, bypass, overlay)
- `test/routes/account.test.ts` — account info shape, party update validation (size, unknown IDs, malformed defs)
- `test/routes/queue.test.ts` — queue join, duplicate join (409), unknown vs_type (400), session_count accuracy
- `test/routes/battle.test.ts` — kill recording and aliveUnits tracking, final kill sets winner, 404/410 edge cases, clean exit, exit-after-disconnect

**Minimal production code changes** (required to make modules testable):
- `src/db/account.ts` — exported `parseRow` (pure function, was private by omission)
- `src/services/auth/auth.ts` — exported `getInitialData`
- `src/services/queue.ts` — exported `QueueItem`, `gameQueue`, `matchmaking`
- `src/services/account.ts` — `POST /update` route changed to `POST /update/:session_key` — the session middleware extracts the key from the last URL segment; without it, all requests to this route were blocked by 403 before reaching the handler (pre-existing bug now fixed)

**CI / Pre-commit**
- `.github/workflows/ci.yml` — runs on every push and PR: install → build → test (no DB required)
- `simple-git-hooks` pre-commit hook — blocks commits if `yarn build` or `yarn test` fails

**Known gap surfaced by code review (pre-existing, not introduced here):**
- When a player's opponent disconnects and the survivor calls `/battle/exit`, `endgame()` is skipped — the winner receives no renown and no `BattleFinishedData`. Deferred to a future fix stream.

---

## [0.3.0] - 2026-04-26

### 🏟️ Proving Grounds: Roster Management Routes

New `src/services/roster.ts` mounted at `/roster`, implementing all 7 Proving Grounds
routes extracted and adapted from the `Atmakuja_DB_Changes` branch. All routes write
against the current `mysql2/promise` stack and keep `session.accountData` in sync as
the in-memory source of truth.

**New routes:**
- `POST /roster/party/arrange` — replaces the active party; validates all IDs exist in
  current roster, rejects unknowns with 400
- `POST /roster/unit/promote` — ranks a unit up by 1, updates name and class; costs
  20 renown (rank 1→2) or 80 (rank 2→3); capped at rank 3
- `POST /roster/unit/rename` — renames a unit; costs 10 renown
- `POST /roster/unit/retire` — removes a unit from roster and party atomically in a
  single DB write; was two separate writes that could desync on partial failure
- `POST /roster/unit/hire` — purchases from the Mead House; validates renown, barracks
  capacity, and unit ID uniqueness before writing
- `POST /roster/unit/stats/purchase` — applies stat deltas; validates bounds (1–5,
  integer, no duplicates), rejects unknown stats; renown cost is client-computed
  (known gap, deferred to a future stream)
- `POST /roster/unlock` — expands barracks by 1 slot; costs 60 renown

**New DB helpers (`src/db/account.ts`):**
- `saveRosterAndSpendRenown()` — single UPDATE combining roster save + renown deduction;
  replaces the prior two-statement pattern where a second-write failure skipped renown
- `saveRosterAndParty()` — single UPDATE for roster + party; used by retire to prevent
  desync if the second write previously failed
- `expandBarracks()` — now uses `AND renown >= 60` in SQL; returns `boolean` so the
  route can detect a race-condition 402 at the DB level; prevents negative renown
- `queryUpdate()` added to `src/db/connection.ts` — returns `affectedRows` for
  conditional UPDATE checks

**Correctness fixes (from code review):**
- Routes mutating roster element fields (promote, rename, stats/purchase) now save old
  values and restore in the catch block — DB failure no longer permanently dirtied
  in-memory session state
- Routes adding/removing roster entries (hire, retire) build the new array first and
  assign to `acc` only after the DB write succeeds
- `stats/purchase` validates all deltas before mutating any — a mixed valid/invalid
  multi-stat request no longer partially corrupts in-memory stats
- Hire now checks unit ID uniqueness after ID generation, covering client-supplied IDs
  containing `_start_` that previously bypassed the collision check

**Smoke test:**
- Added `smoke-test-roster-proving_grounds.bat` — 9 automated checks; creates a fresh
  account per run via timestamp steam_id so no manual DB setup is needed

---

## [0.2.1] - 2026-04-26

### 🔧 Infrastructure & Dev Tooling

- **Dockerfile**: Upgraded base image from `node:20-alpine` to `node:22-alpine` (LTS — supported until April 2027); renamed build stages to `build_env` and `runtime_env` for clarity. Extracted and improved from community PR #8 (original targeted EOL Node 21).
- **docs/Development.md**: Added 2-player localhost test launch command using full 64-bit Steam IDs, useful for validating the 32-bit `account_id` derivation path end-to-end.

---

## [0.2.0] - 2026-04-20

### 🗄️ Stream 1: Database Foundation

- Added MySQL2 connection pool (`src/db/connection.ts`) — `query<T>()` / `queryOne<T>()` helpers
- Added `src/db/schema.sql` — `accounts` and `battles` tables with proper types and indexes
- Added `src/db/account.ts` — `upsertAccount()`, `getAccountByUserId()`, `addRenown()`, `saveParty()`, `saveRoster()`
- Added `src/db/battles.ts` — `saveBattleResult()` (INSERT … ON DUPLICATE KEY UPDATE)
- Accounts are seeded automatically on first login; `login_count` incremented on re-login
- `session.accountData` (AccountRow) now populated after login; used as in-memory truth for party/roster during a session

### ⚔️ Stream 3: Match Resolution (Endgame Rewrite)

- Added `BattleRenownAwardTypes` enum to `src/const.ts` (KILLS, WIN, UNDERDOG, DAILY, etc.)
- `endgame()` in `Battle.ts` fully rewritten — was entirely hardcoded (renown=31, KILLS:2)
- Kill computation from `aliveUnits`: `winnerKills = loserParty.defs.length`, `loserKills = winnerParty.defs.length − aliveUnits[winnerId].length`
- Renown formula: `winnerRenown = 20 + kills × 3`, `loserRenown = kills × 3`
- DB persistence: fire-and-forget `Promise.all([addRenown × 2, saveBattleResult])` — does not block client messages
- `BattleFinishedData` and `RenownMessage` now sent to both players with real values
- Added `startedAt: Date = new Date()` to `Battle` class for battle duration tracking
- `/battle/killed` route updated to call `endgame(data).catch(...)` (fire-and-forget)

### 🔒 Security & Stability Fixes

- **CRIT-1**: `res.sendStatus(403)` — was `res.status(403)`, leaving socket open without a response body
- **CRIT-2**: Server throws at startup if `JWT_SECRET` is missing; `verify()` wrapped in try/catch to handle tampered/expired tokens
- **CRIT-3**: Discord JWT path now returns 501 (was reaching routes that expected `req.session`, causing TypeError)
- **MED-9**: Steam overlay path fixed — Express strips `/services` prefix inside ServiceRouter; check is now `/session/steam/overlay/`
- **MED-7**: `pollingActive` guard on `GET /game/:session_key` — returns 429 if a poll is already active (prevents double-send)
- **MED-5**: `DB_PORT` validated as numeric at startup — throws with a clear message if NaN
- **MED-4**: `vs_type` validated against `GameModes` enum on `POST /vs/start` — returns 400 for invalid values
- **MED-8**: Discord OAuth JWT now includes `expiresIn: "7d"`
- **HIGH-2**: `POST /account/update` validates `party.ids` and `roster.defs` are arrays before writing to DB — returns 400
- **NEW-2**: `POST /account/update` DB writes wrapped in try/catch — returns 500 on DB failure
- **NEW-3**: `GET /game/leaderboards` readFileSync wrapped in try/catch — returns 500 if `lboard.json` missing
- **Fix #7**: `/vs/start` returns 409 if player is already queued
- **Fix #15**: Matchmaking now filters by both `type` AND `power` level (was type-only)
- **HIGH-8**: Existing session evicted on re-login

### 🔄 Stream 4: Queue Reliability

- `QueueItem` now stores `session_key` and `queuedAt` — entries are tied to a specific session, not just `account_id`
- `matchmaking()` looks up the opponent by `session_key` instead of `user_id` — prevents ghost matches when a player re-logs in while queued
- `/vs/cancel` now looks up by `session_key` (was `account_id`) — consistent with the rest of queue logic
- Added 5-minute idle timeout: `setInterval` runs every 60s, evicts stale entries, and broadcasts updated queue counts
- Exported `dequeuePlayer(session_key)` — removes a player's queue entry by session key and notifies remaining players
- `addSession()` calls `dequeuePlayer` before evicting an old session on re-login
- Logout route calls `dequeuePlayer` before `removeSession` — queue is always clean on logout

### 🗂️ Stream 5: Roster Management Hardening

- `POST /account/update` now validates party IDs against the player's current roster — returns 400 with offending IDs if any are unknown
- Party size capped at 6 — returns 400 if `party.ids.length > 6`
- Per-element type guard on `party.ids` — non-string or empty-string elements return 400
- Roster unit structure validated — each def must have non-empty `id`, `entityClass`, and `stats[]`
- `saveRoster()` now updates `roster_json` and `roster_rows` atomically in a single `UPDATE` (was two separate queries — MED-1 fix)
- Empty-string `id`/`entityClass` now rejected by roster validation (MED-2 fix)

### ⚡ Latency & Polling Improvements

- `src/services/game.ts` — Long-poll timeout reduced from 20s to 10s; `Connection: keep-alive` header added to timeout responses to minimize the re-poll gap
- `src/index.ts` — Added middleware to disable Nagle's Algorithm (`socket.setNoDelay(true)`) for immediate packet transmission on all responses
- `src/services/auth/auth.ts` — Added `pollStartTime` field to `Session`; timing instrumentation logs (`elapsedMs`) added to poll start, data arrival, and keep-alive paths in `game.ts`

### 🐛 Bug Fix: New Account roster_rows Initialization

- `src/db/account.ts` — `upsertAccount()` INSERT now sets `roster_rows = DEFAULT_ROSTER.length`; previously the column was left at the schema default (1) regardless of actual roster size, causing the client roster grid to render only 1 row for new accounts

### 🐳 Stream 6: Docker Deployment

- Fixed `Dockerfile`: added `EXPOSE 8082`, changed `CMD` to exec form (`["node", "./index.js"]`) for proper SIGTERM handling, removed debug `RUN printenv`
- Added `.dockerignore` — excludes `.env`, `.git/`, `node_modules/`, `data/game_captures/`, `docs/`, build artifacts, and scripts from the Docker build context
- Added `docker-compose.yml` — orchestrates MySQL 8 + app; schema auto-initializes via `/docker-entrypoint-initdb.d/` on first boot; named volume `db-data` persists across restarts; app waits for DB health check before starting

### 🔑 Stream 8: Discord OAuth Login

- Implemented end-to-end Discord OAuth2 flow in `src/services/auth/discord.ts`
- `GET /login/discord` redirects to Discord authorization URL (scope: `identify` only)
- `GET /login/discord/oauth-callback` exchanges code for tokens, fetches Discord user, calls `upsertAccount()`, signs a 7-day JWT, and redirects to `bsf://auth?access_token=<jwt>&new_user=<bool>&username=<name>`
- `POST /login/discord/session` exchanges a Discord JWT for a `session_key` — the same format Steam login returns; use this key for all game traffic
- Session exchange uses `getAccountByUserId` first (avoids double-incrementing `login_count`); falls back to `upsertAccount` only if account is missing
- Moved `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` from hardcoded constants to env vars with fallbacks
- Added startup warning if `DISCORD_CLIENT_SECRET` is missing
- `.env.example` updated with all three Discord env vars
- `docker-compose.yml` passes Discord vars through to the app container
- Updated CRIT-3 comment in `src/index.ts` — the 501 block is correct and intentional; Discord users must exchange JWT via `/login/discord/session` before using game routes

**Note:** Discord snowflake IDs above `Number.MAX_SAFE_INTEGER` still lose precision via `parseInt()` in the Discord OAuth path — this is tracked and partially addressed by the Steam ID precision fix below; a full BigInt/string solution for Discord IDs is a future stream.

**Stream 8 post-review patches (`src/services/auth/discord.ts`, `docker-compose.yml`):**
- **CRIT-1**: OAuth callback now allowlists Discord error codes before forwarding to `bsf://` redirect — known codes (`access_denied`, `temporarily_unavailable`) pass through; anything else maps to `oauth_error`; no-code path produces `missing_access_code`
- **CRIT-2**: Added precision-loss warning guard after `parseInt` on Discord snowflake IDs in both `/oauth-callback` and `/session` — logs a warning when the stringified result doesn't match the original ID
- **MED-1**: Removed erroneous `Content-Type: application/x-www-form-urlencoded` header from the `GET` request to Discord's `/users/@me` endpoint (header is only valid on POST bodies)
- **MED-3**: Anchored Bearer token regex from `/Bearer (.*)/` to `/^Bearer\s+(\S+)$/` — rejects tokens with embedded spaces or trailing garbage
- **MED-5**: Removed redundant Discord env vars from `docker-compose.yml` `environment` block — `env_file: .env` already supplies them; explicit `environment` entries were pulling from the host shell (not `.env`), which caused silent empty-string values if the vars weren't exported in the shell

### ⚔️ Endgame Protocol Fixes

Verified against Fiddler captures (`0737_s.txt`, `0746_s.txt`) — `BattleFinishedData` format did not match the original server, preventing the renown screen from appearing.

**`BattleFinishedData` protocol compliance (`src/services/battle/Battle.ts`):**
- `reliable_msg_id` corrected to `{battle_id}_finished_0` (was `_finished_{user_id}`, different per player)
- `user_id` corrected to `0` (was session user_id)
- `total_renown` now combined winner + loser renown (was per-player)
- `rewards` now two objects — winner first, loser second — same `BattleFinishedData` sent identically to both players (was separate per-player objects with one reward each)
- `rewards[].achievements` corrected to `{}` empty object (was `[]` empty array)

**Kill computation fix:**
- `winnerKills` now uses `loserParty.defs.length − aliveUnits[loserId].length` (was `loserParty.defs.length` — hardcoded assumption that loser had 0 units alive, wrong for surrender)

**Surrender endgame (`/battle/exit`):**
- When a player calls `/battle/exit` before a natural winner is set (`battle.winner === null`), the server now declares the opponent as winner and calls `endgame()` before cleaning up — both players receive `BattleFinishedData` and the opponent can exit normally
- Note: mid-battle surrender is not a protocol endpoint — the client has no explicit surrender call; this handles the case where a player exits the game client mid-battle

**Dev tooling:**
- `start-server.bat` now runs `yarn build` before killing the node process and restarting — prevents testing against a stale build
- Added `_debugWeakUnits` flag and `POST /debug/weak-units` endpoint in `src/index.ts` — sets STRENGTH=1/ARMOR=0 on all units at battle creation for faster testing; defaults `false` (client-side combat ignores server-sent stats, so this has no gameplay effect but the infrastructure is in place)
- 1-unit party testing: set both test accounts to a 1-unit party via `UPDATE accounts SET party_ids_json = JSON_ARRAY(JSON_VALUE(party_ids_json, '$[0]')) WHERE user_id IN (123456, 293850)` for faster match completion

### 🔧 Steam ID Precision Fix & Internet Multiplayer Testing

**Steam ID precision fix (`src/db/account.ts`, `src/services/auth/auth.ts`):**

- **Root cause:** Real Steam IDs (e.g. `76561198354572130`) exceed `Number.MAX_SAFE_INTEGER` (2^53-1). `parseInt`/`Number` rounds them to the nearest IEEE 754 representable value. mysql2's binary protocol then sends the rounded JS Number as a DOUBLE, causing `upsertAccount` INSERT to write one value and the subsequent SELECT to find nothing — `[LOGIN] DB error during upsertAccount: Error: upsertAccount: row missing after INSERT`.
- All DB functions (`getAccountByUserId`, `upsertAccount`, `addRenown`, `saveParty`, `saveRoster`) now accept `number | string`; SQL params always pass `String(user_id)` — mysql2 sends the exact string, MySQL does precise string-to-BIGINT conversion
- Login route now validates `steam_id` with `/^\d{1,20}$/` regex (rejects non-numeric/empty); preserves the original string for DB calls; `Number(steamIdStr)` is used only for the in-memory `Session` object (may lose precision but stays internally consistent for the session lifetime)
- **Existing installs:** if your `accounts` table was created before `schema.sql` set `BIGINT UNSIGNED`, run: `ALTER TABLE accounts MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL;`

**Internet multiplayer testing results:**

- **ngrok HTTPS: broken** — Adobe AIR's HTTP client fails on 20-second GET long-polls over HTTPS; login POSTs succeed but `GET /services/game/SESSION_KEY` hangs indefinitely; game stays on loading screen with no poll logged on server
- **Cloudflare Tunnel: confirmed working** — run `cloudflared tunnel --url http://localhost:8082`; use the `https://xxxx.trycloudflare.com` URL; server log shows `[GAME-POLL] START` and poll holds correctly
- `--versus_start` requires `--steam_id` to be set explicitly in launch args — does not activate when Steam ID is sourced implicitly from the Steam client via `--steam true` alone
- Working remote play Steam launch options: `--server https://CF_URL/ --factions --developer --steam true --steam_id YOUR_STEAM_ID --versus_start --versus_countdown 0`

### ⚔️ Stream 7: Battle Endgame Fixes & Dev Tooling

**Bug fixes (`src/services/battle/Battle.ts`):**
- `killerparty` from JSON body arrives as a string; strict `===` against `number` always failed → `Number(req.body.killerparty)` fixes winner identification (winner was always the wrong player)
- BattleRouter middleware opponent-guard checked `req.path.startsWith("/battle/exit")` but Express strips the `/battle` mount prefix inside the router — path is `/exit/:session_key` inside the router, so the guard never matched and exit was blocked after opponent left
- `/exit` route was registered as `BattleRouter.post("/battle/exit/...")` — double `/battle` prefix (mounted at `/battle` + route path `/battle/exit`) caused a 404; corrected to `BattleRouter.post("/exit/...")`

**Dev tooling:**
- Added module-level `_debugPartyLimit` and exported `setDebugPartyLimit()` in `Battle.ts` — caps party size at battle-creation time for quick testing
- Added unauthenticated `POST /debug/party-limit` endpoint in `src/index.ts` — sets/clears the cap without requiring auth
- `start-server.bat` now kills any existing `node` process before starting (prevents `EADDRINUSE :::8082` on rapid restarts)
- Added `launch-game-2p-quickbattle.ps1` — calls `/debug/party-limit` before launch, clears it after game closes; enables fast 1v1 testing with a single warrior per side
- Added `data/client-README.txt` — README template for the GitHub Release game client zip

### 🛠️ Dev Tooling

- Added `start-server.bat` — preflight checks `.env` and `build/` before starting server
- Added `test-2p-match.bat` — headless 2-player API smoke test (login → queue → match)
- Fixed `launch-game-2p.ps1` / `launch-game-1p.ps1` — server health check now uses `Test-NetConnection` (TCP) instead of HTTP
- Added `CLAUDE.md` — codebase guidance for Claude Code

### 🐛 Bug Fixes

- "News of the Banner" popup blocking Pieloaf's window: root cause was missing `news_date` key in `global_1.sol` Flash Local Shared Object — fixed by patching from `global_0.sol`
- Removed `src/middleware/validation.ts` (superseded by inline validation)
- `first.json` no longer contains `Tourney`/`TourneyWinnerData` objects (unused)

---

## [0.1.0] - 2026-04-19

### 🎯 Critical Release: 7 Blocking Bugs Fixed

**Summary**: Battle flow now functional end-to-end for 2-player matches. Protocol aligned with official Banner Saga Factions server format based on reverse-engineered Fiddler captures. **Ready for multi-user testing after database integration.**

**Status**: 
- ✅ Matchmaking → Battle Creation → Unit Deployment working
- ✅ Both players visible with correct units
- ✅ Protocol matches official server format
- ⏳ Movement restrictions (UI modal blocking, not server bug)

---

## 🐛 Bug Fixes

### 1. 🔴 CRITICAL: Array Index Syntax Error in Unit Death Tracking

**File**: `src/services/battle/Battle.ts` (Line 301)

**Issue**: Game crashes when unit dies. Prevents battle from ending.

**Before**:
```typescript
let killed_idx = party.indexOf[req.body.entity];  // ❌ Wrong syntax
battle.aliveUnits[req.body.killedparty].splice(killed_idx);  // ❌ Missing deleteCount
```

**After**:
```typescript
let killed_idx = party.indexOf(req.body.entity);  // ✅ Correct function call
battle.aliveUnits[req.body.killedparty].splice(killed_idx, 1);  // ✅ Remove 1 element
```

**Impact**: Unit death now tracked correctly. Battle can detect when last unit dies and trigger end-game flow without crashing.

**Test**: Kill unit in battle → should update alive units list and trigger end-game when appropriate.

---

### 2. 🔴 CRITICAL: Party Filtering Logic Commented Out

**File**: `src/services/battle/Battle.ts` (Lines 81-119)

**Issue**: Only 1/6 units sent to clients instead of full party. Game UI breaks with missing units.

**Before**:
```typescript
defs: [acc.roster.defs[0]],  // ❌ Only first unit!
//(acc.roster.defs as any[]).filter((unit) =>  // ❌ Filtering commented out
//  acc.party.ids.includes(unit.id)
//),
```

**After**:
```typescript
let filteredDefs = (acc.roster.defs as any[]).filter((unit) =>
    acc.party.ids.includes(unit.id)
);

defs: filteredDefs,  // ✅ All 6 units, correctly filtered by party.ids
```

**Impact**: Clients receive complete party (all 6 units) instead of just first unit. Battle board displays correct composition for both players.

**Test**: Start battle → both players see 6 units each on board.

---

### 3. 🔴 CRITICAL: Missing Response in `/battle/exit` Endpoint

**File**: `src/services/battle/Battle.ts` (Line ~315)

**Issue**: Client hangs indefinitely when trying to exit battle. No HTTP response sent.

**Before**:
```typescript
BattleRouter.post("/battle/exit/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    delete battle.parties[data.session.session_key];
    if (!battle.parties.length) battleHandler.removeBattle(battle.battle_id);
    // ❌ NO RESPONSE - client times out
});
```

**After**:
```typescript
BattleRouter.post("/battle/exit/:session_key", (req, res) => {
    let data = req as any;
    let battle: Battle = data.battle;
    delete battle.parties[data.session.session_key];
    if (Object.keys(battle.parties).length === 0) battleHandler.removeBattle(battle.battle_id);
    res.json({ status: "success", battle_id: battle.battle_id });  // ✅ Response sent
});
```

**Impact**: Players can cleanly exit battles and return to menu. HTTP request completes properly.

**Test**: End battle → click exit → immediately return to main menu without timeout.

---

### 4. 🔴 CRITICAL: Parties Data Structure (Array → Object)

**File**: `src/services/battle/Battle.ts` (Line 27-30)

**Issue**: Opponent lookup fails. Undefined cascade errors.

**Before**:
```typescript
this.parties = [];  // ❌ Array - breaks keyed lookup by session_key
this.parties[session.session_key] = party;  // ❌ Creates sparse array
parties: Object.values(this.parties),  // ❌ May contain undefined values
```

**After**:
```typescript
this.parties = {};  // ✅ Object for proper key-value mapping
this.parties[session.session_key] = party;  // ✅ Clean key-value storage
parties: Object.values(this.parties),  // ✅ Always 2 valid parties
```

**Impact**: Battle party data properly keyed. Opponent lookup (`battleHandler.getOpponent()`) now works reliably. No undefined errors.

**Test**: Start battle → verify `battle.parties[session_key]` exists and `Object.keys(battle.parties).length === 2`.

---

### 5. 🔴 CRITICAL: Queue Cleanup Only Removes One Player on Match

**File**: `src/services/queue.ts` (Lines 68-88)

**Issue**: Matched players not fully removed from queue. Duplicate matches occur. Ghost queue entries persist.

**Before**:
```typescript
battleHandler.addBattle([opponent, challenger], match.type, match.power);
gameQueue.splice(gameQueue.indexOf(match), 1)[0];  // ❌ Only removes opponent
// ❌ Challenger never removed from queue!
```

**After**:
```typescript
battleHandler.addBattle([opponent, challenger], match.type, match.power);
gameQueue.splice(gameQueue.indexOf(match), 1);  // Remove opponent
gameQueue.splice(gameQueue.indexOf(item), 1);   // ✅ Also remove challenger
console.log(`[MATCHMAKING] Queue size after removal: ${gameQueue.length}`);
```

**Impact**: Both matched players cleanly removed from queue. Queue state accurate. No duplicate matches for same players.

**Test**: Two players queue → should match and both disappear from queue. Queue size should decrease by 2.

---

### 6. 🔴 CRITICAL: GameRouter Disabled (Commented Out)

**File**: `src/index.ts` (Line 71)

**Issue**: Battle data buffered but never delivered. Clients don't receive game state updates via long-polling.

**Before**:
```typescript
ServiceRouter.use("/chat", ChatRouter);
// ServiceRouter.use("/game", GameRouter);  // ❌ COMMENTED OUT
ServiceRouter.use("/vs", QueueRouter);
```

**After**:
```typescript
ServiceRouter.use("/chat", ChatRouter);
ServiceRouter.use("/game", GameRouter);  // ✅ ENABLED
ServiceRouter.use("/vs", QueueRouter);
```

**Impact**: `/services/game/{session_key}` endpoint now accessible. Clients can fetch buffered battle data (BattleCreateData, unit positions, moves, actions). Long-polling works.

**Test**: After battle created, client calls `/services/game/{session_key}` → receives BattleCreateData immediately.

---

### 7. 🟠 HIGH: Protocol Misalignment with Official Server

**File**: `src/services/battle/Battle.ts` (Lines 44-56, 81-119), `src/services/battle/BattlePartyData.ts`

**Issue**: Client crashes parsing BattleCreateData. Format doesn't match official Banner Saga Factions protocol.

**Reference**: Verified against official Fiddler capture: `data/game_captures/extracted/raw/0058_s.txt` (March 2022 match)

#### **a) Missing EntityDef 'name' Field**

**Before**:
```typescript
// Only minimal fields sent
{ 
    id: "warrior_1", 
    entityClass: "warrior", 
    stats: [...]  
    // ❌ Missing: name, start_date, appearance_acquires, appearance_index
}
```

**After**:
```typescript
// Complete EntityDef with all fields
{
    class: "tbs.srv.data.EntityDef",
    id: "warrior_1",
    entityClass: "warrior",
    name: "Thales",  // ✅ Restored
    stats: [
        { class: "tbs.srv.data.Stat", stat: "RANGE", value: 1 },
        { class: "tbs.srv.data.Stat", stat: "STRENGTH", value: 15 },
        { class: "tbs.srv.data.Stat", stat: "KILLS", value: 148 },  // ✅ Included
        { class: "tbs.srv.data.Stat", stat: "BATTLES", value: 154 },  // ✅ Included
        // ... all stats
    ],
    start_date: 1610826014832,  // ✅ Restored
    appearance_acquires: 0,  // ✅ Restored
    appearance_index: 0  // ✅ Restored
}
```

#### **b) Scene Field**

**Before**:
```typescript
scene: "rand"  // ❌ Incorrect
```

**After**:
```typescript
scene: "greathall"  // ✅ Matches official protocol
```

#### **c) Timer Values**

**Before**:
```typescript
timer: 45  // ❌ Hardcoded same for both players
```

**After**:
```typescript
timer: idx === 0 ? 30 : 45  // ✅ Player 1 gets 30s, Player 2 gets 45s
```

**Impact**: BattleCreateData now matches official protocol exactly. Game client successfully deserializes without crashing. Protocol-compliant battle initialization.

**Test**: Start battle → no client crash → both players render units correctly.

---

## ✨ Improvements

### Logging & Debugging
- Added comprehensive battle initialization logging
  - `[BATTLE]` prefix for battle events
  - `[MATCHMAKING]` prefix for queue events
- Clarified protocol requirements in code comments
- Documented which fields must match official format

### Code Quality
- Removed unnecessary field sanitization (now sends complete objects)
- Improved error messages in queue matching
- Better variable naming (filteredDefs, queueSizeBefore, queueSizeAfter)

---

## ✅ Verification

### Full Battle Flow (Local 2-Player Testing)

1. ✅ **Login**: Test (123456) and Pieloaf (293850) authenticate
2. ✅ **Queue**: Both players join QUICK queue
3. ✅ **Matchmaking**: First-come-first-served matching finds both players
4. ✅ **Battle Creation**: BattleCreateData generated with both parties
5. ✅ **Data Delivery**: Clients receive BattleCreateData via long-polling
6. ✅ **Game Start**: Both players see greathall scene with units rendered
7. ✅ **Party Display**: Each player sees 6 units (not 1)
8. ✅ **Deployment**: Players configure unit positions
9. ✅ **Sync**: Turn synchronization messages exchange
10. ⏳ **Movement**: Test player can move; Pieloaf restricted (UI modal blocking)

### Protocol Alignment (Verified Against Official)

- Battle ID: ✅ 20 hex characters
- Reliable Message IDs: ✅ Format `{battle_id}_{action}_{user_id}`
- EntityDef: ✅ All required fields (id, entityClass, name, stats, start_date, appearance_*)
- BattlePartyData: ✅ All required fields (user, team, display_name, defs, elo, power, session_key, timer, etc.)
- Timer Values: ✅ 30s for player[0], 45s for player[1]
- Scene: ✅ "greathall"

---

## ⏳ Known Issues

### 1. Second Player Movement Restriction
- **Status**: 🔴 BLOCKING
- **Symptom**: Pieloaf player cannot move units despite server receiving move requests
- **Likely Cause**: Client UI modal blocking interaction (not server-side bug)
- **Workaround**: Close modal manually or investigate client-side move validation
- **Next Steps**: Add move request logging to debug opponent lookup and permission checks

### 2. In-Memory Data (Not Persisted)
- **Status**: 🟠 MEDIUM
- **Symptom**: All sessions, battles, queue entries lost on server restart
- **Cause**: No database integration
- **Impact**: Testing limited to single session; server restarts during development lose active games
- **Timeline**: Fixed in Phase 2 (Database Integration)

### 3. Hardcoded Test Data
- **Status**: 🟡 LOW
- **Symptom**: Limited to 2 test users; new accounts require manual JSON edit
- **Cause**: No user registration system
- **Impact**: Multi-user testing limited
- **Timeline**: Fixed in Phase 3 (User Registration)

### 4. No Session Cleanup
- **Status**: 🟡 LOW
- **Symptom**: Sessions persist indefinitely; orphaned battles never cleaned
- **Cause**: No idle timeout or cleanup job
- **Impact**: Memory leaks on long-running servers
- **Timeline**: Fixed in Phase 2 (Session Cleanup)

---

## 🧪 Recommended Testing

### For This Release

**Scenario 1: Full Battle Match**
```
1. Launch: & '.\The Banner Saga Factions.exe' --debug --server http://localhost:8082/ \
    --username test,Pieloaf --factions --developer --steam_id 123456,293850 --steam true
2. Both players queue (QUICK mode)
3. Match should be found immediately
4. Both players see greathall with 6 units each
5. Deploy units and attempt moves
```

**Scenario 2: Battle Exit**
```
1. Complete battle or abandon
2. Click "Exit Battle"
3. Should return to main menu without timeout
```

**Scenario 3: Protocol Verification**
```
1. Capture traffic with Fiddler
2. Compare BattleCreateData structure with data/game_captures/extracted/raw/0058_s.txt
3. Verify: EntityDef has 'name', scene="greathall", parties array populated
```

### For Next Release

- Multi-player testing across internet (after database integration)
- Session persistence after server restart
- Queue timeout behavior (5-min auto-dequeue)
- New user registration flow

---

## Impact Summary

| Bug | Before | After | Severity |
|---|---|---|---|
| 1. Array index syntax | Crash on unit death | Unit tracking works | 🔴 CRITICAL |
| 2. Party filtering | 1/6 units visible | 6/6 units visible | 🔴 CRITICAL |
| 3. Missing HTTP response | Client hangs on exit | Clean battle exit | 🔴 CRITICAL |
| 4. Parties array vs object | Opponent not found | Opponent found | 🔴 CRITICAL |
| 5. Queue cleanup | Ghost queue entries | Queue always clean | 🔴 CRITICAL |
| 6. GameRouter disabled | No data delivered | Long-poll works | 🔴 CRITICAL |
| 7. Protocol misalignment | Client crash on parse | Battle loads correctly | 🟠 HIGH |

---

## Lessons Learned

1. **Type safety**: TypeScript would have caught `indexOf[...]` vs `indexOf(...)` with `noImplicitAny`
2. **Commented-out code**: Active development comments must be cleaned up or marked `// TODO` — silent no-ops are hard to find
3. **HTTP basics**: Every Express endpoint must send a response; missing `res.send()` is a common mistake
4. **Data structure intent**: `{}` for key-value maps, `[]` for ordered lists — initializing wrong and using right silently corrupts state
5. **Protocol compliance**: Reverse-engineer the exact wire format before implementing — the client has no tolerance for missing fields

## Prevention Strategies

- [ ] Enable strict TypeScript (`strict: true` in `tsconfig.json`)
- [ ] `yarn build` must pass before committing (already enforced)
- [ ] Protocol tests against Fiddler captures in `data/game_captures/extracted/raw/`
- [ ] Integration tests for full login → queue → battle flow (see `docs/Test-Framework-Plan.md`)

---

## 📚 References

- **Official Protocol**: `data/game_captures/extracted/raw/0058_s.txt`
- **Battle Flow**: `docs/gameFlow.md`
- **Data Structures**: `docs/dataStructures.md`
