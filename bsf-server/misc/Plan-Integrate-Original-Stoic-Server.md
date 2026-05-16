# Integration Plan: tbs-factions-2013 (Original) ↔ bsf-server (Custom)

_Drafted 2026-05-15. Approved decisions: reference + selective port, battle persistence + endgame math as the first milestone, leave the original repo at `C:\Users\rleyb\Code\tbs-factions-2013` (no submodule)._

## Context

We now have the **original 2013-era Banner Saga Factions server** source at
`%USERPROFILE%\Code\tbs-factions-2013\Code\tbs-factions-2013` — 171 Java files, MySQL schema 88,
385 AS3 client reference files, plus operational scripts. Until now,
`bsf-server` (our TypeScript revival) has been built almost entirely from
Fiddler captures and decompiled client transactions. We've been
guessing-and-checking the protocol; the original gives us the **canonical
spec**.

Why this matters now:
- bsf-server has **9 known MVP blockers** documented in
  `bsf-server/misc/Codebase-Review-Findings-2026-05-07.md` (4 already fixed).
  Several of the remaining ones — `/lobby/*` stubs, `/account/tutorial`,
  surrender flow, stats reset, missing tourney/IAP routes — can now be
  resolved by reading the original instead of reverse-engineering.
- Known races in `Battle.ts` (double endgame, power-level mismatch at queue
  entry, session reaper freeing opponent before renown saves) likely have
  precedent solutions in the original's `BattleSystem` / finalize flow.
- The original has **MySQL schema 88** — far richer than our 2-table SQLite.
  Useful as a target structure for `ranking`, `battle_history`, `unit_party`,
  `iap_*`, `tourney_*` as we add features.

**Outcome we want:** turn the original into a high-leverage *reference* that
makes bsf-server work better, without inheriting the JVM/MySQL/RabbitMQ
runtime cost on our 1 GB production instance.

---

## Recommendation: Read-only reference + selective port

Keep `bsf-server` (TypeScript/Node/Express/SQLite) as the **only production
runtime**. Treat `tbs-factions-2013` as a **frozen reference repository** for:

- protocol JSON shapes (`tbs.srv.battle.data.*`, `tbs.srv.db.models.*`)
- battle / Elo / renown math (`tbs.srv.battle.BattleRanking`,
  `BattleSystem` — and the original even has JUnit `BattleRankingTest`)
- matchmaking logic (`tbs.srv.vs.VsSystem`, `VsSvc`)
- schema column set (`db/game/0/schema.sql` + the 88 `apply.sql` migrations)
- the wire-format spec for the broken endpoints (`lobby`, `tourney`,
  `tutorial`, `iap`)
- IAP/Steam micro-txn state machine if/when we want a shop

### Why not the alternatives

- **Dual-stack (run both servers, reverse-proxy splits routes)** — the JVM
  alone is ~300–500 MB resident plus we'd need MySQL + RabbitMQ on a 1 GB
  box. Doubles the attack surface of a 12-year-old stack (Jetty 7.6, Jersey
  1.8, RabbitMQ 3.1.3) and breaks the simple Docker+Caddy story.
- **Full Java restoration (abandon bsf-server)** — throws away working
  Steam auth, working long-poll, working SQLite WAL, working test suite, and
  Docker+Caddy infra. One developer maintaining Java 8 + Jersey 1.8 in 2026
  is a bus-factor-1 nightmare.

The original is most valuable as a **specification artifact**, not as a
running binary.

---

## Repo layout

Leave `tbs-factions-2013` where it is (`C:\Users\rleyb\Code\`) — alongside,
**not inside**, `BSF\`. Do not submodule it; the production Docker image must
not ship Java source, and submodules complicate the `yarn build && yarn test`
pre-commit hook.

Add two small docs to make the reference discoverable:

1. `C:\Users\rleyb\Code\BSF\REFERENCE.md` (new) — workspace-root pointer:
   one paragraph explaining the relationship, pinned git SHA of the
   reference repo, and the top 5–7 highest-value file paths.
2. `bsf-server/CLAUDE.md` — add a **"Reference server"** section under
   Architecture pointing to the absolute paths in `tbs-factions-2013`. Cross-
   reference each `bsf-server` endpoint to its `*Svc.java` analogue.

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
- `ranking` — Elo, wins, losses, streak. Needed for ladder feature.
- `battle_history` — replay JSON, participants, outcome, renown deltas.
  Required to fix the "battle state is in-memory only" gotcha.
- `unit_party` — normalize party state so it survives restarts independently
  of the current `accounts.roster_json` blob.

Defer everything else (`iap_*`, `tourney_*`, `friend_*`, `chat_*`, achievements)
to the milestone where the feature lands.

---

## What to mine FIRST (ordered by leverage)

Each line is one piece to read, port, and parity-test.

1. **`BattleRanking` — Elo / renown math.**
   `tbs-factions-2013/src/main/java/tbs/srv/battle/BattleRanking.java`
   → port to `bsf-server/src/services/battle/ranking.ts` as a pure function.
   The original even has JUnit tests (`BattleRankingTest`) we can translate
   to vitest table cases. Our current `endgame()` uses a flat
   `20 + kills × 3`; the original ramps with K-factor (32 → 16 between Elo
   2100–2400, floor at 100, baseline 1000).

2. **Battle finalize gate.**
   `tbs-factions-2013/src/main/java/tbs/srv/web/svc/battle/finalize/`
   → fixes the **double-endgame race** (blocker #1) and **silent renown
   loss** (blocker #2) in `bsf-server/src/services/battle/Battle.ts`. Read
   how the original gates concurrent kill messages.

3. **Protocol JSON shapes.**
   `tbs.srv.battle.data.*` and `tbs.srv.db.models.*` (~55 `*Data.java`
   files). Cross-check against the 36 endpoints in `bsf-server/src/services/`
   plus the existing Fiddler captures in `bsf-server/data/game_captures/`.
   Anywhere shapes diverge, the original is right.

4. **`VsSystem` — matchmaking.**
   `tbs-factions-2013/src/main/java/tbs/srv/vs/VsSystem.java` and
   `tbs.srv.web.svc.vs.VsSvc`. Fixes the **power-level race** (race-condition
   list, item 2) and likely supplies rank-banded matching with timeout
   expansion. Port to `bsf-server/src/services/queue.ts`.

5. **Lobby endpoints.**
   `tbs-factions-2013/src/main/java/tbs/srv/web/svc/lobby/` → resolves
   **Blocker #9** (four `/lobby/*` stubs in `bsf-server/src/services/lobby.ts`).
   Mechanical port.

6. **Tutorial completion endpoint.**
   Look for `tutorial` in `tbs.srv.web.svc.account` / similar →
   resolves the missing `/services/account/tutorial` route (review §3.4).

7. **System messages.**
   `tbs.srv.web.SystemMsgSystem` + `SystemMsgListener` → port as in-process
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
- **RabbitMQ-coupled workers** — our single-process Node already does the
  job. Replicate cross-process events with `EventEmitter` or in-DB queues.
- **Heroku 4-process Procfile**, Foreman, NewRelic agent — Heroku-era ops.
  Docker + Caddy is fine.
- **EhCache** — our `Map<session_key, Session>` is sufficient at this scale.
- **MySQL `DbHelper` pooling** — `connection.ts` is already the right
  abstraction for our scale.
- **`tbs-2013/` AS3 mirror inside the reference repo** — we already have the
  decompiled client at `C:\Users\rleyb\Code\_bsfclient_decompiled_for_ai_review\`
  and the `bsf-client` submodule.

---

## Milestones

Sized for one developer, ordered by leverage. Stop after any one is shipped
and re-evaluate priorities.

**M0 — Reference plumbing. ½ day. No code changes.**
- Add `BSF/REFERENCE.md` pinning the SHA and listing the 5–7 critical paths.
- Add "Reference server" section to `bsf-server/CLAUDE.md` mapping endpoints
  to `*Svc.java` analogues.
- Add `bsf-server/docs/protocol-cross-reference.md` (or similar) — one line
  per endpoint with its Java counterpart.
- Verification: a fresh contributor can find the canonical
  `BattlePartyData` definition in under a minute by reading `CLAUDE.md`.

**M1 — Battle persistence + endgame race fix. 2–3 days. The named Stream 1 blocker. (Approved as the first post-M0 milestone.)**
- Add a migration runner under `bsf-server/src/db/migrations/`.
- Port `BattleRanking` → `bsf-server/src/services/battle/ranking.ts` (pure
  function, vitest table tests derived from the JUnit cases).
- Add `ranking` and `battle_history` tables via migration 001.
- Rewrite `endgame()` in `bsf-server/src/services/battle/Battle.ts` to be
  transactional and idempotent, mirroring the original finalize gate. Closes
  blockers #1 and #2.
- Verification: run the existing `yarn test`; add new parity tests in
  `bsf-server/test/parity/ranking.test.ts`; manually run a 2-player battle
  with `launch-game-2p.ps1` and confirm both renown awards persist.

**M2 — Matchmaking lift. 1–2 days.**
- Port `VsSystem` logic to `bsf-server/src/services/queue.ts`: rank bands,
  timeout-driven band expansion, power recompute at match-creation time
  (fixes power-level mismatch race).
- Verification: parity test driving the queue with two simulated sessions
  and asserting match outcome matches captured `/vs/start` Fiddler traffic.

**M3 — Lobby + tutorial endpoints. 1 day.**
- Walk `tbs.srv.web.svc.lobby` and the original tutorial endpoint; replace
  the four `/lobby/*` stubs in `bsf-server/src/services/lobby.ts` and add
  `/services/account/tutorial`. Closes blockers #9 and the missing tutorial
  route in §3.4.
- Verification: `test-2p-match.bat` continues to pass; client no longer
  errors on lobby calls in `data/game_captures/`.

**M4 — Surrender + stats reset. ½ day.**
- Close blockers #7 and #8 in
  `bsf-server/misc/Codebase-Review-Findings-2026-05-07.md`. Both routes have
  shapes we can confirm in the original.
- Verification: existing test suite + a manual surrender from the client.

**M5 — System messages + admin. 1 day.**
- Port `SystemMsgSystem` as an in-process EventEmitter feeding
  `Session.pushData`. Add minimal `/services/admin/*` endpoints gated on a
  new `BSF_ADMIN_KEY` env var (deliberately not the original's `ADMIN_KEY`
  to make it explicit).
- Verification: post a system message via curl, confirm a connected
  long-polling client receives it.

**M6 — Battle replay capture. 2 days.**
- Port `BattleReplayData` shape; write replays to `battle_history` as JSON
  (or to disk if size becomes a concern).
- Build a replay-driven parity test harness — re-drive bsf-server with a
  captured replay and assert state-hash convergence at every turn. This
  becomes our strongest long-term correctness signal.

**M7+ — Tournaments, friends, leaderboards, IAP.**
- Each is its own milestone. Mine the corresponding `tbs.srv.web.svc.*`
  package. Only start once M0–M6 are stable.

Sequence M1 before M3/M4 even though M3/M4 are smaller — persistence is the
named blocker and every milestone after benefits from real `battle_history`
rows.

---

## Verification approach

Three layers, in order of cost:

1. **Shape parity.** For each ported endpoint, use the existing
   `data/game_captures/` Fiddler captures plus any JSON shapes inferred from
   `tbs.srv.*.data` classes. Add deep-equal vitest tests under
   `bsf-server/test/parity/`, ignoring timestamps and IDs via a custom
   matcher.
2. **Algorithm parity.** For Elo, matchmaking, renown — port the Java math
   as **pure functions** with no I/O. Table-driven tests with 20–50
   input/output pairs derived by reading the Java carefully (and by
   translating `BattleRankingTest.java` to vitest where applicable).
3. **Replay parity (M6+).** Once `BattleReplayData` is written, re-drive
   bsf-server through captured replays and assert state convergence.

We do **not** need to boot the Java server. Optionally, an afternoon spent
running it locally (with `AD_HOC_ACCOUNTS=true`, `VBB_ENABLED=false`,
sandbox Steam) against a throwaway MySQL would let us capture fresh JSON
responses — useful but not required.

---

## Critical files (read these to execute)

Reference repo (read-only):
- `C:\Users\rleyb\Code\tbs-factions-2013\src\main\java\tbs\srv\battle\BattleRanking.java`
- `C:\Users\rleyb\Code\tbs-factions-2013\src\main\java\tbs\srv\battle\BattleSystem.java`
- `C:\Users\rleyb\Code\tbs-factions-2013\src\main\java\tbs\srv\vs\VsSystem.java`
- `C:\Users\rleyb\Code\tbs-factions-2013\src\main\java\tbs\srv\web\svc\battle\finalize\` (folder)
- `C:\Users\rleyb\Code\tbs-factions-2013\src\main\java\tbs\srv\web\svc\lobby\` (folder)
- `C:\Users\rleyb\Code\tbs-factions-2013\src\main\java\tbs\srv\db\models\` (folder, ~55 files)
- `C:\Users\rleyb\Code\tbs-factions-2013\src\main\java\tbs\srv\battle\data\` (folder)
- `C:\Users\rleyb\Code\tbs-factions-2013\db\game\0\schema.sql`
- `C:\Users\rleyb\Code\tbs-factions-2013\src\test\java\tbs\srv\battle\BattleRankingTest.java`

bsf-server files to modify (per milestone):
- `C:\Users\rleyb\Code\BSF\bsf-server\src\services\battle\Battle.ts` (M1)
- `C:\Users\rleyb\Code\BSF\bsf-server\src\services\battle\ranking.ts` (M1, new)
- `C:\Users\rleyb\Code\BSF\bsf-server\src\db\connection.ts` (M1, add migration runner)
- `C:\Users\rleyb\Code\BSF\bsf-server\src\db\migrations\` (M1, new folder)
- `C:\Users\rleyb\Code\BSF\bsf-server\src\services\queue.ts` (M2)
- `C:\Users\rleyb\Code\BSF\bsf-server\src\services\lobby.ts` (M3)
- `C:\Users\rleyb\Code\BSF\bsf-server\src\services\roster.ts` (M4 stats reset)
- `C:\Users\rleyb\Code\BSF\bsf-server\CLAUDE.md` (M0)
- `C:\Users\rleyb\Code\BSF\REFERENCE.md` (M0, new at workspace root)
