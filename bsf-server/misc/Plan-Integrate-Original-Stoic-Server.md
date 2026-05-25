# Integration Plan: tbs-factions-2013 (Original, at `bsf-refs\server-2013-java\`) ↔ bsf-server (Custom)

_Drafted 2026-05-15. Revised 2026-05-15 after a local critical review against both source trees. Approved decisions: reference + selective port, Elo + battle-result persistence as the first milestone, leave the original repo at `%USERPROFILE%\Code\bsf-refs\server-2013-java` (no submodule)._

_**M0 shipped 2026-05-17** — see [`BSF/REFERENCE.md`](../../REFERENCE.md) for the pinned reference SHA (`515555b`) and top-7 Java paths, and [`bsf-server/docs/protocol-cross-reference.md`](../docs/protocol-cross-reference.md) for the route-by-route Java `*Svc.java` map. While writing M0 it surfaced that the M4 routes (`/services/battle/surrender`, `/services/roster/unit/stats/reset`) are already implemented — see the M4 milestone below._

_**M1 shipped 2026-05-18** — migration runner + `ranking` and `battle` tables + Elo math wired into `endgame()`. Manual 2-player match produced the expected bit-for-bit Java parity (winner 1000→1016, loser 1000→984), and a follow-up match pair confirmed the Elo chains correctly across battles (1016→1030→1043 / 984→970→957). 172 tests passing including 18 ported from `BattleRankingTest.java`. The flat `20 + 3×kills` renown formula and the client-visible `BattleFinishedData` shape are unchanged; renown award types and Elo-on-screen are M1.5. Post-review hardening landed in the same milestone: `Promise.allSettled` (not `Promise.all`) for ranking reads so a one-sided failure can't silently rewrite both players to `ELO_BEGIN`; ranking writes are conditional on `rankingLoadOk` (Elo columns nullable on `BattleRow`); a trailing `.catch` swallows secondary failures from the writes-chain fallback. The legacy `battles` table and `saveBattleResult()` are left in place and unused — a follow-up will drop them. **M1.5 will bundle three deferred cleanup items**: a documented rule that migration files must not open their own transaction, an `existsSync` guard in `scripts/copy-migrations.js`, and a decision on `best_win_streak` (populate in `applyBattleRankingUpdate` or drop the column)._

_**M2 shipped 2026-05-21** — matchmaking math ported from `tbs.srv.worker.VsWorker.java` into `src/services/queue.ts`. The pre-M2 exact-power scan is replaced by a 5-second pump (`processMatches`) that linearly widens each queued entry's `threshold_power` and `threshold_elo` over wait-time (`bumpThreshold`, default 90 s ramp), picks the closest pair by composite score (`bestMatchScore` = Elo gap / `VS_BRACKET_ELO=200` + power gap / `VS_BRACKET_POWER=4`, with a ±1 type-mismatch penalty), and validates both sides' windows (`checkWindows`). Each entry's power is recomputed from current `accountData` at every tick AND once more at match-confirmation — closing the snapshot race documented in `Codebase-Review-Findings-2026-05-07.md` § 3.3 item 2 (no more "queue at power 6, play at power 12"). `addBattle()` and the `Battle` constructor were widened to take `perSide: { power, elo }[]` so the hardcoded `elo: QUICK ? 0 : 1000` at `Battle.ts:153` is replaced by the real pre-match values flowing through from the queue. Three env-var knobs match `VsWorkerConfig` defaults (`VS_WINDOW_POWER_TIME_SECS=90`, `VS_BRACKET_ELO=200`, `VS_BRACKET_POWER=4`); `BSF_MATCHMAKER_LEGACY=true` flips back to the pre-M2 exact-power scan for instant rollback (mirrors `BSF_RENOWN_LEGACY_FORMULA`). 233 tests passing including 25 new pure-function parity cases in `matchmaker.test.ts`, fake-timer pump-lifecycle tests in `matchmakerTick.test.ts`, and a Fiddler shape parity test against `0058_s.txt` in `matchmaker0058.test.ts`. Manual 2-player match confirmed end-to-end. **Deferred**: Elo-on-screen — `BattleFinishedData` still doesn't carry the new Elo for the client to display; that's M1.6. The Java's `dTimer` term from `VsBestMatchComparator` was intentionally dropped — bsf-server has no per-player turn-timer preference in the queue, and the term contributed 0 in the Java when timers matched. `VsWorker`'s force-match logic (`checkForceMatch`) is also out of scope: it backed an admin-only test feature in the original Stoic server and has no corresponding route on bsf-server today._

_**M1.5 shipped 2026-05-20** (Batches 1+2+3) — five award types ported from `BattleMonitor.constructBattleFinishedData` with Java-parity values: WIN (5), KILLS (1 per enemy unit), UNDERDOG (cap 4), EXPERT (2 for ≤30s win), STREAK (1 if pre-battle win_streak ≥ 2 and party power ≥ 6). A plain three-kill win now pays 8 renown (was 29). `BSF_RENOWN_LEGACY_FORMULA=true` env var flips back to the flat `20 + kills × 3` formula for instant rollback. 19 new parity tests in `src/services/battle/renownAwards.test.ts`; manual 2-player match confirmed end-to-end. DAILY, BOOST, FRIEND deferred indefinitely — they depend on infrastructure bsf-server doesn't have yet (a daily-login counter, an unlocks table, a friend-battle-record table); the wire shape still accepts those keys so no client work is wasted when they land. Elo-on-screen split into a separate M1.6 — `BattleFinishedData.as` has no Elo field today, so surfacing the new rating needs investigation of `AccountInfoData` push vs queue-state refresh. **Bug found during manual test (fixed in the same milestone):** `BattleFinishedData.rewards[]` had been ordered "winner first, loser second" since the array was first written, but the client at `engine/battle/fsm/state/BattleStateFinished.as:32` reads `rewards[localBattleOrder]` (= the local player's `party_index`). Pre-M1.5 the bug was invisible because the loser's slot only held `KILLS = N × 3`; M1.5's per-bonus icons made it loud. The array is now indexed by `party_index`. **Batch 3 cleanup landed in the same milestone**: `ranking.best_win_streak` is now populated by `applyBattleRankingUpdate` on every win, `scripts/copy-migrations.js` has an `existsSync` guard around the source-folder read, and the rule that migration `.sql` files must not contain their own `BEGIN`/`COMMIT` is now documented in `bsf-server/.claude/rules/db.md`._

_**M3b shipped 2026-05-24** — 8 lobby endpoints ported from `tbs.srv.web.svc.lobby.LobbySvc` and `tbs.srv.util.LobbySystem`. Replaces the single catch-all stub at `lobby.ts:11-12` with an explicit router and an in-memory `Map<lobby_id, Lobby>` (no DB persistence — lobbies are ephemeral coordination rooms). `lobby_id` is the owner's 32-bit `account_id` per the Java convention; the 1-invitee-per-lobby cap from `LobbySystem.java:40-43` is preserved (2v2 was a Java TODO, not implemented). Push events carry a `class` tag (`tbs.srv.data.LobbyData` / `LobbyOptionsData` / `LobbyPartyData`) added to `ServerClasses`, matching the existing `BattleCreateData` etc. dispatch pattern. `exitAllLobbies(account_id, display_name)` is invoked from both `reapStaleSessions` (auth.ts) and `/auth/logout` so a reaped or logged-out owner can't leave a ghost lobby. **Faithful Java quirk preserved:** `uninvite` does not push to the kicked invitee — `LobbySystem.uninvite` pushes AFTER `removeInvite`, so the kicked id is no longer in `getInvites` when the fan-out runs. **Wire format:** AS3 `HttpRequest.as:67-69` stamps `Content-Type: text/plain` on every String body, and all eight `LobbyTxn` variants pass a String to `super()` (six via `arg.toString()`, two via `JSON.stringify(options)`) — so the router uses `express.text({ type: "text/plain" })` and a small `readBody(req)` helper `JSON.parse`s the string in handlers. Global `express.json()` is unchanged. **Four deliberate divergences from Java for safety** (all documented in code comments + asserted in tests): `/join` to a non-existent lobby (or by a non-invitee) returns 404 (Java silently UPDATEd `account_info.lobby_id` to a junk value); `/invite` 403s when the body's `lobby_id` is not the caller's own `account_id` (blocks hostile clients from creating phantom lobbies in someone else's namespace — the 1-invitee cap only fires once an invitee exists, not at lobby creation); `/invite` 400s on self-invite (Java would overwrite the owner's member entry with the invitee shape, creating a self-DoS); `/options` 403s when the caller is not the owner (blocks metadata-rewrite attacks on someone else's lobby). 20 new vitest cases in `test/routes/lobby.test.ts` cover all 8 endpoints, the production text/plain wire format on an object body, all four security / safety guards, and the reaper / logout integration; 250 tests passing total. **Pre-push review caught two issues that landed in the same milestone:** the initial commit used `express.json({ strict: false })` to accept bare-number bodies, which body-parser still ignored because the actual Content-Type is text/plain — every integer-body route would 400 in production; switched to `express.text` at router level. Java's `/invite` and `/options` also trusted client-supplied `lobby_id` from the body, which is exploitable with a modified client; fixed with the two 403 guards above. **Known follow-up out of scope:** populating the friends list. bsf-server's `data/first.json` still ships `friends: []` hardcoded with no route to add friends, so the in-game "Invite a Friend" button isn't reachable from the lobby UI yet — the M3b endpoints are protocol-complete but the client UI flow that drives them needs the friends-list bootstrap before manual end-to-end testing is possible. Tracked as issue #91. **Out of scope:** lobby chat rooms (Java created a `"lobby_<id>"` room around each lobby; bsf-server's chat is a separate module and integrating it is a future follow-up), `notifyVariation` / VARIATION event, and any lobby-to-battle auto-transition (Java doesn't auto-start a battle on dual-ready either — the client triggers `/vs/start` separately, so `queue.ts` and `Battle.ts` are unchanged by M3b)._

## Context

We now have the **original 2013-era Banner Saga Factions server** source at
`%USERPROFILE%\Code\bsf-refs\server-2013-java` — 175 Java files, MySQL schema
88, plus operational scripts. The 385-file 2013 AS3 client mirror was moved
out of this repo during the 2026-05-16 consolidation and now lives as a
sibling at `%USERPROFILE%\Code\bsf-refs\client-2013-as3\`. Until now,
`bsf-server` (our TypeScript revival) has been built almost entirely from
Fiddler captures and decompiled client transactions. We've been
guessing-and-checking the protocol; the original gives us the **canonical
spec**.

Why this matters now:
- bsf-server has **9 known MVP blockers** documented in
  `bsf-server/misc/Codebase-Review-Findings-2026-05-07.md`. **Blockers
  #1–#6 already shipped** (verified: `Battle.ts` has the `endgameStarted`
  race guard and nests `pushData()` after DB writes resolve). The
  remaining ones — `/lobby/*` stubs (#9; 8 endpoints in the original, not
  4), surrender flow (#8), stats reset (#7), `vbb_name` hardcoded (#10),
  `/account/tutorial`, plus missing tourney/IAP routes — can now be
  resolved by reading the original instead of reverse-engineering.
- The **power-level race** at queue entry is still open. `queue.ts` filters
  on `type AND power` correctly, but `session.accountData` mutates during
  the queue wait so the snapshot drifts before match creation. The
  original's `VsWorker` (NOT `VsSystem` — that's just the message wrapper)
  contains the right power-recompute pattern.
- The **session reaper freeing the opponent before renown saves** is
  documented in `bsf-server/.claude/rules/gotchas.md` and remains open.
- The original has **MySQL schema 88** — far richer than our 2-table SQLite.
  Useful as a target structure for `ranking`, `battle`, `unit_party`,
  `iap_*`, `tourney_*` as we add features. (Original's table is named
  `battle`, not `battle_history`.)

**Outcome we want:** turn the original into a high-leverage *reference* that
makes bsf-server work better, without inheriting the JVM/MySQL/RabbitMQ
runtime cost on our 1 GB production instance.

---

## Recommendation: Read-only reference + selective port

Keep `bsf-server` (TypeScript/Node/Express/SQLite) as the **only production
runtime**. Treat `bsf-refs\server-2013-java\` as a **frozen reference repository** for:

- protocol JSON shapes (`tbs.srv.battle.data.*`, `tbs.srv.db.models.*`)
- Elo math (`tbs.srv.battle.BattleRanking` — pure function; renown is
  separate, see below)
- renown award types (`tbs.srv.battle.BattleMonitor.constructBattleFinishedData`,
  `tbs.srv.battle.RenownSystem`, `EntityDef.killRenown()`)
- matchmaking math (`tbs.srv.worker.VsWorker` — NOT `VsSystem`)
- schema column set (`db/game/0/schema.sql` baseline + 88 numbered
  `apply.sql` migrations)
- wire-format spec for the broken endpoints (`lobby`, `tourney`,
  `tutorial`, `iap`)
- IAP/Steam micro-txn state machine if/when we want a shop

### Why not the alternatives

- **Dual-stack (run both servers, reverse-proxy splits routes)** — the JVM
  alone is ~300–500 MB resident plus we'd need MySQL + RabbitMQ on a 1 GB
  box. Doubles the attack surface of a 12-year-old stack (Jetty 7.6, Jersey
  1.8, RabbitMQ 3.1.3) and breaks the simple Docker+Caddy story.
- **Full Java restoration (abandon bsf-server)** — throws away working
  Steam auth, working long-poll, working SQLite WAL, the test suite, and
  the Docker+Caddy infra. One developer maintaining Java 8 + Jersey 1.8 in
  2026 is a bus-factor-1 nightmare.

The original is most valuable as a **specification artifact**, not as a
running binary.

---

## Repo layout

Leave `server-2013-java\` where it is (`%USERPROFILE%\Code\bsf-refs\`) — its
parent `bsf-refs\` sits alongside, **not inside**, `BSF\`. Do not submodule it; the production Docker image must
not ship Java source, and submodules complicate the `yarn build && yarn test`
pre-commit hook.

Add two small docs to make the reference discoverable:

1. `%USERPROFILE%\Code\BSF\REFERENCE.md` (new) — workspace-root pointer:
   one paragraph explaining the relationship, pinned git SHA of the
   reference repo, and the top 5–7 highest-value file paths.
2. `bsf-server/CLAUDE.md` — add a **"Reference server"** section under
   Architecture pointing to paths in `bsf-refs\server-2013-java\`. Cross-reference
   each `bsf-server` endpoint to its `*Svc.java` analogue.

That's it for repo plumbing — nothing checked into bsf-server itself.

---

## Minimum-viable schema lift

We do **not** need MySQL or 88 migrations of evolution. We need the **final
shape** of a few tables, expressed in SQLite. Stay on `node:sqlite` + WAL for
now; the "move to Postgres" decision is only triggered by multi-instance
scale or heavy analytical queries, neither of which is on the horizon.

Adopt a real migration runner now (a 30-line `src/db/migrations/NNN_*.sql`
reader). The current "auto-init in `connection.ts`" pattern silently breaks
the first time a column changes shape on a DB that already has rows. This
unblocks the named **Stream 1 (DB persistence)** MVP blocker.

Initial tables to port from the original (subset only):
- `ranking` — Elo, wins, losses, streak. First appears in original
  schema 4. Needed for ladder feature.
- `battle` (original's name; we previously called this `battle_history`) —
  replay JSON, participants, outcome, renown deltas. First appears in
  original schema 5. Required to fix the "battle state is in-memory only"
  gotcha.
- `unit_party` — normalize party state so it survives restarts
  independently of the current `accounts.roster_json` blob. First appears
  in original schema 0 (`db/game/0/schema.sql`).

**Account ID convention:** original uses 32-bit `account_id BIGINT`
throughout. Match it in new tables. Our existing `accounts.user_id` TEXT
(64-bit Steam ID string) stays; new tables join on the 32-bit `account_id`
per the gotcha at `bsf-server/.claude/rules/gotchas.md`.

Defer everything else (`iap_*`, `tourney_*`, `friend_*`, `chat_*`,
achievements) to the milestone where the feature lands.

---

## What to mine FIRST (ordered by leverage)

Each line is one piece to read, port, and parity-test.

1. **`BattleRanking` — Elo math only.**
   `bsf-refs/server-2013-java/src/main/java/tbs/srv/battle/BattleRanking.java`
   → port to `bsf-server/src/services/battle/ranking.ts` as a pure function.
   K-factor 32 → 16 between Elo 2100–2400, floor at 100, baseline 1000
   (verified in source, lines 30–37). The original has a tiny JUnit
   `BattleRankingTest` (~15 assertions) — translate inline into vitest.
   Our current `endgame()` writes no Elo at all. **Renown is NOT in
   `BattleRanking`** — it's constructed in
   `BattleMonitor.constructBattleFinishedData()` (line 1091+) with six
   award types (`UNDERDOG`, `STREAK`, `BOOST`, `EXPERT`, `DAILY`,
   `KILLS`) and helpers in `RenownSystem.java` / `EntityDef.killRenown()`.
   Renown is a separate, larger port — see M1.5.

2. **`BattleMonitor` finalize logic — reference only.**
   The original's gate logic lives in `BattleMonitor.java` (~62 KB):
   `checkBattleFinished()` (~line 900), `finalizeFinishing()` (line 1055),
   `constructBattleFinishedData()` (line 1091+). bsf-server's
   `Battle.ts:454-463` already has an `endgameStarted` guard (blocker #1),
   and `Battle.ts:580-682` already nests `pushData()` inside the DB write
   `.then()` (blocker #2). **Do not rewrite `endgame()` as part of M1.**
   Read `BattleMonitor` only to confirm we haven't missed an edge case —
   especially how it waits on async achievement RPCs before sending the
   finished message.

3. **Protocol JSON shapes.**
   `tbs.srv.battle.data.*` (incl. `data/base/`, `data/client/`) and
   `tbs.srv.db.models.*` (~55 `*Data.java` files). Cross-check against
   the 36 endpoints in `bsf-server/src/services/` plus the existing
   Fiddler captures in `bsf-server/data/game_captures/`. Anywhere shapes
   diverge, the original is right.

4. **`VsWorker` — matchmaking math.**
   `bsf-refs/server-2013-java/src/main/java/tbs/srv/worker/VsWorker.java` (NOT
   `VsSystem.java`, which is just a 66-line RabbitMQ wrapper). Concrete
   constants: `VS_WINDOW_POWER_MIN=0`, `VS_WINDOW_POWER_MAX=4`,
   `VS_WINDOW_POWER_TIME_SECS=90`, `VS_WINDOW_ELO_MIN=4`,
   `VS_WINDOW_ELO_MAX=4000`, `VS_BRACKET_ELO=200`, `VS_BRACKET_POWER=4`.
   `bumpThreshold()` (~line 233) is the time-based band expansion. Fixes
   the power-recompute-at-match-creation gap in
   `bsf-server/src/services/queue.ts`. Port the math; keep the env-var
   knobs.

5. **Lobby endpoints.**
   `bsf-refs/server-2013-java/src/main/java/tbs/srv/web/svc/lobby/LobbySvc.java`
   has **8 endpoints** (`invite`, `uninvite`, `exit`, `join`, `decline`,
   `options`, `ready`, `unready`) backed by `LobbySystem.*` state.
   Resolves **Blocker #9**. bsf-server's `lobby.ts` is currently a single
   catch-all stub (`router.post("/:first/:session_key?")`) — not "four
   stubs" as the 2026-05-07 review implied. Larger than mechanical:
   server-side lobby state needs to live somewhere (an in-memory
   `Map<lobby_id, Lobby>` is fine for our scale).

6. **Tutorial completion endpoint — trivial.**
   `accounts.completed_tutorial` already exists in our SQLite schema
   (`connection.ts:33`). The endpoint is a five-line UPDATE — no porting
   from the original needed beyond confirming the wire shape of
   `TutorialCompletedTxn`.

7. **System messages.**
   `tbs.srv.web.SystemMsgSystem` stores a single string in a `system_msg`
   MySQL row; delivery uses `MsgSystem` (RabbitMQ-coupled). The
   persistence is trivial; the in-process EventEmitter substitution is
   feasible because BSF runs single-process. Port as in-process
   `EventEmitter` over our existing `Session` infrastructure. No RabbitMQ.

8. **IAP read-only (later).**
   `tbs.srv.web.svc.iap.*`, `IapCartItem`, `tbs.srv.txn`. Useful only when
   we want a working shop. Port the shapes; have `finalize` return a
   "Steam txn disabled" message until/unless we wire real Steam.

---

## What NOT to port

- **vBulletin auth** (`AuthDataVbb`, `auth_vbb` join) — the Stoic forum is
  gone. Stay Steam-only, finish the existing Discord OAuth session-exchange
  (currently 501 in `bsf-server/src/services/auth/discord.ts`).
- **RabbitMQ-coupled workers and `MsgSystem`** — our single-process Node
  already does the job. Replicate cross-process events with `EventEmitter`
  or in-DB queues.
- **Heroku 4-process Procfile**, Foreman, NewRelic agent — Heroku-era ops.
  Docker + Caddy is fine.
- **EhCache** — our `Map<session_key, Session>` is sufficient at this scale.
- **MySQL `DbHelper` pooling** — `connection.ts` is already the right
  abstraction for our scale.
- **AS3 client mirror into the BSF repo** — the original `tbs-factions-2013`
  bundle used to ship a `tbs-2013/` AS3 mirror inside the reference repo, but
  the 2026-05-16 consolidation moved it out. The mirror now lives as a sibling
  at `%USERPROFILE%\Code\bsf-refs\client-2013-as3\` (alongside the live decompile
  at `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\` and the `bsf-client`
  submodule). Do not vendor any of them into BSF.

---

## Milestones

Sized for one developer, ordered by leverage. Stop after any one is shipped
and re-evaluate priorities.

**M0 — Reference plumbing. ½ day. No code changes.**
- Add `BSF/REFERENCE.md` pinning the reference repo's SHA and listing the
  5–7 critical paths.
- Add "Reference server" section to `bsf-server/CLAUDE.md` mapping
  endpoints to `*Svc.java` analogues.
- Add `bsf-server/docs/protocol-cross-reference.md` (or similar) — one
  line per endpoint with its Java counterpart.
- Verification: a fresh contributor can find the canonical
  `BattlePartyData` definition in under a minute by reading `CLAUDE.md`.

**M1 — Elo ranking + persistent battle results + migration runner. 2–3 days. The named Stream 1 blocker. (Approved as the first post-M0 milestone.)**
- Add a migration runner under `bsf-server/src/db/migrations/` (~30 lines:
  reads `NNN_*.sql` in order, tracks applied versions in a
  `schema_version` table, idempotent).
- Migration 001: add `ranking` and `battle` tables (SQLite syntax,
  matching the column set from the original's schema 4 and 5). Use 32-bit
  `account_id` as the join key.
- Port `BattleRanking.calculateNewElo()` →
  `bsf-server/src/services/battle/ranking.ts` as a pure function.
  Translate the two `BattleRankingTest` methods (~15 assertions) into
  vitest cases.
- Wire Elo writes into the existing `endgame()` in `Battle.ts` **without
  rewriting the surrounding race guard or DB-then-pushData ordering** —
  both are already correct per blockers #1 and #2 being shipped. Write a
  `battle` row on every endgame with party snapshots and renown deltas,
  replacing the current thin `battles` table.
- **Out of scope for M1:** the six renown award types, `RenownSystem`
  port, achievement RPCs. Those become M1.5.
- Verification: `yarn test` (all 50+ existing tests green); add
  `test/parity/ranking.test.ts`; manually run a 2-player battle with
  `launch-game-2p.ps1` and confirm Elo writes to DB on both sides;
  inspect with `sqlite3 data/bsf.db "SELECT * FROM ranking;"`.

**M1.5 — Renown award types. Shipped 2026-05-20 (Batches 1+2+3 complete).**
- ✅ Ported five Java award types: WIN (5), KILLS (1 per enemy unit), UNDERDOG
  (cap 4), EXPERT (2 for ≤30s win), STREAK (1 if pre-battle win_streak ≥ 2 and
  party power ≥ 6). Pure function in `src/services/battle/renownAwards.ts` with
  19 parity cases in `renownAwards.test.ts`.
- ✅ `BSF_RENOWN_LEGACY_FORMULA=true` env var flips back to the flat
  `20 + kills × 3` formula for instant rollback. Default off.
- ⛔ **Deferred indefinitely** — DAILY (needs `account_info.daily_login_bonus`
  counter granted by a daily-login system), BOOST (needs an `unlocks` table
  with a `bst_renown` row), FRIEND (needs a `friend_battle_record` table).
  The wire shape still accepts these keys so no client work is wasted when the
  supporting systems land.
- ⏭ **Split out to M1.6** — Elo-on-screen. The client's `BattleFinishedData.as`
  has no Elo field; surfacing the new rating needs investigation of an
  `AccountInfoData` push vs a queue-state refresh.
- 🐛 **Fixed during manual test** — `BattleFinishedData.rewards[]` had been
  ordered "winner first, loser second" since the array was first written, but
  the client reads `rewards[localBattleOrder]` (= the local party_index).
  Pre-M1.5 the bug was invisible because the loser's slot only carried
  `KILLS = N × 3`; M1.5's per-bonus icons made it loud. The array is now
  indexed by `party_index`, with an enforcement comment in `Battle.ts` and a
  matching rule in `bsf-server/CLAUDE.md`.
- **Caveat — stale 2013 AS3 source:** if you cross-check the client-side
  `EntityDef.as` to confirm renown intent, read the decompile at
  `bsf-refs\client-decompiled-as3\engine\entity\def\EntityDef.as`, NOT the
  2013 source. `EntityDef.as` is one of 12 files Stoic modified after 2013
  (per the 2026-05-16 signature audit), so the 2013 version is stale.
- ✅ **Batch 3 cleanup — landed.** `applyBattleRankingUpdate` now bumps
  `ranking.best_win_streak = MAX(best_win_streak, MAX(1, win_streak + 1))` on
  every win in the same UPDATE statement; `scripts/copy-migrations.js` checks
  `existsSync(src)` before reading and warns+exits 0 if the source folder is
  missing; `bsf-server/.claude/rules/db.md` now documents that migration
  `.sql` files must not contain their own `BEGIN TRANSACTION` / `COMMIT` — the
  runner already wraps each file in a transaction.

**M2 — Matchmaking lift. Shipped 2026-05-21.**
- ✅ Ported `VsWorker.java` matchmaking math into `src/services/queue.ts`:
  pure helpers `bumpThreshold` (lines 226–240 of the Java source),
  `computeDynamicPowerMax` (lines 246–254), `checkWindows` (lines 851–865),
  `bestMatchScore` (lines 743–761, with the `dTimer` term dropped since
  bsf-server has no per-player turn-timer preference in the queue),
  `findBestMatch` (lines 802–849), and `processMatches` as the 5-second
  pump (lines 944–1000). All integer arithmetic uses `Math.trunc` to
  match Java's `(int)` truncation toward zero — same rule M1's `ranking.ts`
  enforces.
- ✅ Power-recompute fix at every tick and at match-confirmation in
  `tryCreateBattle` — closes the snapshot race from race-conditions item 2
  of the 2026-05-07 review.
- ✅ Env-var knobs exposed with Java-default values: `VS_WINDOW_POWER_TIME_SECS=90`,
  `VS_BRACKET_ELO=200`, `VS_BRACKET_POWER=4`. Plus `BSF_MATCHMAKER_LEGACY=true`
  for instant rollback (mirrors `BSF_RENOWN_LEGACY_FORMULA`).
- ✅ `addBattle()` and `Battle` constructor widened from a single shared
  `power: number` to `perSide: { power, elo }[]`. Each `BattlePartyData`
  now carries the side's own current power and real pre-match Elo —
  pre-M2 every QUICK wrote `elo: 0` and every RANKED wrote the literal
  `1000`. QUICK still snapshots `elo: 0` (matches Java and the Fiddler
  capture `0058_s.txt`); RANKED/TOURNEY pull the snapshot from
  `getOrCreateRanking()` at `/vs/start` time.
- ✅ 233 tests passing. New: `src/services/matchmaker.test.ts` (25
  table-driven parity cases for the four pure helpers),
  `src/services/matchmakerTick.test.ts` (`vi.useFakeTimers()` lifecycle
  tests for the pump), `src/services/matchmaker0058.test.ts` (shape
  parity against the captured 2013 `/vs/start` response). Existing
  `src/services/queue.test.ts` gained 6 new behavior cases (bracket
  widening, RANKED equal-power, stale-session sweep, power-recompute
  regression, LEGACY exact-match, LEGACY pump no-op).
- ✅ Bundled one-line fix: `.unref()` on the existing 60-second
  queue-timeout sweep, matching the same pattern the new pump uses and
  what the session reaper already has.
- ⏭ **Split out to M1.6** — Elo-on-screen. `BattleFinishedData.as` still
  has no Elo field; surfacing the new rating to the client needs a
  separate investigation (either an `AccountInfoData` push or a
  queue-state refresh).
- ⛔ **Out of scope (no corresponding feature on bsf-server)**: Java's
  `VsBestMatchComparator.dTimer` term (no per-player turn-timer
  preference in our queue), and `VsWorker.checkForceMatch` (backed an
  admin-only test feature in the original Stoic server).

**M3a — Tutorial endpoint. Shipped 2026-05-21.**
- ✅ Added `POST /services/account/tutorial/:session_key` to `AccountRouter`
  that flips `accounts.completed_tutorial = 1` via a new
  `markTutorialComplete(user_id)` helper in `src/db/account.ts`. Idempotent
  short-circuit on `session.accountData.completed_tutorial === true` so the
  SQL doesn't run when it's already done. In-memory mirror updated
  immediately after the write per `.claude/rules/db.md`.
- ✅ Two parity tests in `test/routes/account.test.ts` under a new `describe`
  block: happy-path flip from false → true (helper called once, mirror
  updates) and idempotent path (helper not called when already complete).
  174 vitest cases total passing.
- ✅ Manual smoke verified the idempotent path returns 200 with no DB write.
  The flip path is covered by automated tests only — the schema defaults new
  accounts to `completed_tutorial = 1` and the in-memory mirror can't be
  toggled to false without restarting the server, so the flip path is
  essentially dead under normal traffic. Endpoint exists so the client's
  `TutorialCompletedTxn.as` no longer hits a 404 at end-of-tutorial.

**M3b — Lobby endpoints. Shipped 2026-05-24.**
- ✅ All 8 endpoints ported from `LobbySvc.java` (`invite`, `uninvite`,
  `exit`, `join`, `decline`, `options`, `ready`, `unready`) into
  `bsf-server/src/services/lobby.ts`, backed by an in-memory
  `lobbies: Map<lobby_id, Lobby>` at module scope. The single catch-all
  stub at the old `lobby.ts:11-12` is replaced. Closes Blocker #9 at the
  protocol layer.
- ✅ `lobby_id == owner's account_id` convention preserved per
  `doJoin(config, data.lobby_id, data.lobby_id)` in the Java. 1-invitee-
  per-lobby cap preserved per the "only 1 invite per room right now" rule
  at `LobbySystem.java:40-43`. Pushes carry a `class` tag from new
  `ServerClasses.LOBBY_*` entries in `src/const.ts`.
- ✅ Session lifecycle hook: `exitAllLobbies(account_id, display_name)`
  called from both `reapStaleSessions` and `/auth/logout` so a reaped or
  logged-out owner cleanly TERMINATEs their lobby and an evicted invitee
  pushes EXIT to the remaining members. Without this hook a ghost owner
  would keep showing in someone else's lobby UI.
- ✅ 20 new vitest cases in `test/routes/lobby.test.ts` cover all 8
  endpoints + the lifecycle hooks + all four security / safety guards +
  the production text/plain wire format on an object body (invite happy
  path
  / 1-max / 400 / 403-on-foreign-lobby_id / text-plain-wire-format; join
  state-flip / 404-on-missing / 404-on-not-invited; decline; uninvite
  no-push-to-kicked; exit-as-member; exit-as-owner TERMINATES; options
  flow / 403-on-non-owner; ready / unready / 400; logout-terminates;
  reaper-terminates).
- ✅ **Wire format:** AS3 `HttpRequest.as:67-69` stamps
  `Content-Type: text/plain` on every String body, and all eight
  `LobbyTxn` variants pass a String to `super()` (six via
  `arg.toString()`, two via `JSON.stringify(options)`). The router uses
  `LobbyRouter.use(express.text({ type: "text/plain" }))` and a small
  `readBody(req)` helper `JSON.parse`s the raw string in handlers
  (falling back to the raw string for non-JSON content, which integer
  routes then reject as NaN via `Number(...)`). Global `express.json()`
  is unchanged.
- ⚖️ **Four deliberate divergences from Java for safety** (each
  documented in code comments and asserted in tests): `/join` to a
  non-existent lobby (or by a non-invitee) returns 404 (Java silently
  UPDATEd `account_info.lobby_id` to a junk value and pushed to no-one);
  `/invite` returns 403 when the body's `lobby_id` is not the caller's
  own `account_id` (blocks hostile clients from creating phantom lobbies
  in someone else's namespace — the 1-invitee cap only fires once an
  invitee exists, not at lobby creation); `/invite` returns 400 when
  the caller invites themselves (Java would overwrite the owner's
  member entry with the invitee shape — `joined: false, ready: false`
  — creating a self-DoS where the owner can no longer ready up);
  `/options` returns 403 when the caller is not the lobby owner
  (blocks metadata-rewrite attacks on someone else's lobby — the Java
  accepted `/options` from any session).
- 🛠️ **Pre-push review caught two issues that landed in the same
  milestone:** (1) the initial implementation used
  `express.json({ strict: false })` at app level to accept bare-number
  bodies, but body-parser still ignored them because the AS3 client
  actually sends `Content-Type: text/plain` — every integer-body route
  would 400 in production despite all tests passing. Reviewer flagged
  by cross-checking `HttpRequest.as`; switched to `express.text` at
  router level + the `readBody` helper above. (2) The initial code
  trusted client-supplied `lobby_id` on `/invite` and `/options` — a
  hostile client could create a phantom lobby in a victim's namespace
  or rewrite a victim's lobby metadata. Fixed with the two 403 guards
  above.
- 🔒 **Faithful Java quirk:** `uninvite` does NOT push to the kicked
  invitee (Java pushes after `removeInvite`, so the kicked id is absent
  from `getInvites` at fan-out time). Code comment + test assertion
  document the behavior so a future contributor doesn't "fix" it
  accidentally.
- ⛔ **Out of scope:** lobby chat rooms (Java auto-creates `"lobby_<id>"`
  rooms; bsf-server's chat is a separate module — future follow-up),
  `notifyVariation` / VARIATION event, and any lobby→battle auto-
  transition (Java doesn't have one either — the client calls `/vs/start`
  after dual-ready, so `queue.ts` and `Battle.ts` are unchanged).
- 🚧 **Known follow-up — friends list:** bsf-server's `data/first.json`
  ships `friends: []` hardcoded with no route to add friends, so the
  client's "Invite a Friend" button isn't reachable from the lobby UI
  today. M3b is protocol-complete; the client UI flow that drives these
  endpoints needs the friends-list bootstrap before a full end-to-end
  smoke is possible. Verification for M3b is therefore the new vitest
  suite plus `test-2p-match.bat` (which continues to pass — queue and
  battle are untouched). Tracked as a separate issue.

**M4 — Surrender + stats reset. ½ day.**
- **Status note 2026-05-17 (added during M0):** the `/services/battle/surrender`
  route is already implemented at `bsf-server/src/services/battle/Battle.ts:519`
  (delegates to `finalizeSurrender()`), and `/services/roster/unit/stats/reset`
  is already implemented at `bsf-server/src/services/roster.ts:226`. Both blockers
  #7 and #8 appear closed. M4 may shrink to verification only — run the existing
  test suite and a manual surrender from the client to confirm no regressions.
- Close blockers #7 (`/services/roster/unit/stats/reset`) and #8
  (`/services/battle/surrender`). Both routes have shapes we can confirm
  in the original. Both reuse existing endgame / roster helpers.
- Verification: existing test suite + a manual surrender from the client.

**M5 — System messages + admin. ½ day.**
- Port `SystemMsgSystem` as an in-process EventEmitter feeding
  `Session.pushData`. Add minimal `/services/admin/*` endpoints gated on a
  new `BSF_ADMIN_KEY` env var (deliberately not the original's `ADMIN_KEY`
  to make it explicit).
- Verification: post a system message via curl, confirm a connected
  long-polling client receives it.

**M6 — Battle replay capture. 2 days.**
- Port `BattleReplayData` shape; write replays to the new `battle` table
  as JSON (or to disk if size becomes a concern).
- Build a replay-driven parity test harness — re-drive bsf-server with a
  captured replay and assert state-hash convergence at every turn. This
  becomes our strongest long-term correctness signal.

**M7+ — Tournaments, friends, leaderboards, IAP.**
- Each is its own milestone. Mine the corresponding `tbs.srv.web.svc.*`
  package. Only start once M0–M6 are stable.

Sequence M1 before M2/M3b/M4 even though some are smaller — persistence
and Elo are foundational and every later milestone (especially M6 and
M7+) benefits from a real `battle` table and `ranking` row.

---

## Verification approach

Three layers, in order of cost:

1. **Shape parity.** For each ported endpoint, use the existing
   `data/game_captures/` Fiddler captures plus any JSON shapes inferred
   from `tbs.srv.*.data` classes. The AS3 `tbs/` package at
   `bsf-refs\client-2013-as3\…\tbs\` mirrors the Java `tbs.srv.*` data
   classes and is byte-equivalent to the live decompile (per the 2026-05-16
   signature audit) — cross-check JSON wire shapes there for free. Add
   deep-equal vitest tests under `bsf-server/test/parity/`, ignoring
   timestamps and IDs via a custom matcher.
2. **Algorithm parity.** For Elo, matchmaking, renown — port the Java
   math as **pure functions** with no I/O. Table-driven tests with 20–50
   input/output pairs derived by reading the Java carefully (and by
   translating `BattleRankingTest.java` to vitest where applicable).
3. **Replay parity (M6+).** Once `BattleReplayData` is written, re-drive
   bsf-server through captured replays and assert state convergence.

We do **not** need to boot the Java server. Optionally, an afternoon
spent running it locally (with `AD_HOC_ACCOUNTS=true`,
`VBB_ENABLED=false`, sandbox Steam) against a throwaway MySQL would let
us capture fresh JSON responses — useful but not required.

---

## Critical files (read these to execute)

Reference repo (read-only):
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\BattleRanking.java` — Elo math (M1)
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\BattleMonitor.java` — finalize gate (M1 reference); renown construction (M1.5 port target)
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\RenownSystem.java` — renown award helpers (M1.5)
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\BattleSystem.java` — battle state machine
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\worker\VsWorker.java` — matchmaking math (M2)
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\web\svc\lobby\LobbySvc.java` — 8 lobby endpoints (M3b)
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\db\models\` (folder, ~55 files) — wire format
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\battle\data\` (folder) — battle wire format
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\db\game\0\schema.sql` — base schema; later migrations under `db/game/N/apply.sql`
- `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\test\java\tbs\srv\battle\BattleRankingTest.java` — JUnit cases to port to vitest (M1)
- `%USERPROFILE%\Code\bsf-refs-compare\` — signature-comparison artifacts and `pass2-sig.py` script. Re-run to verify whether another AS3 file is stale or to re-baseline after a future client patch.

bsf-server files to modify (per milestone):
- `%USERPROFILE%\Code\BSF\REFERENCE.md` (M0, new at workspace root)
- `%USERPROFILE%\Code\BSF\bsf-server\CLAUDE.md` (M0, add Reference server section)
- `%USERPROFILE%\Code\BSF\bsf-server\src\db\migrations\` (M1, new folder)
- `%USERPROFILE%\Code\BSF\bsf-server\src\db\connection.ts` (M1, add migration runner)
- `%USERPROFILE%\Code\BSF\bsf-server\src\services\battle\ranking.ts` (M1, new)
- `%USERPROFILE%\Code\BSF\bsf-server\src\services\battle\Battle.ts` (M1 Elo wire-up; M1.5 renown award types — do NOT rewrite the race guard or DB-then-pushData ordering, both already correct)
- `%USERPROFILE%\Code\BSF\bsf-server\src\services\queue.ts` (M2)
- `%USERPROFILE%\Code\BSF\bsf-server\src\services\account.ts` or new tutorial route (M3a)
- `%USERPROFILE%\Code\BSF\bsf-server\src\services\lobby.ts` (M3b)
- `%USERPROFILE%\Code\BSF\bsf-server\src\services\roster.ts` (M4 stats reset)

---

## Handoff for a new chat

A fresh Claude session can pick this up cold. Read in this order:

1. **This file** — the full plan.
2. **`bsf-server/CLAUDE.md`** — the working-style rules below MUST be
   followed for every edit.
3. **`bsf-server/.claude/rules/gotchas.md`** — short list of footguns
   (32-bit `account_id`, session-key width, session reaper, etc.).
4. **`bsf-server/misc/Codebase-Review-Findings-2026-05-07.md`** — current
   blocker status (blockers #1–#6 shipped, #7–#10 open).

### Where to start

- **First milestone: M0** (½ day, no code changes). Adds the reference
  pointers so any future session can find the canonical Java sources
  quickly.
- **Then M1** (2–3 days). Elo + persistent battle results + migration
  runner. The named Stream 1 blocker.
- Stop and check in with the user after each milestone before starting
  the next.

### Working-style rules (non-negotiable, from `bsf-server/CLAUDE.md`)

- **Explain every edit before making it.** For every code change, present:
  *What it does* (plain English), *Why we need it*, *Tradeoff/risk*. The
  user is actively learning — every edit is also a teaching moment.
- **Present ALL planned edits before touching any file.** List each file
  change with What / Why / Tradeoff in a single text-only message ending
  with "Reply y to approve." Only after explicit `y` may the next response
  modify files. Each new batch needs its own approval cycle.
- **After completing changes:** prompt the user to run `yarn test`, then
  prompt them to manually test, then ask "Do you want me to update the
  documentation?", then ask "Do you want me to create a commit?". Do not
  skip steps or chain them.
- **Commit messages and CHANGELOG entries** in plain English (no function
  names or file paths in the subject line); end CHANGELOG entries with a
  single italicised `*Technical:*` line for grep.
- **Use PowerShell-friendly commands** in any text aimed at the user
  (`;` instead of `&&`, `$env:VAR=...` instead of `export`). Prompt the
  user to run `yarn build`, `yarn test`, `yarn dev`, `start-server.bat`
  locally rather than invoking via tool — output is too verbose for
  context.
- **Use `%USERPROFILE%\...` in docs**, not hardcoded `C:\Users\rleyb\...`
  paths. See `BSF/CLAUDE.md` Documentation Path Style.

### Do / Don't rails surfaced by the review

**DO:**
- Use 32-bit `account_id BIGINT` as the join key in any new table (per
  gotcha at `bsf-server/.claude/rules/gotchas.md`).
- Write migrations in SQLite syntax — not MySQL (the original's `INT
  UNSIGNED`, `ALTER TABLE ADD UNIQUE KEY` won't work).
- Keep the env-var knobs from `VsWorker`
  (`VS_WINDOW_POWER_TIME_SECS=90`, `VS_BRACKET_ELO=200`,
  `VS_BRACKET_POWER=4`) when porting matchmaking.
- Translate the two `BattleRankingTest` methods inline into vitest as
  table-driven cases.

**DON'T:**
- DO NOT rewrite the `endgameStarted` race guard or the
  DB-write-then-pushData ordering in `Battle.ts`. Blockers #1 and #2
  are already fixed; M1 is purely additive (write Elo, write a `battle`
  row).
- DO NOT introduce RabbitMQ, MySQL, JVM, EhCache, NewRelic, or any
  Heroku-era infrastructure. The original's `MsgSystem` and
  `WorkerMain`/`BaseWorker` patterns are out of scope.
- DO NOT port vBulletin auth, `AuthDataVbb`, or the `auth_vbb` join —
  the Stoic forum is gone.
- DO NOT vendor or submodule the original Java server
  (`bsf-refs\server-2013-java\`) into the BSF repo — it lives at
  `%USERPROFILE%\Code\bsf-refs\server-2013-java` as a sibling.
- DO NOT confuse `VsSystem` (RabbitMQ wrapper, 66 lines) with
  `VsWorker` (the actual matchmaking math). Port the latter.

### Verification commands (PowerShell)

```powershell
# After M1 (Elo + battle persistence):
cd %USERPROFILE%\Code\BSF\bsf-server
yarn test
yarn build
sqlite3 data\bsf.db "SELECT * FROM ranking LIMIT 5;"
sqlite3 data\bsf.db "SELECT battle_id, winner_user_id, loser_user_id, renown_awarded FROM battle ORDER BY finished_at DESC LIMIT 5;"

# Manual smoke test:
.\test-2p-match.bat
.\launch-game-2p.ps1
```

### State of the codebase at handoff

- Branch: `RichardElTaino-MVP_documentation-Phase1` (or successor)
- Recent commits (run `git log --oneline -10` for current): session
  reaper edge-case docs, surrender-on-reap fix, performance audit punch
  list, prompt-user-for-yarn-test workflow change.
- bsf-server has 50+ vitest cases passing; pre-commit hook runs
  `yarn build && yarn test`.
- Stream 1 (DB persistence) is the named blocker driving M1.
