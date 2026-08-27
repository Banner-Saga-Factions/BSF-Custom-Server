# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A custom server reimplementing the backend for **The Banner Saga Factions** (a defunct multiplayer turn-based strategy game). The game client is an Adobe AIR/Flash app that communicates with this Express server over HTTP long-polling. All client protocol details were reverse-engineered from Fiddler captures in `data/game_captures/`.

## Start-of-Session interview

At the **start of every new plan chat**, before doing other work, interview user in-deph using askuserquestion tool and focus on pulling out and clarifying any ambiguities.

## Working Style

**Explain every edit before making it.** When presenting a command to run or code change for approval, always include in plain English that a non-programmer could read and understand:
- **What it does** — what the line or block of code actually does in plain English
- **Why we need it** — the specific problem it solves or capability it enables
- **Any tradeoff or risk** — if the change has a downside worth knowing

The goal is that the user can learn from every change, not just approve it blindly.

**Present ALL planned edits before touching any file.** List every file change — each with What / Why / Tradeoff — in a single message. That message must contain **no Edit, Write, or file-modifying Bash calls** — only text. End the message with "Reply y to approve." Only after receiving explicit **y** may the next response contain tool calls that modify files. Each new batch of changes needs its own approval cycle, even if the user said "fix all" or "go ahead" earlier in the conversation.

The user responds **y** to approve and **n** to decline.

## Commands

```bash
yarn test           # Run all 50 automated tests (~3s, no DB needed)
yarn test:watch     # Re-run on file changes during development
yarn test:coverage  # Run tests + generate coverage report
yarn build          # Compile TypeScript → build/
yarn dev            # ts-node-dev hot-reload (dev only)
node build/index.js # Run compiled server (requires .env)
```

**start-server.bat** — builds, kills any running node process, then starts fresh. Always use this instead of `node build/index.js` directly — running the old build after code changes is the most common cause of "my change isn't working" during testing.  
**test-2p-match.bat** — headless 2-player API smoke test (login → queue → match creation).  
**launch-game-2p.ps1** — launches two game client windows in versus mode against localhost. The script bakes in `--versus_start --versus_countdown 0`; do **not** remove these — they are mandatory for 2-on-one-PC because FMOD's ANE only initializes for the first client (see `.claude/rules/gotchas.md`).

A pre-commit hook runs `yarn build && yarn test` automatically — commits are blocked if either fails.

## After Completing Changes

After finishing any bug fix, stream, or feature, follow this order — do not skip steps:
1. Prompt user to run `yarn test` and confirm all tests pass. Fix any regressions before continuing.
2. Prompt user to manually test the changes and wait for confirmation.
3. Only after the user confirms tests passed, ask: "Do you want me to update the documentation to reflect these changes?"
4. Only after docs are updated (or skipped), ask: "Do you want me to create a commit?"

Do not update docs or commit automatically. Always prompt first.

## Commit Messages

Write commit messages in plain English that a non-programmer could read and understand:
- The subject line should say **what changed and why**, not which files or functions were touched
- Avoid technical shorthand, function names, or file paths in the subject line
- Add a short body note with the technical detail (affected files, function names) for AI agents and future developers

Good:
```
Fix crash when exiting a battle after the opponent disconnects

Battle exit route was not guarded against a null opponent reference.
Affected: src/services/battle/battleRouter.ts
```

Bad: `feat: fix null ref in battleRouter.ts exit handler`

Use a conventional prefix (`fix:`, `chore:`, `docs:`) only when it genuinely adds clarity, but never at the expense of plain-English meaning.

## Changelog Entries

When adding to `CHANGELOG.md`, write each entry so a non-coder can understand it. For every fix or change, the prose body must cover:

- **What was wrong** — in plain English, with no function names, file paths, or library terms (don't say `crypto.randomBytes`, `startsWith`, `Promise.all`, etc., in the body)
- **Why it mattered** — the real-world impact: what could an attacker do, what could a player see, what was at risk
- **What the fix does** — described in the same plain-English register

End each entry with a single italicised `*Technical:*` line (or short paragraph) that names the actual files, functions, dependencies, or settings, so future developers and AI agents can still grep for them.

The goal is the same as for commit messages: a non-programmer reads the changelog and understands what changed; an engineer can still find the file in 15 seconds via `grep`. Trivial one-line fixes can collapse the prose to a single sentence plus the technical line. Security or behaviour-changing items typically need 3–6 sentences before the `*Technical:*` line.

## Code Review

After code changes or at the end of each stream, ask if the user wants to spawn code reviewer subagents over the code written in that session — an ordinary checker, and, whenever the work rests on factual claims, a second one briefed to disprove them:

```
Agent({ subagent_type: "general-purpose", description: "Code review", prompt: "Review the changes in <files> for correctness, security, and edge cases..." })
```

Look for: unhandled promise rejections, missing input validation, type mismatches, auth bypasses, edge cases in matchmaking/battle logic, and protocol compliance with the Fiddler captures in `data/game_captures/`.

**Offer the review *before* the pull request opens.** The instinct is to review after pushing, but by then any mistake is public and fixing it costs an extra commit plus a second review pass. Ask before the push.

**For documentation changes, put most of the review on the prose — but do not skip the table.** Mistakes land in proportion to how much was written, not to how it was formatted. In [`docs/client-contract.md`](docs/client-contract.md) the table is 11% of the words and has carried about 10% of the errors, and the fourth round of corrections — itself a correction — introduced twelve new mistakes. The table's *counts* have been exact every round, so re-deriving them is cheap and rarely finds anything. But **checking the counts is not checking the table**: R7's cell shipped missing a poll gap, R14's said "zero server calls" where the truth was "zero battle calls", and R13 and R20 both carried the wrong status. The failures live in sentences containing *because*, *therefore*, or *cannot happen*, wherever those sentences sit. **Never write a "because" clause you have not traced into the code**, and make every number name its unit — "25 classes" and "30 routes" described the same thing in that document, and mixing them understated the problem.

**Prefer deleting a wrong explanation to rewriting it.** Measured across three rounds, each correction round introduced about half as many errors as it fixed, and all of that came from replacing wrong sentences with new ones — roughly 11 new lines of prose per error fixed, at about 4 errors per 100 lines of prose. Deleting costs nothing. Where an explanation has been wrong more than once and no decision depends on it, cut it and keep the finding.

**Use more than one reviewer for factual claims, and treat disagreement between them as the finding.** In that review one agent reported a statement as wrong that another had proved right; only reading both caught it. A single reviewer is not a check.

A split that worked well: one agent verifying claims against source (told explicitly not to trust the document under review), one on cross-document consistency and whether cited evidence resolves, one on judgement and architecture.

**Also offer a reviewer briefed to *disprove*, not to check.** The passes above ask "does this sentence match the code?" — a question that finds support wherever support exists. None of them asks whether the *situation* the change is built on can happen at all, so a false premise survives them indefinitely. Measured on the 2026-08-18 lobby-`404` wave (PR #181): source-verify found 1 error, consistency found 19, and the adversarial pass found the one that mattered — that the whole "a server restart makes clients hammer `/lobby/join`" premise was false, in six places, after surviving four earlier review rounds. (Sessions live in the same in-memory object as lobbies, so a restart kills the session first and `app.ts`'s gate turns the request away before `LobbyRouter` is ever reached — `403` when that review ran, `401` today, because #192 split the two by whether the last path segment is shaped like a session key. See the gate rule below.)

Give it named claims, never "the diff":

```
Agent({ subagent_type: "general-purpose", description: "Adversarial review",
  prompt: "Your job is to DISPROVE, not to verify. For each claim below, try to build a case
  where it is false. Answer 'refuted' only when you have a concrete counter-case, and
  'unresolved' when you cannot settle it either way. Go after: negative
  claims ('nothing anywhere does X'), runtime predictions derived from reading static code,
  and any status or severity the author assigned to their own work. Claims: <list them>.
  Report each as refuted / survived / unresolved, with file:line evidence." })
```

**Verify the refuter's own findings before acting on them.** The same pass confidently claimed the client's friends list "is never sent", reasoning from an unused constant — while `data/first.json` shipped a hardcoded empty `FriendsData` entry at the time. Acting on it would have put a fresh error into the docs. It happened again on #91 (2026-08-27): the two reviewers split over whether a friend row with a non-positive id can be invited, and only reading `GuiFriendListEntry` settled it — the row is greyed but still clickable, and `online` alone blocks the invite. When two reviewers disagree, that disagreement *is* the finding: resolve it at the source yourself.

**Ask the third question: what did this teach us that is not a code change?** A review — or a planning pass — produces three kinds of finding, and only two of them have somewhere to go. Defects get fixed. Wrong statements get corrected. The third, **what the session worked out about work nobody has started**, has no diff to live in and no claim to correct, so it evaporates unless it is deliberately routed. Measured on the #149 community review (2026-08-26): every idea that left that session **with an issue** kept its design advice — the "use a visible rotation instead of a random pick" option sits in issue #200's body *and* in its kickoff prompt — and every idea that left **without** one lost it. The shape of a league, the reason per-tournament balancing is impossible, and the fact that anti-turtling shares a decision with #98 appeared nowhere in this repo until 2026-08-27, surviving only in a plan file outside it. **Parking an idea produces no artifact, and that is precisely when the reasoning is most expensive to rebuild.** So before closing a review, ask what it taught that is not a code change, and route each piece:

| What the finding is about | Where it goes |
|---|---|
| An item that already has an issue | A comment on that issue — plus its roadmap row if it changes order or readiness |
| An item we accepted but have not filed | **File the issue.** That is the vehicle that demonstrably works |
| An idea we are not building, or not building yet | [`docs/idea-triage.md`](docs/idea-triage.md) — the verdict **and** the evidence for it |
| A trap for anyone editing `src/` | [`.claude/rules/gotchas.md`](.claude/rules/gotchas.md) |
| A reusable concept or mental model | the docs suite — see *Documentation conventions* below |
| How we work | this file |

**Route it before the session ends, not after.** The plan files under `%USERPROFILE%\.claude\plans\` are outside the repo and git-ignored, so anything left in one is invisible to every future search — including this project's own.

## Documentation conventions

- **Durable concepts vs issue-specifics — cross-link, never duplicate.** Put reusable knowledge — a mental model, a parity/verification method, a recurring gotcha — in the durable docs suite (`docs/`), or `.claude/rules/gotchas.md` for short operational traps — **not** in an issue plan. Keep `misc/Plan-*.md` for issue-specific findings, decisions, and milestone/wave breakdowns, and have them *link* to the concept in `docs/`. Burying a reusable finding inside one issue's plan means the next session re-derives it — which is how the matchmaking-window math, the Elo parity rules, and the 32-bit account-id model each got re-explained more than once before they were written down.
- **Where durable knowledge lives:** system architecture + request/battle lifecycle → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); persistent-data shapes → [`docs/database-schema.md`](docs/database-schema.md) and [`docs/dataStructures.md`](docs/dataStructures.md); route map + endpoint transport → [`docs/serverEndpoints.md`](docs/serverEndpoints.md) and [`docs/gameFlow.md`](docs/gameFlow.md); the route-by-route Java-counterpart map → [`docs/protocol-cross-reference.md`](docs/protocol-cross-reference.md). Tracked missing docs are inventoried in [`docs/doc-gaps.md`](docs/doc-gaps.md) — fill the linked issue, don't expand the plan.
- **"Did Stoic do it, or did we?"** When a behavior, formula, or wire shape is reverse-engineered or ported, cross-check it against the read-only Java reference (`%USERPROFILE%\Code\bsf-refs\server-2013-java\`; see [`../REFERENCE.md`](../REFERENCE.md) and the route map above) and the captures in `data/game_captures/`. The reference is the source of truth when they conflict — record divergences (and *why* we diverge) in `docs/`, not only in a plan.
- **Where scratch and dead plans go — keep the tracked tree lean.** Private or throwaway working notes → `misc/local/`; superseded plans and old reviews → `misc/archive/`. Both folders are git-ignored, so their files stay on your disk but never get tracked, published to the public repo, shipped in the Docker build, or pulled into an AI session's search context. Only *live* plans stay tracked at the top of `misc/`. (Heavy binaries — `misc/*.docx`, `misc/*.bin`, `misc/discord-chatexport/` — are ignored separately in `.gitignore`.)

## Environment Setup

Copy `.env.example` to `.env` and fill in values:
```
DB_PATH=./data/bsf.db
JWT_SECRET=replace-with-a-strong-random-secret
```

No database initialization step needed — `src/db/connection.ts` creates `data/bsf.db` and runs `CREATE TABLE IF NOT EXISTS` automatically on server startup.

The server fails fast at startup if `JWT_SECRET` is missing or empty.

## Architecture

### Request Flow

All game client traffic hits `POST/GET /services/*`. A single middleware in `src/app.ts` extracts the session key from the **last URL path segment** and validates it against the in-memory sessions map before routing:

- `/services/auth/login/11` — the literal `"11"` is the sentinel that bypasses auth for login
- `/services/session/steam/overlay/<key>/<true|false>` — exact-shape allowlist, returns 200 (Steam overlay, no-op). Any other path under that prefix falls through to auth, which refuses it without a session.
- Everything else — must have a valid session key. Without one the gate answers **`401`** when the segment it read is shaped like a session key (32 hex characters) and **`403`** when it is not. `401` is the one code the game reads as *you are logged out*: it abandons the request and sends the game to fetch fresh credentials — straight back in with a Steam ticket, the login screen without one — so we only say it when a key was actually presented (#180). The unit-variation route puts a lobby id in that segment, which is why the shape test is there (#188).

Discord OAuth uses a one-shot CSRF state stored in the `bsf_oauth_state` HttpOnly cookie (5-min TTL), validated at `/login/discord/oauth-callback`.

After auth, `req.session` (and `req.battle`, `req.opponent` for battle routes) are attached before hitting route handlers.

### Session & Real-Time Data Delivery

`Session` (`src/services/auth/auth.ts`) extends `EventEmitter`. Real-time data delivery uses **long-polling**:

- `GET /services/game/:session_key` — holds the connection up to 5 seconds, listening for a `"data"` event
- `session.pushData(...items)` — appends to `session.data[]` and emits `"data"` to flush the waiting poll
- `session.pollingActive` — guards against concurrent polls stealing each other's data

On first poll, `getInitialData()` pre-fills the session buffer with queue state and static data from `data/first.json` (cached at module load — requires server restart to pick up file changes).

### Matchmaking & Battle Lifecycle

1. Client POSTs to `/services/vs/start/:session_key` with `vs_type` and `match_handle`. The route is async — it calls `getOrCreateRanking()` for `eloWindow` modes (RANKED, TOURNEY) so the queue entry carries the real pre-match Elo. QUICK entries snapshot `elo: 0`.
2. `matchmaking()` in `src/services/queue.ts` tries an immediate pair via `findBestMatch()` — same shared code path as the pump. Initial `threshold_power=0` and `threshold_elo=VS_WINDOW_ELO_MIN` (or `MAX_SAFE_INTEGER` for non-eloWindow modes), so on-entry matching effectively requires near-equal power.
3. Every five seconds a `setInterval` calls `processMatches()`, which for each queued entry: recomputes the entry's `power` from current `session.accountData` (closes the snapshot race — a player who promoted a unit while queued plays at their fresh power), tries `findBestMatch`, and on miss calls `bumpItemThresholds` to widen the entry's `threshold_power` (clamped by `VS_WINDOW_POWER_MAX`, the same uniform cap for every player) and `threshold_elo` linearly over wait-time. `equalPower` modes (RANKED, TOURNEY) leave `threshold_power` locked at 0; `!eloWindow` modes (QUICK) leave `threshold_elo` infinite.
4. `findBestMatch` is the canonical filter: skip self, skip mismatched `tourney_id`, reject pairs whose power gap exceeds *either* side's `threshold_power` or whose Elo gap exceeds *either* side's `threshold_elo` (`checkWindows`), then pick the lowest-magnitude `bestMatchScore` (composite of Elo + power gap, with a ±1 type-mismatch penalty).
5. On match: `tryCreateBattle` recomputes both sides' powers one more time, re-validates the windows, and calls `battleHandler.addBattle(parties, mode, perSide)` where `perSide` is a two-element `{ power, elo }[]` (earlier-queued entry at `party_index=0`). The `Battle` constructor pushes `BattleCreateData` to both sessions via `pushData` and removes both from the queue.
6. Power level = sum of `(RANK - 1)` across party units, computed from `session.accountData` via `calculateLevel(session)`.
7. Env-var knobs (all optional, defaults match `VsWorkerConfig`): `VS_WINDOW_POWER_TIME_SECS` (90 s ramp duration), `VS_BRACKET_ELO` (200 — the score-magnitude unit for Elo gaps), `VS_BRACKET_POWER` (4 — same for power gaps). `BSF_MATCHMAKER_LEGACY=true` reverts to the pre-M2 exact-power scan and makes the pump a no-op for instant rollback. The pump and the 60 s queue-timeout sweep both `.unref()` their interval handles so they never block process shutdown — tests call exported `stopMatchmakerPump()` in `beforeEach` to control timing under `vi.useFakeTimers()`.

### Battle State

`Battle` (`src/services/battle/Battle.ts`) tracks:
- `parties: Record<session_key, BattlePartyData>` — initial party including `defs[]` (all units)
- `aliveUnits: Record<string_account_id, string[]>` — unit IDs still alive per player, keyed by `String(session.account_id)`
- `winner: number | null` — the **server-derived** winner: when a confirmed kill empties a party's `aliveUnits`, this is set to the *other* party's 32-bit account_id (the side still standing). NOT read from the client's `killerparty` (#19).
- `killReports: Record<account_id, Record<entity_id, bitmask>>` — mutual kill-confirmation (#18). `applyKillReport()` ORs in one bit per reporting `party_index`; a unit leaves `aliveUnits` only when **both** clients have reported it (`bits === killMask`). Both game clients report every death, so honest play is unaffected, but a lone modified client can't fake the opponent's losses. `BSF_KILL_CONFIRM_SINGLE=true` reverts to single-report. Ported from `BattleMonitor.PartiesKills` / `numTeamsAlive`.
- `unitKillCounts: Record<account_id, Record<unit_id, number>>` + `killReportKillers: Record<account_id, Record<entity_id, killer_id>>` — per-unit kill tally for the persistent **KILLS** stat (#99), separate from the per-battle renown KILLS bonus. `applyKillReport()` bumps `unitKillCounts[killerparty][killer]` on a confirmed *opposing* kill, but **only when both clients name the same `killer`** (first report's killer stored in `killReportKillers`) — so a lone modified client can't funnel its kills onto one unit. At endgame each side's tally is applied to its own `roster_json` via `saveRoster` (winner *and* loser). The agreement check gates only the tally, never the death/winner logic. `BSF_KILL_CONFIRM_SINGLE=true` trusts the single report's killer.
- `endgameStarted: boolean` — a one-way flag that flips to `true` the moment a battle finalizes. Acts as a guard: if two "last-unit-killed" messages arrive at nearly the same time, only the first one runs the endgame logic; the second one sees the flag set and skips. Same flag protects against `/killed` and `/exit` (surrender) racing each other.
- `startedAt: Date` — for DB persistence

BattleRouter middleware attaches `req.battle` and `req.opponent` for every `/battle/*` route. `/battle/exit` is the only route allowed when the opponent has already disconnected.

### Endgame (Stream 3)

`endgame()` is called from `/battle/killed` (and `/battle/exit` / `/battle/surrender`) once `battle.endgameStarted` flips to `true`. It:
1. Computes kills from `aliveUnits` deltas — `winnerKills = loserParty.defs.length`, `loserKills = winnerParty.defs.length - aliveUnits[winnerId].length`
2. Loads both sides' `ranking` rows via `getOrCreateRanking()` and computes new Elos with `calculateNewElo()`. If either ranking row fails to load, logs and skips the Elo update for both sides; the battle still records (renown, kills, history row), the players still see their "you won / you lost" message, but the stored Elo stays at its real value
3. Computes renown via `computeRenownAwards()` (`src/services/battle/renownAwards.ts`) — five additive bonuses ported from the original Stoic server: **WIN** (5), **KILLS** (1 per enemy unit killed), **UNDERDOG** (up to 4, scaling 1-per-1 with the power gap), **EXPERT** (2 for a sub-30s win), **STREAK** (1 for a win on a pre-battle 2+ streak with party power ≥ 6). DAILY, BOOST, FRIEND are deferred until their supporting infrastructure lands (daily-login counter, unlocks table, friend-battle-record table). KILLS for the winner is suppressed when the loser surrendered. STREAK reads the **pre-update** `win_streak` from the ranking row already loaded for Elo (no extra DB round trip). `BSF_RENOWN_LEGACY_FORMULA=true` flips the calculator back to the flat `20 + kills × 3` formula for instant rollback
4. Sends each player their achievement-progress message right away (these are placeholder zero-deltas for now and don't depend on the database)
5. Writes renown, **both sides' ranking rows (Elo + win/loss + streak)**, the full `battle` row, **and each side's updated `roster_json` when its units scored kills (per-unit KILLS bumps, #99)** to SQLite in one `Promise.all`. **The "you won / you lost" message and the renown total are only sent after those database writes finish** — so a player can never see "you earned 23 renown" while the DB actually saved nothing. Adds ~5–50 ms latency for the round trip, which is fine because endgame fires once per battle
6. If a database write fails, the player still gets a "battle finished" message — but with `total_renown: 0` and a chat message asking them to report it. This stops the battle screen from freezing while making it clear that no renown was actually awarded

`BattleFinishedData` does NOT carry the new Elo — the client sees only renown. The original server never put post-battle Elo on the results screen either (it pushed rating to Steam leaderboards), so #84 surfaces the new rating through the **leaderboards page** instead — `/game/leaderboards` is built live from the DB `ranking` table (see *Static Data Files* below). An optional post-battle chat line showing the rating is deferred to #137.

**Rule — `BattleFinishedData.rewards[]` is indexed by `party_index`, NOT winner-first.** The game client (`engine/battle/fsm/state/BattleStateFinished.as:32`) reads each player's own reward bundle via `finishedData.getReward(localBattleOrder).total_renown`, where `localBattleOrder` is the local player's party index. Filling `rewards[0]` with the winner's bundle regardless of party index makes a loser at `party_index=0` see the *winner's* bonus icons. Always assign by index, never by winner/loser ordering.

### Lobby

`src/services/lobby.ts` ports the 8 endpoints from `tbs/srv/web/svc/lobby/LobbySvc.java` (`invite`, `uninvite`, `exit`, `join`, `decline`, `options`, `ready`, `unready`). Lobby state is in-memory only — a `Map<lobby_id, Lobby>` at module scope. The milestone (M3b) accepts this because lobbies are pre-match coordination rooms that don't need to outlive a server restart; the original Java backed them with three MySQL tables but the wire protocol is identical.

**All eight routes are reachable from inside the game as of 2026-08-27 (#91).** For fifteen months they were not: the only way to invite is to pick a name from the friends list, and the server had never sent one, so the "Challenge a Friend" screen was always blank. It now sends the list of everyone signed in (`src/services/friends.ts`), and the invite flow has been walked end to end by two players. **The one thing that still does not work is the battle at the end of it** — readying up posts `/services/vs/start` with `vs_type: "FRIEND"`, which `GameModes` does not contain, so it is refused `400`; `forcematch` and `scene` are read nowhere (#205).

Key invariants ported from `LobbySystem.java`:
- **`lobby_id` equals the owner's 32-bit `account_id`.** The client picks the inviter's own `account_id` as the lobby id (`doJoin(config, data.lobby_id, data.lobby_id)`); we keep the convention.
- **1 invitee per lobby.** Java enforces this with a `getInvites().size() > 0` check; the comment says "only 1 invite per room right now" — i.e., 2v2 is a future TODO. We keep the cap so 2v2 stays a separate, deliberate change.
- **`uninvite` does NOT push to the kicked invitee.** Java pushes after the removal (`removeInvite()` then `sendRabbit()`), so by the time the fan-out runs the invitee is already gone from `lobby_invite` and only the owner sees the event. We match this verbatim — it's a quirk, not a bug worth fixing in M3b.
- **No auto-battle on ready.** The lobby is purely a coordination room; once both members are ready, the client triggers `/vs/start` separately. `queue.ts` and `Battle.ts` are unchanged by M3b.

Four deliberate divergences from Java for safety (don't "fix" these by porting the Java behavior; tests assert each one):
- **`/join` returns `409`** when the lobby is gone and **`403`** when the caller was not invited. Java silently UPDATEd `account_info.lobby_id` to a junk value and pushed to no-one. **Both numbers matter — they are not cosmetic:** `404` is the one refusal the game client retries forever (no attempt cap), all 8 lobby routes opt into retrying, and only a session-expiry or maintenance reply can abandon one — so answering `404` left any client that sent a join against a room that had already gone asking for the life of the process. The trigger is the owner leaving or their session being reaped, **not** a server restart (a restart clears the sessions too, so the gate in `app.ts` answers `401` before `LobbyRouter` is reached). Don't "fix" this back to Java's behaviour, and don't collapse either code to `404`. See [`docs/client-contract.md`](docs/client-contract.md) → R23.
- **`/invite` returns 403** when the body's `lobby_id` is not the caller's own `account_id`. Java accepted any `lobby_id` from the body, which lets a hostile client create a phantom lobby in someone else's namespace (the 1-invitee cap only fires once an invitee already exists, not at lobby creation).
- **`/invite` returns 400** when the caller invites themselves. Java would overwrite the owner's `members` entry with the invitee shape (`joined: false, ready: false`), creating a self-DoS where the owner can no longer ready up.
- **`/options` returns 403** when the caller is not the lobby owner. Java accepted `/options` from any session, which lets a hostile client rewrite `display_name`/`scene`/`timer`/`msg` in someone else's lobby.

**Wire format:** the AS3 client sends every lobby request with `Content-Type: text/plain` (because `HttpRequest.as:67-69` stamps that on any String body, and every `LobbyTxn` passes a String — either `arg.toString()` or `JSON.stringify(options)`). `lobby.ts` therefore wires `LobbyRouter.use(express.text({ type: "text/plain" }))` and a small `readBody(req)` helper that `JSON.parse`s the raw string in handlers. Do NOT remove either piece — global `express.json()` will leave `req.body` undefined for these requests and every route will 400.

Push events carry a `class` field (`tbs.srv.data.LobbyData` / `LobbyOptionsData` / `LobbyPartyData`) that the client's long-poll dispatcher reads to choose the right handler — same pattern as `BattleCreateData` and friends. The three constants live in `src/const.ts` as `ServerClasses.LOBBY_*`.

Session lifecycle: `exitAllLobbies(account_id, display_name)` is called from `reapStaleSessions` (`auth.ts`) and from `/auth/logout`. It TERMINATES any lobby the user owns (pushes `TERMINATED` to everyone, deletes the lobby) and EXITs any lobby the user was invited to. Without this hook, a ghost owner whose session expired would leave the invitee's UI showing them forever.

### Database Layer

`src/db/connection.ts` — `node:sqlite` (`DatabaseSync`), WAL mode, inline schema auto-init on startup (creates the `accounts` table), then calls `runMigrations(db)`. `query<T>()`, `queryOne<T>()`, and `queryUpdate()` helpers.  
`src/db/migrations.ts` — idempotent migration runner. Walks `src/db/migrations/NNN_*.sql` in numeric order and applies any whose version isn't yet recorded in `schema_version`. Each migration runs in a transaction; failure rolls back and aborts startup. SQL files are copied to `build/db/migrations/` by `scripts/copy-migrations.js` during `yarn build`.  
`src/db/account.ts` — `upsertAccount()` (INSERT … ON CONFLICT(user_id) DO UPDATE SET login_count), `addRenown()`, `saveParty()`, `saveRoster()`.  
`src/db/ranking.ts` — `getOrCreateRanking(account_id, tourney_id)` (INSERT OR IGNORE + SELECT, falls back to default row), `applyBattleRankingUpdate({ account_id, tourney_id, new_elo, won })` (single-statement UPDATE; streak rules mirror the original Java `BattleRanking.incrementWins`/`incrementLosses`).  
`src/db/battles.ts` — `saveBattle(BattleRow)` writes to the `battle` table (per-side Elo, renown, kills, surrender flag, parties snapshot). The legacy `saveBattleResult()` writer for the thin `battles` table was removed (#43, no callers since M1); the legacy `battles` table was dropped in migration `003` (#145).  
`src/services/battle/ranking.ts` — pure Elo math (`calculateNewElo`, `getEloKFactor`, `ELO_BEGIN=1000`, `ELO_MIN=100`, K interpolates 32→16 between Elo 2100 and 2400). Ported from `tbs.srv.battle.BattleRanking` — `Math.trunc` (not `Math.floor`) matches Java's `(int)` cast. 18 parity assertions in `ranking.test.ts`.  
`src/db/schema.sql` — SQLite DDL for the `accounts` table (documentation only — schema auto-initializes from `connection.ts`). The `ranking`, `battle`, and `schema_version` tables — and the migration-003 drop of the legacy `battles` table — live under `src/db/migrations/`.

`session.accountData` (`AccountRow | null`) is populated after login and cached in memory for the session lifetime. It is the source of truth for party/roster during a session — DB writes are synced via `saveParty()`/`saveRoster()` but in-memory is updated immediately.

### Static Data Files

| File | Purpose |
|------|---------|
| `data/acc.json` | Default roster/party for new accounts; `purchasable_units` served from `/account/info` |
| `data/first.json` | Pushed to every client on first poll (currency) — cached at startup. The friends list is **not** here: it is built per player from who is signed in and sent once login finishes (#91) |
| `data/lboard.json` | Historical leaderboard baseline (original 2013 names) merged with live DB standings by `/game/leaderboards`; also the fallback if the DB build fails |
| `data/accounts.json` | Username lookup fallback for unknown `user_id`s |
| `data/build-number` | Returned in the login response as `build_number` |

### Reference server

The canonical 2013 wire protocol, Elo math, matchmaking math, and lobby / IAP / tourney state machines live at `%USERPROFILE%\Code\bsf-refs\server-2013-java\` — the original Stoic Java server, read-only reference, **not a runtime**. See [`../REFERENCE.md`](../REFERENCE.md) for the pinned SHA and the top-7 highest-value paths.

Quick anchors when working in this repo (all under `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\`):

- **Wire formats** — `tbs/srv/battle/data/` (battle messages) and `tbs/srv/db/models/` (~55 `*Data.java` files). Authoritative when a Fiddler capture is ambiguous. Example: `tbs/srv/battle/data/BattlePartyData.java`.
- **Elo math** — `tbs/srv/battle/BattleRanking.java`. Port target for milestone M1.
- **Renown awards** — `tbs/srv/battle/BattleMonitor.constructBattleFinishedData()` plus `tbs/srv/battle/RenownSystem.java` (UNDERDOG / STREAK / BOOST / EXPERT / DAILY / KILLS award types). Port target for M1.5.
- **Matchmaking math** — `tbs/srv/worker/VsWorker.java` (NOT `VsSystem.java`, which is a 66-line RabbitMQ wrapper). Constants: `VS_WINDOW_POWER_TIME_SECS=90`, `VS_BRACKET_ELO=200`, `VS_BRACKET_POWER=4`. Port target for M2.
- **Lobby** — `tbs/srv/web/svc/lobby/LobbySvc.java` (8 sub-endpoints: `invite`, `uninvite`, `exit`, `join`, `decline`, `options`, `ready`, `unready`) plus its backing state in `tbs/srv/util/LobbySystem.java`. Port target for M3b (Blocker #9).
- **Schema** — `db/game/0/schema.sql` plus numbered `apply.sql` migrations under `db/game/N/`. Reference column set when adding SQLite tables; not for direct port (MySQL → SQLite syntax differences).

For a one-screen route-by-route map of each `bsf-server` route to its Java `*Svc.java` counterpart and milestone status, see [`docs/protocol-cross-reference.md`](docs/protocol-cross-reference.md). Live roadmap: [`misc/Plan-Master-Roadmap.md`](misc/Plan-Master-Roadmap.md); the Stoic-parity milestone history is archived; see [`misc/Plan-Integrate-Original-Stoic-Server.md`](misc/Plan-Integrate-Original-Stoic-Server.md).

**Working rule:** when adding a route or changing a wire shape, cross-check against the Java reference and the captures in `data/game_captures/`. The reference is the source of truth when they conflict.

**Do NOT port** vBulletin auth (`AuthDataVbb`, `auth_vbb`), RabbitMQ-coupled workers / `MsgSystem`, MySQL `DbHelper` pooling, EhCache, NewRelic, or the Heroku Procfile. The original's `VsSystem`/`WorkerMain` patterns are RabbitMQ wrappers — port `VsWorker` math instead. Do not vendor or submodule `bsf-refs\server-2013-java\` into this repo; it stays as a sibling under `%USERPROFILE%\Code\bsf-refs\`.