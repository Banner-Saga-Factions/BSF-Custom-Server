# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [in progress]
  trying to figure out how to [add new units like dredge](misc/findings_unit_extensibility.md).
  Phase 2b stat fix shipped 2026-05-10. Next step is patching the SWF Proving Grounds screen so it doesn't hang when a hired unit (like any dredge) has no portrait.
  to resume work, open new claude code chat and say something like "let's tackle the Proving Grounds portrait hang for Phase 2b dredge units"

 claude will resume using:
  - misc/findings_unit_extensibility.md has the Phase 2b section with everything learned (see "Proving Grounds portrait hang" subsection and step 2 of "Pending work")

## [Unreleased]

### Two Discord players can no longer log each other out

Every player gets a small in-game "player number" derived from their much longer login ID. Different Discord accounts can end up with the same player number, because only the tail end of the long Discord ID is used to build it. The server treated a matching player number as "this same person logged in again" and closed the older login — so two unrelated players who happened to share a number could knock each other offline, over and over, without either understanding why. The check that screens Discord IDs also accepted the nonsense ID "0".

The "close your older login" check now compares the full original login ID, which is truly unique per account, so only a genuine re-login by the same person closes the old session. IDs that aren't positive numbers are now refused at both Discord login doors. And the player-number math itself — previously copy-pasted in three files that had to be kept identical by hand — now lives in a single shared file, with tests proving it gives exactly the same answers as before (the math is deliberately left byte-identical: every saved ranking row and the game client's battle bookkeeping depend on its exact rounding).

What this deliberately does not fix (#140 stays open): two accounts sharing a player number still share the deeper things keyed on it — the same saved-stats row and the same identity inside a battle. The real fix is the server assigning its own player numbers, planned as part of the cross-play design.

*Technical:* new `src/services/auth/accountId.ts` (`STEAM_ID_BASE`, `accountIdFromUserId`, `accountIdFromSnowflake`, `isValidSnowflake` — rejects `"0"`/non-positive); `auth.ts` `addSession(user_id, external_id_str)` now dedupes/evicts on `external_id_str` and owns setting it; `discord.ts` uses the shared helpers at both the OAuth callback and `POST /session`; `src/db/leaderboard.ts` imports the shared `accountIdFromUserId`. Tests: `accountId.test.ts` (parity with the old inline math), `auth.test.ts` (eviction by exact id; no eviction on derived-id collision), `discord.test.ts` (`"0"` rejected; colliding Snowflakes co-exist). Closes #146; mitigates #140 (residual documented there).

### Discord players with normal account IDs can log in again

Every Discord account has a unique ID number, and modern ones are larger than the biggest whole number the server's math could hold exactly. The server was shrinking those IDs to fit, which quietly rounded them off — so two different players whose IDs differed only in the rounded-away part could land on the **same** account, letting one end up with another's roster and renown. A later stopgap went the other way and simply refused any login whose ID was too big; because nearly every real Discord ID is that big, that left Discord login broken for essentially everyone.

The server now keeps each Discord ID exactly as Discord sends it, all the way through to the database, so large IDs work and every account stays distinct. The in-game player number is derived separately as a small value the game client can use.

*Technical:* `src/services/auth/discord.ts` — removed the `parseInt` precision-reject in both the OAuth callback and `POST /session`; the exact id string now flows to `upsertAccount`/`getAccountByUserId` (the `accounts.user_id` TEXT primary key), and `/session` derives the 32-bit `account_id` losslessly via `BigInt(id) & 0x3fffffff`. Renamed `Session.steam_id_str` → `Session.external_id_str` (the exact provider-id string every in-session DB write keys off) across `auth.ts`, `roster.ts`, `account.ts`, `app.ts`, `Battle.ts` and the tests that read it. Tests: `src/services/auth/discord.test.ts` (exact-string round-trip; two IDs that collide under `parseInt` → two distinct accounts). Closes #25; generalizes into `external_id_str` the `steam_id_str` field whose imprecise init #34 already fixed in Wave 0 (PR #127).

### Leaderboards now show real players and your own ranking

The in-game leaderboards page used to serve a fixed list of names from the original 2013 game, with everyone's personal "your rank" line stuck on a placeholder — so no one ever saw where they actually stood. The leaderboards are now built live from the server's own database: real players are merged into the original historical names (sorted by score), and each player sees their true value and rank on every board (Elo, wins, win/loss, total battles, win streak, best win streak). The original names are kept as a baseline, so the board still looks populated while new players climb in as they win.

This delivers the "show me my rating" goal of #84 without touching the game client. The original server never displayed the post-battle Elo on the results screen — it only pushed rating to Steam's leaderboards — so a more immediate post-battle rating message was split out to #137 for later.

*Technical:* new `src/db/leaderboard.ts` — `buildLeaderboards()` merges the `ranking` table with the `data/lboard.json` baseline, resolves display names from `accounts` via a Number-based `account_id` derivation matching `auth.ts`, and computes per-board `user_value`/`user_rank`. `src/services/game.ts` `/leaderboards` now parses `{tourney_id, board_ids}` and serves the live build, falling back to the static file only on a DB error. Metric-per-board mapping ported from `tbs.srv.data.LeaderboardData.java`. Tests: `src/db/leaderboard.test.ts`, `test/routes/game.test.ts`. Closes #84; see #137.

### Tidied up the end-of-battle code and freed memory after each match

Two small internal cleanups to the end-of-battle handling, with no change to what players see:

- The server kept a full move-by-move log of every battle in memory and never let go of it once the match ended. On a busy server, finished battles could pile up and waste memory. That log is now cleared the moment a battle finishes — nothing reads it afterwards (the saved battle record keeps only a turn count, not the full log).
- An old, unused function that wrote to a now-retired battle-results table was deleted. The current code already saves results to a richer table, so the leftover function was just dead weight.

We also added automated tests that lock in an existing safety rule: a player's renown total in memory is only updated *after* the database actually saves it, so a failed save can never leave a player showing renown they didn't really earn. A short code comment now explains that the handful of end-of-battle saves aren't one all-or-nothing transaction, and why that's a safe, self-correcting trade-off.

*Technical:* `src/services/battle/Battle.ts` — `endgame()` now sets `battle.turns = []` at the end of both the `Promise.all(writes).then()` and the `.catch()`; added a comment documenting the non-transactional `writes[]` residual. `src/db/battles.ts` — removed the unused `saveBattleResult()` (no callers since M1; `saveBattle()` into the `battle` table is the live path). The legacy `battles` table's `CREATE` in `connection.ts` stays, pending a later drop migration. New tests: `src/services/battle/Battle.endgame.test.ts` (renown applied once on success; untouched + zero-renown fallback on a write failure; `turns` cleared on both paths). Closes #43, #41.

### Dismissing a unit no longer hands back free renown

Dismissing (retiring) a unit used to refund renown based on the unit's class. But each class has several shop versions at different prices, and the refund always picked the first one — so buying the cheapest version of a class and immediately dismissing it paid back a pricier version's cost, netting free renown on every cycle. A player using direct API calls or a modified client could repeat this to mint renown without limit and distort the whole economy.

Dismissing now refunds only the renown you spent promoting a unit (ranking it up), never its original hire cost — which also matches the original 2013 game, where dismissing refunded nothing. As a paired change, the two archer shop prices that make the exploit visible were restored to their original values (so hiring those costs renown again).

*Technical:* `data/acc.json` (archer cost 0→10, archer_exp 0→25); `src/services/roster.ts` — `computeRetireRefund(rank)` drops the hire-cost term, `/unit/retire` no longer looks up the purchasable template, `/unit/hire` no longer stamps a `purchasable_unit_id` on the unit (that field broke client `/account/info` parsing). Tests in `test/routes/roster.test.ts`. Closes #95.


### Units now earn promotion credit for the kills they make

Previously, a unit's lifetime kill count never went up, no matter how many enemies it defeated in battle. That number is what the game uses to decide when a unit is ready to be promoted, so in practice freshly hired units could never advance past their starting rank — the promote button stayed greyed out forever.

The server now tallies each unit's kills as a battle plays out and saves the new totals to that unit's record when the battle ends — for the losing side as well as the winner, since a unit that scores a kill before its team falls still earns the credit. The original 2013 game did the same.

Because kill credit feeds promotion, it's a cheating target, so it's guarded the same way the rest of the end-of-battle reporting now is: a kill only counts toward a unit's total when **both** players' clients name the same unit as the one that landed it. A lone modified client therefore can't funnel all of its kills onto a single unit to rush it toward promotion. (Two players both running modified clients could still collude — the server can't tell without replaying the whole battle itself — but that's the same limit that already applies to confirming deaths.)

*Technical:* `src/services/battle/Battle.ts` — new `Battle.unitKillCounts` (`killerparty account_id → killer unit id → kills`) bumped in `applyKillReport()` only on a confirmed, opposing kill whose `killer` matches the first reporter's (tracked in new `Battle.killReportKillers`); new pure helper `applyKillsToRoster()` clones each side's roster and raises the matching unit's `KILLS` stat; `endgame()` queues `saveRoster(steam_id_str, …)` for both sides into the existing `Promise.all` and updates `accountData.roster_json` in the `.then()` after the write resolves. Distinct from the per-battle renown KILLS bonus in `renownAwards.ts`. `BSF_KILL_CONFIRM_SINGLE=true` trusts the single report's killer. Tests: `Battle.test.ts`, `test/routes/battle.test.ts`; docs: `.claude/rules/gotchas.md`. Closes #99.

### Hardened the end-of-battle "who killed whom" reporting against cheating

Until now the server trusted a single player's word for what happened at the end of a battle. When a player's client said "this unit died" or "I won," the server believed it outright — so a modified client could pick off the opponent's units one by one and hand itself the victory, or simply name itself the winner.

The fix makes the server require **both** players to independently report the same kill before it counts — the safeguard the original 2013 game used. Because both game clients run the same battle and each reports every death, honest play is unaffected; but a lone cheating client can no longer fabricate the opponent's losses. The server now also decides the winner itself, from whichever side still has units standing, instead of taking the winner's name from the message. A separate crash was fixed where finishing a battle whose player records had already been cleaned up (for example, an opponent quitting at the exact wrong moment) would crash the finish instead of bowing out cleanly.

If the new confirmation logic ever misbehaves, a single server setting restores the old one-report behavior instantly, so a fix can ship without redeploying code.

*Technical:* `src/services/battle/Battle.ts` — new `Battle.killReports` (per-entity bitmask keyed by `killedparty`) + `applyKillReport()` require every `party_index` to report an entity before it leaves `aliveUnits` (mutual confirmation, #18); the `/killed` route no longer reads `req.body.killerparty` — `battle.winner` is derived as the non-emptied party (#19); `endgame()`'s `winnerParty`/`loserParty` lookups are null-guarded and bail with a log instead of dereferencing `undefined.defs` (#52). `endgame` is now exported for testing; `BSF_KILL_CONFIRM_SINGLE=true` reverts to single-report. Ported from `tbs/srv/battle/BattleMonitor.java` (`PartiesKills`, `numTeamsAlive`/`victoriousTeam`). Tests: `Battle.test.ts`, `Battle.killed.route.test.ts`, `test/helpers.ts` (`confirmKill`), `test/routes/battle.test.ts`. Closes #18, #19, #52.

### Closed a leak of the opponent's session token at the end of every battle

When a battle ended, the server sent each player a set of achievement-progress messages that included **both** players' private session tokens — so each player received the other player's token. A session token is the key that authenticates a player for the rest of their session, so a modified or curious client could have read the opponent's token out of the end-of-battle data and impersonated them. The end-of-battle messages now send a blank token instead; the game client never reads this field, so nothing changes for honest players. This closes the same kind of leak that a recent fix removed from the battle-*start* message (#126/#32) — it was still present on the battle-*finish* path.

*Technical:* `src/services/battle/Battle.ts` — in `endgame()`, the `AchievementProgressData` objects now set `session_key: ""` instead of `session.session_key` before being pushed to both players.

### Removed the unused "weak units" debug mode

A developer-only testing switch called "weak units" — meant to make every unit very fragile so a test battle would end in a hit or two — has been removed entirely. It turned out to do nothing visible: the game client works out combat from its own copy of each unit's stats and ignores the numbers the server sends, so weakening the server-side values never actually reached the battlefield. The switch had no real use and had already caused one incident when it was accidentally left switched on in the live server, so the safest thing was to delete it.

To get fast battles for testing, cap each side to a single unit instead — fewer units on the board is a change the client *does* respect. The existing `launch-game-2p-quickbattle.ps1` already does this through the party-size limit.

*Technical:* removed `_debugWeakUnits`, `setDebugWeakUnits()`, `isDebugWeakUnits()`, and the stat-stripping block in `src/services/battle/Battle.ts`; removed the `POST /debug/weak-units` route in `src/app.ts` (the now single-use `registerBoolToggle` helper went with it — `/debug/fast-timer` is a direct handler again); the production-gate test in `test/routes/debug.test.ts` now probes `/debug/fast-timer`. Use `POST /debug/party-limit` (e.g. `{"limit":1}`) for fast battles. Docs updated: `docs/Development.md`, `docs/ARCHITECTURE.md`, `docs/serverEndpoints.md`, `.claude/commands/debug-battle.md`.

### Battles no longer start with every unit weakened

A debug switch meant for local testing — one that strips almost all strength and armor from every unit — had been left turned on in the shipped server, so every match on the live server was being fought with severely weakened units.

Why it mattered: it wasn't a balance change anyone chose; it was a testing aid that escaped into production, so real matches played nothing like the game intends.

The fix turns that switch back off by default. A second fix corrects the developer-only toggle for it, which was backwards — asking to turn weak-units mode "on" actually turned it off, and vice-versa.

*Technical:* `bsf-server/src/services/battle/Battle.ts` — `_debugWeakUnits` default flipped `true`→`false`. `bsf-server/src/app.ts` — `/debug/weak-units` now reads `req.body.enabled === true` (was `=== false`, inverted), matching the correct `/debug/fast-timer` route.

### Internal cleanups: safer types and a leaner matchmaking lookup

A round of small internal-quality fixes with no change to how the game plays:

- Two battle-related data shapes (the "results couldn't be saved" notice and a turn-message field) were tightened so the compiler now catches any future change that would make them malformed, rather than letting a bad message slip out to the client.
- A newly logged-in player is no longer briefly tagged with a slightly-wrong copy of their Steam ID in the moment before the exact one is filled in.
- Working out a player's power for matchmaking now reuses the player record already in hand instead of scanning the whole list of logged-in players to find it.

These remove latent foot-guns and a small inefficiency without altering behavior.

*Technical:* `BattleTurnData.ts` `ReliableMsg.reliable_msg_target` `String`→`string` (#36); `chat.ts` exports `ChatMessage`, consumed via `import type` in `Battle.ts` to type the endgame failure fallback (#51); `auth.ts` `Session` constructor initialises `steam_id_str` to `""` instead of `String(user_id)` (#34); `queue.ts` `calculateLevel(session)` drops the `sessionHandler.getSession("user_id", …)` O(n) scan, updating 4 call sites (#35). New regression test in `test/routes/queue.test.ts` for double-queue rejection with a large Steam ID (#23). Closes #34, #35, #36, #51; strengthens #23 coverage.

### Players no longer receive their opponent's login token mid-match

When a match started, the server sent each player a bundle describing both parties — and that bundle included the *other* player's private session token (the secret that authenticates every request they make). A modified client could read the opponent's token off the wire and act as them for the life of that session. The original Banner Saga Factions server had the same leak.

Why it mattered: a session token is the only thing standing between a player and someone acting as them — queueing, surrendering, spending their renown. Handing it to the one person with an incentive to misuse it (their current opponent) is a real account-safety hole.

The fix blanks that field before the bundle goes out. The game never reads it, so matches start and play exactly as before; the token simply isn't there to steal. We keep the now-empty field so the message still matches the shape the game expects.

*Technical:* `bsf-server/src/services/battle/Battle.ts` — the `BattleCreateData` push in the `Battle` constructor maps `parties` through `{ ...p, session_key: "" }`. `BattlePartyData.session_key` is retained for wire-shape parity with capture `data/game_captures/extracted/raw/0058_s.txt` (asserted keys-only by `matchmaker0058.test.ts`). Stored `battle.parties` values keep the real key (it's the map key); `endgame()` still strips it from `parties_json`. Closes #32.

### Secret environment files can no longer be baked into Docker images

The Docker build copies the whole project into the image. We already excluded the main secrets file (`.env`) but not its variants — a file like `.env.production` holding the real database password would have been embedded into the published image, where anyone who pulled it could extract it.

Why it mattered: secrets in an image layer persist even if the file is later deleted, and layers are easy to inspect. One stray `.env.production` during a build would leak production credentials.

The fix adds those variants to the Docker ignore list so no environment file is ever copied into the build.

*Technical:* `bsf-server/.dockerignore` — added `.env.*` alongside the existing `.env`. Closes #27.

### A disconnected player can no longer slowly eat server memory

Each connected player has a small outbox of messages waiting to be delivered (chat, queue updates, battle events). If a player's game vanished without a clean goodbye — a crash, a yanked cable — the server kept piling messages into that outbox forever, because ongoing broadcasts kept it looking "recently active" and the normal idle-cleanup never kicked in.

Why it mattered: on a small (1 GB) instance, slow unbounded growth like this is exactly what degrades or crashes the process over hours with no obvious culprit.

The fix puts a ceiling on that outbox — 200 messages — dropping the oldest past it. An actively-playing client empties its outbox every few seconds and never gets close, so only a stuck or vanished connection is affected, and the live "new data" signal still fires normally.

*Technical:* `bsf-server/src/services/auth/auth.ts` — `Session.pushData()` trims `this.data` to the new `MAX_SESSION_BUFFER` (200), oldest-first. Regression test in `src/services/auth/auth.test.ts`. Closes #39.

### Lowering a unit's stats in the barracks no longer wipes the whole change

When a player adjusted a unit's stats in the barracks and *lowered* one of them — willpower or armor break, for example — to move those points into another stat, the change silently failed. The server rejected any stat that was being reduced, and because it checks the entire batch of changes together before saving any of them, one rejected stat threw away the player's whole edit. The unit kept its old stats, so in the next battle every unit looked like it had reset to its defaults. This is what issue #118 reported.

Why it mattered: reallocating points — taking some out of one stat to boost another — is a normal part of building a unit, and the in-game panel lets you do it by right-clicking to subtract. Players doing exactly that saw none of their work stick, with no error shown in the game.

The fix lets the server accept stat reductions, matching how the original Banner Saga Factions server behaved: it now checks where each stat *ends up* rather than refusing to let a stat go down at all. As a safety net it still caps how big a single change can be and never lets a stat drop below zero.

*Technical:* `bsf-server/src/services/roster.ts` `/unit/stats/purchase` handler — replaced the `deltas[i] < 0` rejection with a symmetric magnitude bound (`-20 <= delta <= 20`) plus a resulting-value floor (`cur.value + delta >= 0`). Mirrors `UnitStatsSvc.java:88-118`, which validates `value + delta` against the per-stat `StatRange` and never checks the delta sign. Tests in `test/routes/roster.test.ts` (negative single delta, mixed raise+lower batch, below-zero floor); gotcha updated in `.claude/rules/gotchas.md`. Closes #118.
### Kill messages now carry the original, collision-proof tracking id

When a unit died in battle, the server stamped the "this unit was killed" message with a tracking id that left out one detail: which player reported the kill. The original Banner Saga Factions server always included the reporting player's id in that stamp; ours did not.

Why it mattered: the game client uses that tracking id to recognise and discard duplicate copies of the same message — the network layer can resend a message until it's acknowledged. With the "who reported it" field missing, two genuinely different kill reports could end up with the exact same id, so the client could mistake a real kill for a duplicate and quietly drop it, or get confused on a resend. To a player that could look like a kill that never registers or a kill that plays twice.

The fix puts the reporting player's id back into the tracking stamp, in the same position the original server used, so the id once again matches the game's captured network traffic exactly.

*Technical:* `bsf-server/src/services/battle/Battle.ts` (~line 448) — the `/battle/killed` handler's `reliable_msg_id` postfix changes from `_killed_${killedparty}_${entity}` to `_killed_${data.session.account_id}_${killedparty}_${entity}`, matching `constructReliableMsgId()` in the original `BattleKilledData.java:17` and the captures `data/game_captures/extracted/raw/0411_s.txt` / `0431_s.txt`. New route-level regression test `src/services/battle/Battle.killed.route.test.ts` pins the format. Closes issue #20.

### Production matches no longer end on a hidden 15-second timer

Players on the live server had been getting one-third the turn time the game is built around. Every match — Quick, Ranked, all of them — was running on a 15-second-per-turn timer instead of the normal 30 seconds for the first player and 45 seconds for the second. When the timer ran out, the server treated it as the player giving up and ended the match early. That made post-battle screens look wrong: the renown payout was the surrender payout, not the won-match payout, and any units that hadn't acted yet appeared "lost" because they never got a chance to fight.

Why it mattered: this is the most likely root cause behind a stream of recent complaints about matches ending without warning and renown awards looking too small. Nothing about the player's account, party, or actions caused it — the timer was simply too short to play a normal turn, and most players hit it on every match.

The fix tells the server: only use the 15-second debug timer when you're running on a developer's machine. On the live server, the timer goes back to the real 30 / 45 seconds the game was designed around. A new debug route — `POST /debug/fast-timer` — also lets a developer flip the fast timer back on locally without restarting the server, matching the existing `/debug/party-limit` and `/debug/weak-units` routes. The route is blocked in production by the same gate that hides the other debug routes.

Documentation: the four `/debug/*` routes (`party-limit`, `weak-units`, `fast-timer`, `renown`) now have a dedicated **Debug Routes** section in `bsf-server/docs/Development.md` with what each one does, when to reach for it, and a full PowerShell `Invoke-RestMethod` example for each.

*Technical:* `bsf-server/src/services/battle/Battle.ts:22` flips `_debugFastTimer`'s default from a hardcoded `true` to `process.env.NODE_ENV !== "production"`, mirroring the existing `NODE_ENV` gate at `app.ts:44` that already hides the other debug routes. The flag is consumed at `Battle.ts:179` when building `BattleCreateData.timer`. `bsf-server/src/app.ts` adds `setDebugFastTimer` to the import on line 5 and registers a `POST /debug/fast-timer` handler inside the existing `if (process.env.NODE_ENV !== "production")` block, mirroring the shape of `/debug/weak-units`. The setter `setDebugFastTimer()` at `Battle.ts:25` was already exported but unused. Closes issue #120.
### Prevent new database modules from crashing the server on upgrade

When the team added a new database file to the server, every existing install had to be repaired manually. The new file existed inside the upgrade, but the storage area that holds the database also held a snapshot of the old compiled code — and Docker, by design, only populates that storage area from a fresh build when it's first created. After that, the old snapshot shadows whatever the new build contains, so the new database file is invisible at runtime and the server crashes on startup with "Cannot find module".

Why it mattered: any time a new player-facing feature added a new database file (rankings, lobbies, anything), the live server would silently break the moment the operator pulled the new code and rebuilt. The recovery was a backup-restore dance — back up the database, delete the storage area, let Docker rebuild it from the new code, then put the database back in. Easy to get wrong, and even when done correctly it required several minutes of avoidable downtime.

The fix is to put the database in its own dedicated directory inside the container — a directory the compiled code never writes to — so the database's storage area no longer overlaps anything that comes from the build. From now on, adding a new database file to the source just works: pull the new code, rebuild, restart, the new module is picked up cleanly. The live database file itself isn't moving; only the path Docker mounts the storage area at changes. Docker's named-volume design means the same database file appears at the new path with no data copy or restore.

*Technical:* `bsf-server/docker-compose.yml` changes the `app` service's `DB_PATH` env override from `/app/db/bsf.db` to `/data/bsf.db` and the `db-data` volume mount from `:/app/db` to `:/data`. The Dockerfile copies static game data into `/app/data` (line 14 — `acc.json`, `first.json`, etc.), which is why `/data` is used rather than `/app/data`: mounting an empty volume at `/app/data` would shadow those files and break the server's first-poll response and new-account defaults. `bsf-server/docs/Deployment.md` updates all path references throughout (Status table line 14, Step 5 prose at line 141, Ongoing Operations table at lines 256-257) and replaces Pitfall §9's "pending root fix" with a "resolved" marker. Closes issue #105. Migration on the live VM is zero-data-move: the same `bsf-server_db-data` Docker volume bytes appear at the new mount path with no copy or restore step required — the only operator-visible effect is the brief downtime during the `docker compose up -d --build` rebuild. Stale `.js` files (`account.js`, `connection.js`, `migrations/`, etc.) from the legacy `/app/db` mount remain inside the volume after redeploy at `/data/` but are harmless — nothing reads from `/data/*.js`. Optional cleanup: `docker compose exec app sh -c "rm -f /data/*.js && rm -rf /data/migrations"`.

### Prevent a deploy folder rename from silently wiping all player data

After the recent reorganization that moved the server into a new subdirectory, every player who logged in saw their units gone and their renown back to zero. The server otherwise looked completely healthy — it was running, accepting logins, and creating new accounts on the fly — but it was reading from a brand-new empty database file instead of the real one.

The cause was a quirk in how Docker decides where to store the database. Docker keeps each project's data in a named storage area, and the name is derived from the folder the project lives in. Moving the project into a new folder changed that name. On the next deploy, Docker looked for the storage area under the new name, didn't find it, silently created a fresh empty one, and started the server against it. The real player data — units, renown, battle history — was untouched in the old storage area, just abandoned, no longer mounted by any container.

All nine affected accounts were recovered by merging the abandoned database back into the new one. Players who weren't reset by this never noticed anything went wrong; the players who *were* reset are back to where they were before the upgrade, give or take roughly one renown in total across all accounts (any tiny amount of progress that happened during the brief window between the reset and the recovery).

The fix is a one-line change to the deploy configuration that pins the storage-area name to a fixed value. From now on, moving or renaming the project's folder cannot change that name, so the data can never be stranded the same way again. The deploy guide also gained a new section walking the next operator through detecting and recovering from this situation if some other unforeseen change ever causes a similar split.

*Technical:* `bsf-server/docker-compose.yml` pins the `db-data` volume to `name: bsf-server_db-data` so Compose no longer derives it from the project (folder) name. The previous fragile behaviour was `db-data` → `<compose-folder>_db-data`, which silently changed from `bsf-custom-server_db-data` to `bsf-server_db-data` when the repo was reorganized into `bsf-server/`. `bsf-server/docs/Deployment.md` gains Pitfall §10 with the symptom, root cause, detection commands (`docker volume ls` + `docker inspect ... ps -q app`), per-volume read-only count probe (mounts each volume `:ro` and runs `sqlite3` from a throwaway `alpine` container, copying the `bsf.db-wal` sidecar so WAL-resident data is counted), and a six-phase recovery runbook that backs up both volumes as tarballs to `~/bsf-backups`, merges the orphan into the live `accounts`/`battles` tables via `ATTACH ... INSERT OR REPLACE`/`INSERT OR IGNORE`, fixes ownership of the swapped DB to `1002:1003`, and deletes the stale `bsf.db-wal`/`bsf.db-shm` sidecars before restart (without that last step SQLite would replay the live volume's pre-merge WAL on top of the merged file and silently undo the restore). Procedure replicated from 2026-06-06 incident response.

### Fixed
- **Database**: Restored missing `src/db/ranking.ts` source module. The file was orphaned in a local Git stash during a previous rebase, causing `MODULE_NOT_FOUND` errors at runtime.

### Hiring a unit no longer fails after you dismiss another of the same class

Some players hit an "unable to hire" error in the barracks that wouldn't go away — once it started, every attempt to hire that class of unit was rejected. It turned out to be triggered by dismissing a unit: if you owned, say, three axemen and dismissed one that wasn't the most recently hired, the very next axeman you tried to hire would be refused.

Why it mattered: the barracks became partly unusable for the affected class with no obvious cause or way out. The error looked like a server outage or a broken account, but the account was perfectly fine — the player just couldn't fill the slot they'd freed up.

The cause was in how the server names a newly hired unit. Each unit gets an internal id like `axeman_start_0`, `axeman_start_1`, and so on. The server picked the number for a new unit by *counting* how many of that class you already owned — which works only as long as the numbering has no gaps. The moment you dismissed a unit from the middle (or start) of that sequence, the count no longer lined up: it pointed back at a number still in use by a surviving unit, so the server saw a duplicate and refused the hire. The fix is to give each new unit the lowest number that isn't already taken, which simply reuses the gap the dismissed unit left behind and can never collide. No account data needed repair — affected players can hire again as soon as the updated server is running.

*Technical:* `src/services/roster.ts` `/unit/hire` handler. Replaced `finalId = prefix + existing.length` (count-based slot index) with a scan for the lowest unused `<class>_start_<n>` index over the roster's existing-id set. The `existingIds` set is now built once and reused; the post-assignment dup-guard remains as a defensive backstop (now unreachable on the server-generated path, still rejects a client that supplies its own colliding explicit `_start_` id — covered by the existing test at `test/routes/roster.test.ts:493`). Two regression tests added to the hire suite: a direct gap-fill case mirroring the broken account (`axeman_start_1` + `axeman_start_2` present, hire creates `axeman_start_0`) and a full retire→hire flow that dismisses `axeman_start_0` from a `{0,1,2}` sequence and re-hires into the gap.

### faster matching
- **Queue/Matchmaking**: Reduced `VS_WINDOW_POWER_TIME_SECS` from `90` to `20`.
  - Accelerates Quick Match window expansion for faster matching, leveraging the existing symmetric global cap (`VS_WINDOW_POWER_MAX=4`).

### Unit hire costs set to 0
The cost to hire units from the barracks has been reduced to 0 renown. This adjustment is reflected in the retirement refund calculation; as the base hire cost is now 0, the total refund amount when retiring a unit will now consist primarily of the renown spent on rank-ups.

### Dismissing a unit now returns the renown you spent on it

Until now, the "dismiss" button in the barracks was a one-way trapdoor. If you hired a class you later regretted, or wanted to clear out a slot you'd already poured rank-up renown into, you lost every drop of renown you'd spent on that unit — there was no refund at all. A freshly hired archer cost 10 renown to dismiss into the void. A fully promoted rank-3 unit cost 110.

Why it mattered: the rank-up costs aren't trivial — 20 renown to go from rank 1 to 2, another 80 to go from 2 to 3 — so any player who'd invested in a unit had to choose between living with that unit forever or burning all the renown they'd poured into it. Most players just stopped using the dismiss button, which left their barracks cluttered with units they didn't want and couldn't replace.

The fix refunds the renown you originally spent: the hire price, plus 20 if the unit was rank 2, plus another 80 if it was rank 3. A fresh archer refunds 10; a rank-3 archer refunds 110. The refund hits your account as soon as the dismiss succeeds. If a unit's class is no longer in the purchasable catalog (for example because a future content update renamed or removed it), the dismiss still goes through and you still get back the rank-up portion, but the hire portion is treated as zero — the server refuses to refund renown it can't verify was paid. A warning is logged in that case so operators see it.

This deliberately diverges from the original 2013 Stoic server, which never refunded anything on dismiss. The original behaviour made the button practically unusable and there is no design reason to preserve it.

Known limitation: when a unit class has multiple purchasable variants at different prices (some catalog entries do — for example the basic, experienced, and veteran tiers of `archer`), the refund uses the first variant's price rather than the one the player actually paid. The proper fix is to record the purchase identity on the roster unit at hire time and look that up on retire, tracked as issue #95. Today this is not reachable from the live game UI (which only exposes the basic-tier variants), but a modified client could exploit it to mint renown. Worth knowing if anyone scripts the API directly.

Refund now also appears on screen immediately. The first version of this fix updated the player's renown in the database but did nothing to tell the running client about it — so the on-screen renown counter only refreshed after the player closed the Proving Grounds building and re-opened it, which is when the client next asks the server for fresh account data. The dismiss-button itself looked broken for a few seconds even when the refund had already landed. The fix is for the server to push the new renown total back to the client over the long-poll channel the game already uses for live updates (the same channel that delivers post-battle "you earned N renown" messages). The counter now ticks up the instant the dismiss completes.

*Technical:* `src/services/roster.ts` `/unit/retire` handler at lines 110-149 rewritten — now looks up the unit's template by `entityClass` (same pattern as `/unit/stats/reset` at `roster.ts:266`), reads `template.cost`, and adds 20 for `RANK >= 2` and 80 for `RANK >= 3` via the new pure helper `computeRetireRefund(hireCost, rank)`. Always routes through the new atomic helper `saveRosterAndAddRenown(user_id, roster_defs, delta, party_ids?)` in `src/db/account.ts` (signed-delta counterpart to `saveRosterAndSpendRenown`, optional `party_ids` for the party-change combo) — one statement updates roster, party (when changed), and renown together. Missing template falls back to `hireCost = 0` and logs a console warning (diverges from `/unit/stats/reset`, which 404s on missing template; reset *needs* `template.def.stats` to do its work, retire doesn't, and blocking the dismiss would soft-brick a paid roster slot). Missing RANK stat falls back to `rank = 1` for the same reason. After the DB write succeeds and `acc.renown` is bumped, the handler calls `session.pushData(...)` with a `tbs.srv.util.RenownMsg` (`ServerClasses.RENOWN_MESSAGE` in `src/const.ts`) carrying the new **absolute** total — the AS3 client at `bsf-refs/client-2013-as3/.../GameFsm.as:346` does `config.accountInfo.legend.renown = rm.total` (assignment, not addition), so a delta would set the on-screen renown to just the refund amount. Same message shape as `Battle.ts:744-755` endgame push. Tests in `test/routes/roster.test.ts` retire suite grow from 4 → 7: 2 rewritten (assert refund delta and which helper was called), 1 edited (`saveRosterAndAddRenown` is the new failure-mock target, renown asserted unchanged on DB error, push asserted not called on failure), 3 new (rank-3 refund of 110, missing template with rank-up only at 20, missing template with rank 1 and no refund). All five success cases also `vi.spyOn(session, "pushData")` and assert the pushed `RenownMsg` carries the right absolute total. Mock setup gains the new helper. Does not touch `/unit/stats/purchase` or `/unit/stats/reset` — stat-purchase cost is still client-side per the comment at `roster.ts:182-183`, and refunding it would mint free renown. Does NOT add `RenownMsg` pushes to `/unit/hire`, `/unit/promote`, `/unit/rename`, `/roster/unlock` either — those routes already result in correct on-screen renown because the AS3 transactions decrement `account.renown` locally using known costs; adding pushes there is a separate cleanup. Possible pre-existing inconsistency observed but not fixed here: the endgame push at `Battle.ts:751` sends `total: <delta>` (the per-battle award) rather than the absolute new total, which would conflict with the client's assignment semantics — but the post-battle flow is established and working, so any divergence is out of scope for this fix.

### Battle turn order now follows the order you arranged your party in

When you went to the Party screen and rearranged your units — moving a frontline tank to the first slot, or putting a ranged unit at the back — the order you chose was being thrown away when the match actually started. Whoever happened to sit in the top-left of your barracks went first instead, regardless of the arrangement you set. This was the bug behind issue #71: players reported "turnorder is still not the chosen one" after re-arranging their lineup.

Why it mattered: the unit who goes first in a turn-based fight is usually the most consequential pick — they can secure the opening kill, lock down a tile, or absorb the opponent's opening shot. Losing that choice meant every match started with the "wrong" unit acting first, and players had no way to influence it from the screen the game gave them for exactly that purpose.

The fix walks the party in the order you arranged it and looks up each unit by id, instead of walking the barracks roster and filtering. This matches the original 2013 Stoic server's behaviour. The same fix also applies to the friend-invite preview (so an invitee sees your party in the order you intended) and to the matchmaking power calculation (the sum is order-independent, but all three sites now share one helper so a future reader doesn't have to compare them to verify they agree).

*Technical:* fixes issue #71. New helper `buildOrderedPartyDefs(roster, party_ids)` in `src/services/account.ts` (after `PURCHASABLE_UNITS`). Replaces the `roster_json.filter(u => party_ids_json.includes(u.id))` pattern at `Battle.ts:139-143` (the bug site — `BattleTurnParty.as:24-33` walks `defs[]` index-by-index to build `members`, which is the turn-order vector), `lobby.ts:91-97` (`buildPartyDefs`, feeds `LobbyPartyData.party`), and `queue.ts:203-207` (order-independent for the rank sum, swapped for consistency). Mirrors Java `UserData.getPartyDefs()` at `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\db\models\UserData.java:229-244`, with one documented divergence: unknown ids are skipped silently instead of throwing `IllegalArgumentException` (defensive — a stale party id should never happen because `/unit/retire` cleans `party_ids`, but if it does, a smaller party is preferable to a 500 mid-match-start). Duplicates also de-duped — preserves the implicit dedupe behaviour of the old `roster.filter()` pattern. Tests: 3 new ordering cases in `src/services/battle/Battle.test.ts` (`fakeSession` extended with optional `partyIds` arg, defaults to `rosterIds` for backward compat); 1 new ordering case in `test/routes/lobby.test.ts` (lobby invite mock changed from `mockResolvedValue` → `mockImplementation` so each `upsertAccount` returns a fresh object — prevents mutation leakage to later tests).

### Stat upgrades no longer vanish after a big batched purchase

When you spent renown to add multiple stat points to a unit at once — say six points of STRENGTH in a single confirm — the upgrade looked like it took effect, but then disappeared the next time the unit screen refreshed. Issue #71 reported "if you change the stats of your units, this is also not remembered as soon as you line up."

Why it mattered: the in-game stat panel is designed for batched edits. You click `+` several times to spend renown across multiple stats, then hit Confirm to commit the whole bundle. The server was silently rejecting any single-stat increase greater than 5, so any reasonable saved-up purchase would be discarded. The client updated its local view of the unit before sending the request, so for a few seconds the new stats were visible — then the next time the client asked the server for fresh account data (which happens on a lot of screen transitions), the upgrade vanished and the player lost both the visible stats *and* the renown they thought they spent. The original 2013 Stoic server had no such cap; it only checked that the resulting stat value stayed inside the unit's allowed range.

The fix raises the per-stat per-confirm cap from 5 to 20 — well above any legitimate purchase a player can make — and also tolerates "zero-delta" stats that appear in the batch but ended up unchanged (e.g. you clicked `+` and then `-` on the same stat before hitting Confirm). The real per-stat ceiling is enforced by the client against the unit's stat range data, which lives only in the AS3 client today; porting that data to the server is tracked as future work, and the new cap of 20 is a defensive backstop in the meantime.

*Technical:* fixes issue #71. `src/services/roster.ts:206-219` validator split into three focused checks (typeof/integer; `< 0` or `> 20`; unknown stat), each with its own 400 response. Previous combined check `deltas[i] <= 0 || deltas[i] > 5` rejected legitimate batched purchases from `GuiCharacterStats.purchaseStats:405-421` (AS3 client), which computes `delta = tempStats.getValue(stat) - currentCharacter.stats.getValue(stat)` after the player accumulates `+` clicks. Mutate loop at `roster.ts:225-228` now skips `delta === 0` — the AS3 `changedStats` set adds any stat the player interacted with, so a "+1 then -1" yields delta=0 for that stat and the old code would 400 the whole batch. Mirrors Java `UnitStatsSvc.purchase_stats` at `%USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\web\svc\roster\unit\stats\UnitStatsSvc.java:88-118`, which has no per-delta cap (only `StatRange.validate(value + delta)`). TODO comment in code points to "port StatRange tables" so the cap becomes per-stat instead of a flat 20. Tests: `test/routes/roster.test.ts` mock roster gains ARMOR on `unit1`; 2 existing tests modified (delta=0 → 200 no-op, delta>5 → delta>20 retains 400); 5 new tests (delta=6 regression, delta=20 upper bound, delta=-1 still 400, mixed zero+non-zero batch, validate-all-before-mutate with one over-cap).

### Squad invites now actually reach the other player

Until now, every "invite a friend to a private match" message the client sent simply vanished into a generic 200-OK stub on the server. The invited player never received the invitation, the inviter never saw a join, ready, or exit notification, and nothing the lobby screen tried to do had any backing state. The original 2013 Stoic server had a complete eight-message protocol behind these screens — invite, uninvite, join, decline, exit, options, ready, unready — and that protocol has now been ported over from the original Java.

Why it mattered: with no lobby protocol, two players who wanted to play a specific match together had no way to coordinate. Their only path to a battle was to both queue for a random match at the same time and hope the matchmaker happened to pair them together. The result was that the squad / invite-friend half of the game was effectively unreachable, even though the UI for it has always been present in the client.

The fix replaces the catch-all stub with eight real handlers backed by an in-memory lobby store. Sending an invite now creates a lobby (owned by the inviter), adds the invitee, and pushes the invitation to both players. Joining flips the invitee's state and shares their party. Ready and unready toggle a per-player flag and notify the other side. Exit gracefully removes the leaver — and if the owner exits, the whole lobby is terminated and everyone is notified at once. Crucially, when a player's session times out or they log out cleanly, any lobby they owned is now terminated automatically, so the other player isn't left staring at a ghost lobby they can't get out of. Around twenty new automated tests cover every endpoint and lifecycle path.

One important caveat for testing: the friends list on the server is still hardcoded empty, so the in-game "Invite a Friend" button isn't reachable from the client UI yet — the underlying protocol is complete and tested, but a separate follow-up is needed to populate the friends list before a player can drive these endpoints from inside the game. Tracked as a separate issue.

*Technical:* delivers M3b of `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`. Replaces the catch-all stub at the old `src/services/lobby.ts:11-12` with eight explicit POST routes (`invite`, `uninvite`, `exit`, `join`, `decline`, `options`, `ready`, `unready`) backed by an in-memory `lobbies: Map<lobby_id, Lobby>` at module scope. Ported from `tbs/srv/web/svc/lobby/LobbySvc.java` and `tbs/srv/util/LobbySystem.java`. `lobby_id` is the owner's 32-bit `account_id` per the Java convention (`doJoin(config, data.lobby_id, data.lobby_id)`); the 1-invitee-per-lobby cap from `LobbySystem.java:40-43` is preserved (2v2 was a Java TODO, not implemented). New entries in `src/const.ts`: `ServerClasses.LOBBY_DATA`, `LOBBY_OPTIONS_DATA`, `LOBBY_PARTY_DATA`, matching the existing `BattleCreateData` dispatch pattern. Wire format: AS3 `HttpRequest.as:67-69` stamps `Content-Type: text/plain` on any String body, and all eight `LobbyTxn` variants pass a String to `super()` (six via `arg.toString()`, two via `JSON.stringify(options)`) — so `LobbyRouter.use(express.text({ type: "text/plain" }))` is wired at the router level, and a small `readBody(req)` helper `JSON.parse`s the raw string in handlers, falling back to the raw string for non-JSON content (which integer routes then reject as NaN). Global `express.json()` is untouched. Session lifecycle: `exitAllLobbies(account_id, display_name)` exported from `lobby.ts` and called from both `reapStaleSessions` (`src/services/auth/auth.ts`) and `AuthRouter.post("/logout/...")` — TERMINATEs any lobby the user owned and EXITs any lobby they were an invitee in. Faithful Java quirk preserved: `uninvite` does not push to the kicked invitee (the Java `sendRabbit` runs after `removeInvite`, so the kicked id is absent from `getInvites` at fan-out time); code comment plus a test assertion document this so it isn't "fixed" by accident. Deliberate divergences from Java (all documented in code comments and asserted in tests): `/join` to a non-existent lobby or by a non-invitee returns 404 instead of the Java's silent UPDATE-to-nowhere; `/invite` rejects with 403 when the body's `lobby_id` is not the caller's own `account_id` (blocks "claim victim's account_id as my lobby_id" attacks from hostile clients — the Java accepted any `lobby_id` from the body and the 1-invitee cap only fires once an invitee already exists, not at lobby creation); `/invite` rejects with 400 on self-invite (Java would overwrite the owner's member entry with the invitee shape, creating a self-DoS where the owner can no longer ready up); `/options` rejects with 403 when the caller is not the lobby owner (blocks metadata-rewrite attacks on someone else's lobby — the Java accepted `/options` from any session). New: `test/routes/lobby.test.ts` (full rewrite) with 20 cases covering every endpoint, the production text/plain wire format on an object body, all four security/safety guards, the reaper integration (forces `aSession.lastActivity` past `SESSION_TTL_MS` and calls `reapStaleSessions(Date.now())`), and the logout integration. New "Lobby" subsection in `bsf-server/CLAUDE.md` documents the invariants and the reaper hook. Out of scope: lobby chat rooms (Java auto-creates `"lobby_<id>"` rooms — separate follow-up), `notifyVariation` / VARIATION event, lobby-to-battle auto-transition (the client calls `/vs/start` separately after dual-ready, so `queue.ts` and `Battle.ts` are unchanged), and friends-list bootstrap (`data/first.json` still ships `friends: []` hardcoded — tracked as issue #91).

=======
### Contributors now have a documented git workflow plus CI that catches what the local hooks can't

Until now the repo had no written rules for branching, stacking PRs, force-pushing, or cleaning up after a merge — and twice in May the missing rules cost us afternoons of cleanup (PRs #85 and #87 hit fake conflicts; PR #83 found four stale documentation citations from a directory move four days earlier). There was also no automated safety net: the only thing keeping a broken commit off `main` was a local pre-commit hook anyone could bypass.

The fix has four pieces. CONTRIBUTING.md § 5 is rewritten in plain English with eleven subsections — defining each git term (rebase, stash, force push, closing keywords) the first time it appears, so a non-coder can read it cover-to-cover. A new pull-request template pre-fills every PR's description with a Summary / Test plan / Dependencies / Related issues checklist. A new automated build-and-test routine runs the same checks the local pre-commit hook runs, but on GitHub's servers where the bypass doesn't reach. A second automated check catches stale documentation citations: for every file a PR moves or deletes, it searches the rest of the repo for any lingering reference and blocks the PR if it finds one. Both checks become selectable as required in **Settings → Branches → "Require status checks to pass"** after their first run.

The remaining setup steps — switching the merge button to merge-commit-only, enabling auto-delete of merged branches, and the per-contributor `git config --global` defenses — are documented in `%USERPROFILE%\.claude\plans\how-do-i-prevent-indexed-rose.md` for the repo owner to apply once.

*Technical:* New `.github/workflows/ci.yml` (Node 24 on ubuntu-latest, `yarn install --frozen-lockfile` + `yarn build` + `yarn test:ci`, triggers on `pull_request` and `push: branches: [main]`, working dir `bsf-server/`). New `.github/workflows/path-rot.yml` (greps `git diff --name-status origin/<base>...HEAD` for `[DR]` rows, `git grep` per path, excludes `**/CHANGELOG.md`). New `.github/pull_request_template.md`. Modified `bsf-server/CONTRIBUTING.md` § 5: 5 subsections → 11; +280/−18 lines.

### Matchmaking now widens its tolerance the longer you wait, and uses your *current* party strength when it pairs you

Until now, the matchmaker was extremely strict and never relaxed. Two players queuing for a quick match only got paired if their party strength was *exactly* the same number — a power-5 player and a power-6 player would sit in the queue forever, never matched. There was also no notion of skill rating in matchmaking; the server didn't look at how strong each player's rating was. Worse, the strength number the matchmaker used was a snapshot taken the instant a player joined the queue — if the player then opened the barracks and promoted a unit while waiting, they'd queue at power 6 and play their match at power 12 against an opponent the server still thought was their equal.

Why it mattered: the strict exact-match rule made matchmaking feel broken on a small player base — most queue attempts would never resolve. The stale-snapshot bug was actively unfair: a player could deliberately under-equip their party, queue up, promote/hire units while the match was being found, and then steamroll a much weaker opponent. The original 2013 Stoic server had a much more forgiving model, with a bracket-style tolerance that widens linearly over the first 90 seconds of waiting, plus a real skill-rating window for ranked play.

The fix ports the original server's full matchmaking model. Every five seconds the server now revisits every player still in the queue. Each player has their own tolerance for how far apart power and rating can be — that tolerance starts at zero and grows linearly with their wait time, capped after 90 seconds. When two players' tolerances both admit a pairing, the server picks the closest match by a composite score (rating gap + power gap) and creates the battle. The strength number is *recomputed* from the player's current barracks state at the moment the match is created — so the stale-snapshot bug is gone. Quick matches use only the power window; ranked matches additionally require near-equal Elo. Three tuning knobs are exposed as environment variables — `VS_WINDOW_POWER_TIME_SECS` (default 90), `VS_BRACKET_ELO` (default 200), `VS_BRACKET_POWER` (default 4) — so a future operator can tighten or loosen the bracket without a code change. A single `BSF_MATCHMAKER_LEGACY=true` switch flips everything back to the old exact-match scan for instant rollback, mirroring the same pattern the renown rollout uses.

Each player's actual rating and party strength also now flow through to the post-battle data the client receives — previously every ranked battle stamped the rating as the literal placeholder "1000" on both sides, regardless of what either player's real rating was. The post-battle screen still doesn't *display* the new rating to the player; surfacing that is a separate follow-up milestone.

A manual two-player match confirmed the new flow end-to-end: two players in quick mode at different power levels were correctly paired after their wait windows widened, and the resulting battle, renown, and Elo updates all landed as expected.

*Technical:* delivers M2 of `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`, ported from `tbs.srv.worker.VsWorker.java` (5-second pump at `processMatches`/`VS_CHECK_MS=5000`, linear-ramp `bumpThreshold` at lines 226–240, per-player dynamic power cap at lines 246–254, best-match composite at `VsBestMatchComparator.compare` lines 743–761, and the window check at lines 851–865). Modified `src/services/queue.ts` adds pure helpers `bumpThreshold`, `computeDynamicPowerMax`, `checkWindows`, `bestMatchScore` (all use `Math.trunc` to match Java integer-division truncation toward zero, same rule as M1 `ranking.ts`); extends `QueueItem` with `elo`, `threshold_power`, `threshold_elo`, `threshold_power_max`, `tourney_id` (kept at 0 for forward-compat with a future tournament feature); adds `MODE_CONFIG` mapping each `GameModes` value to its `equalPower` / `eloWindow` flags from `tbs.srv.util.VsType`; adds `processMatches(now)`, `findBestMatch`, `tryCreateBattle` (which is where the recompute lives — both sides' `power` are re-read from `accountData` via the existing `calculateLevel(user_id)` helper before `addBattle` is called); and adds `startMatchmakerPump` / `stopMatchmakerPump` lifecycle exports with `.unref()` so the interval doesn't block process shutdown. `legacyMatchmaking` preserves the pre-M2 exact-power scan verbatim and is gated by `isLegacyMode()` reading `process.env.BSF_MATCHMAKER_LEGACY` at call time (matches the `BSF_RENOWN_LEGACY_FORMULA` pattern in `renownAwards.ts:42`). The existing 60-second queue-timeout sweep got the same `.unref()` treatment as a bundled one-line fix. `/services/vs/start` is now async — it calls `getOrCreateRanking(account_id, tourney_id)` for `eloWindow` modes so the Elo snapshot enters the queue with the real value; on DB failure it falls back to `ELO_BEGIN=1000`. `src/services/battle/Battle.ts` widens both `addBattle` and the `Battle` constructor to take `perSide: PerSideMatchData[]` (`{ power, elo }[]`) instead of a single shared `power: number`; `createBattlePartyData` now reads each side's `power` and `elo` from `this.perSide[idx]`, replacing the hardcoded `elo: type === "QUICK" ? 0 : 1000` at the old line 153. `Battle.power` is kept as `Math.max(perSide[0].power, perSide[1].power)` for log/debug parity — `renownAwards.ts` already reads both sides' power independently from the `BattlePartyData` objects, so the shared field doesn't influence award math. Test files updated to the new signature: `src/services/queue.test.ts` (`queueItem` helper now populates the new fields, plus 6 new behavior cases — bracket widening, RANKED equal-power, stale-session sweep, power-recompute regression, LEGACY exact-match, LEGACY pump no-op), `src/services/battle/Battle.test.ts` (5 constructor calls), `src/services/auth/auth.test.ts` (3 `battleHandler.addBattle` calls). New files: `src/services/matchmaker.test.ts` (table-driven parity tests for the four pure helpers — `bumpThreshold` linear ramp + clamp + `-1` infinite path, `computeDynamicPowerMax` truncation-toward-zero at boundary values, `checkWindows` accept/reject including the `VS_QUICK_ELO_DIFF=50` fallback, `bestMatchScore` including the `±1` type-mismatch penalty), `src/services/matchmakerTick.test.ts` (`vi.useFakeTimers()` lifecycle tests — `startMatchmakerPump` schedules at 5000 ms, double-start is a no-op, `stopMatchmakerPump` clears the handle, the scheduled callback drives `processMatches` and evicts stale entries / pairs matched entries on tick), `src/services/matchmaker0058.test.ts` (Fiddler shape parity against `data/game_captures/extracted/raw/0058_s.txt` — keyset on `BattleCreateData` and `BattlePartyData` matches the captured QUICK match, and the per-side `power`/`elo` from the `perSide` array now reaches each `BattlePartyData` verbatim). 233 tests passing total. The matchmaker's `dTimer` term from `VsBestMatchComparator` is intentionally dropped from the port: `bsf-server` has no per-player turn-timer preference in the queue (the `BattlePartyData.timer` field is set from `party_index` in `Battle.ts:158`, not from a user setting), and the term contributed 0 in the Java when timers matched.

### Players can now earn the original game's full set of post-battle bonuses

Until now, finishing a match always paid the same flat formula — twenty renown for winning plus three for every enemy unit killed — no matter how the match actually played out. The post-battle screen had six icon rows ready to light up (Kills, Win, Underdog, Expert, Daily, Win Streak), but only two of them ever showed a real number; the other four sat at zero for every battle because the server simply never sent them. The original 2013 Stoic server had real math behind every one of those icons, and that math has now been ported over from the original Java.

Why it mattered: the empty bonus icons made every match feel the same, with no in-game recognition for the things that actually take more skill — beating a stronger party, finishing the match quickly, putting together a winning streak. There was nothing the player could play *for* beyond the flat per-kill payout. The flat formula also paid noticeably more than the original game's economy was tuned around, which made every later feature that touches renown (the shop, leaderboards, ranks) harder to balance.

Five of the six original bonuses now compute real numbers. **Win** pays a flat five (down from twenty). **Kills** pays one per enemy unit killed (down from three). **Underdog** pays up to four for beating a stronger party — though no battles will earn it under today's matchmaking, because the server only ever pairs players of identical strength; it'll start firing the moment cross-bracket matchmaking lands in a future milestone. **Expert** pays two for a win that wraps up in thirty seconds or less. **Win Streak** pays one whenever the winning player is on a streak of two or more *and* their party is strong enough to count as a ranked match. The three remaining bonus types — Daily, Boost (a premium-store unlock), and Friend (first-of-the-day match against a specific friend) — stay dark for now because the systems they hang off of (a daily login counter, an in-game unlocks table, and the friends list) don't exist on this server yet; they'll come online when those systems do. A plain three-kill win that used to pay 29 renown now pays 8, matching the original game's intended balance.

A single environment variable, `BSF_RENOWN_LEGACY_FORMULA=true`, flips the whole calculator back to the old flat formula in case the new economy needs an emergency rollback — no code change or redeploy required.

While testing this on a real two-player match, a long-standing bug surfaced: when one player surrendered, the surrendering player's post-battle screen lit up the *winner's* bonus icons instead of their own (and vice versa). The cause was a slot-ordering mistake the server had been making ever since the rewards array was first written — entries were ordered "winner first, loser second," but the game client reads each player's own entry by their party index, not by win/loss. Fixed at the same time as the bonus rollout.

*Technical:* delivers Batches 1 + 2 of M1.5 from `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`. New files: `src/services/battle/renownAwards.ts` (pure `computeRenownAwards` ported from `tbs.srv.battle.BattleMonitor.constructBattleFinishedData` lines 1091–1251; constants `WIN_AWARD=5`, `KILL_RENOWN=1`, `UNDERDOG_MAX=4`, `EXPERT_TIMER_SEC=30`, `EXPERT_AWARD=2`, `STREAK_MIN=2`, `STREAK_MIN_PARTY_POWER=6`, `STREAK_AWARD=1`, plus legacy `LEGACY_WIN_BONUS=20`, `LEGACY_PER_KILL=3`) and `src/services/battle/renownAwards.test.ts` (19 table-driven parity cases including a legacy-formula block). Modified: `src/services/battle/Battle.ts` `endgame()` now calls `computeRenownAwards()` with party powers (read directly off `BattlePartyData.power`), the pre-battle `win_streak` (from the ranking row already loaded for Elo), wall-clock battle duration, the existing `endedBySurrender` flag, and `isFriendly=false` (TODO marker pending M3b lobby work); the hardcoded `awards: { KILLS, WIN }` literal and the top-of-file `RENOWN_WIN_BONUS` / `RENOWN_PER_KILL` constants are gone. The `Promise.all` ordering contract from blocker #2 (DB writes resolve before `BattleFinishedData` is pushed) is preserved verbatim. EXPERT timer uses wall-clock instead of `BattlePartyData.timer` because that field is currently set to a debug constant; revisit when proper per-side turn timing lands. Three of the six original award types (DAILY, BOOST, FRIEND) intentionally deferred: DAILY needs an `account_info.daily_login_bonus` counter granted by a daily-login system; BOOST needs an `unlocks` table with a `bst_renown` row; FRIEND needs a `friend_battle_record` table — none of which exist on this server. Test: `test/routes/battle.test.ts` `expect(finished.total_renown).toBe(26)` updated to `toBe(7)` and a `battle.startedAt = new Date(Date.now() - 60_000)` line added so the assertion doesn't depend on EXPERT-timer wall-clock variance across CI. Also fixed during manual test: `BattleFinishedData.rewards[]` is now indexed by `party_index` instead of winner-first — the game client at `engine/battle/fsm/state/BattleStateFinished.as:32` calls `finishedData.getReward(localBattleOrder).total_renown` where `localBattleOrder` is the local party index, so the previous winner-first ordering caused each player to see the *other* player's reward bundle. Three M1 follow-up cleanup items (Batch 3) remain pending: populating `ranking.best_win_streak` in `applyBattleRankingUpdate`, an `existsSync` guard in `scripts/copy-migrations.js`, and a documented "no nested transactions in migration files" rule.

### Battles now affect a ladder rating and are written to a richer history table

Until now, finishing a match awarded the player some renown and recorded a single thin row that said only "this person beat that person." There was no ladder, no rating, no per-side breakdown, and no way to tell from the database whether a battle ended by victory or by surrender. The original 2013 Stoic server tracked all of this in a `ranking` table (wins, losses, Elo, win streak) and a `battle` table (per-side renown, scene, end time, surrender flag), so the canonical math and shape were already known — they just hadn't been ported.

Why it mattered: the project has wanted a real ladder for a long time, but no part of the stack was producing the underlying numbers. Every match was effectively forgotten the moment it finished, and the data we *did* save couldn't drive a leaderboard, a personal battle history, or future replay tooling. Without a rating to play for, competitive players have no reason to come back after the first few matches.

The fix introduces three things. First, a small database "migration runner" that applies versioned `.sql` files on server startup and records which ones have been applied — so future schema changes won't silently break a database that already has live rows. Second, two new tables (`ranking` and `battle`) created by the first migration. Third, an Elo math module ported directly from the original Java, wired into the existing endgame logic so that every finished match updates both players' ratings and writes a complete `battle` row alongside the existing renown payout. The "you won / you lost" message that reaches the client is unchanged for now — players don't yet see their new rating on screen — but the data is being recorded and the ladder feature can plug in on top whenever a UI follows. The flat `20 + 3 × kills` renown formula is also unchanged this round; the six original renown bonus types (underdog, streak, expert, kills, daily, win) will be a later, separate change.

A first manual two-player match end-to-end on a fresh database produced exactly the expected numbers: winner Elo 1000 → 1016, loser Elo 1000 → 984, matching the original Java's reference test cases bit-for-bit. Eighteen automated parity assertions ported from the original `BattleRankingTest.java` ride along to catch any future regression in the math. A second pair of matches confirmed the Elo correctly chains across multiple battles (1016 → 1030 → 1043 for the winner, 984 → 970 → 957 for the loser) and that wins/losses and win-streak both compound the same way the Java would.

A code-review pass hardened two edge cases that fell out of the initial wiring. First, if either side's ranking row fails to load from the database — a transient hiccup, a corrupted row — the server used to silently treat both players as rating 1000, then write that as the "new" rating, quietly demoting a high-rated player after one bad query. The server now logs which side failed and *skips* the rating update for that match: the battle still records (renown, kills, history row), the players still see their "you won / you lost" message, but the stored rating stays at its real value. Second, if the fallback message-pushing itself ever throws (for example because the player's session was just evicted by the cleanup routine), the failure used to escape as an unhandled rejection at the process level; it now flows through the normal error log channel.

*Technical:* delivers M1 of `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`. New files: `src/db/migrations.ts` (idempotent runner; transactional per-migration; tracks applied versions in a new `schema_version` table), `src/db/migrations/001_ranking_and_battle.sql` (SQLite ports of the original schema 4 `ranking` and schema 5 `battle` tables — plus BSF additions: per-side `winner_*` / `loser_*` Elo/renown/kill columns and `parties_json` snapshot for replay), `src/services/battle/ranking.ts` (pure `calculateNewElo`, `getEloKFactor`, constants — uses `Math.trunc` to match Java's `(int)` cast for negative deltas), `src/services/battle/ranking.test.ts` (18 assertions ported from `BattleRankingTest.java`), `src/db/ranking.ts` (`getOrCreateRanking`, `applyBattleRankingUpdate`; streak rules mirror Java's `incrementWins` / `incrementLosses`), `scripts/copy-migrations.js` (copies `src/db/migrations/*.sql` into `build/db/migrations/` because `tsc` ignores non-TS files). Modified: `package.json` `build` script chains the copy step and adds a `copy:migrations` alias; `src/db/connection.ts` calls `runMigrations(db)` after the inline auto-init; `src/db/battles.ts` adds `saveBattle(BattleRow)` writing the new table (legacy `saveBattleResult` is kept but no longer called and will be removed in a follow-up); `src/services/battle/Battle.ts` gains `endedBySurrender` and `scene` fields and `endgame()` now loads both sides' ranking rows, computes new Elos, and extends the existing `Promise.all` with two `applyBattleRankingUpdate` writes plus the `saveBattle` write. The endgame race guard (`endgameStarted`) and the DB-before-pushData ordering from earlier blockers are deliberately left untouched. `session_key` is stripped from `parties_json` before writing so session auth material never reaches the database. The `accounts.json` join uses 32-bit `account_id` per the project gotcha; the legacy 64-bit `steam_id_str` is still passed to `addRenown()` since that hits the existing `accounts` table. Total: 172 tests passing (was 50+ in the plan doc — count had drifted; all green after these changes). Post-review hardening: `endgame()` switched from `Promise.all` to `Promise.allSettled` for the ranking-row reads so a one-sided rejection no longer silently rewrites both sides' stored Elo to `ELO_BEGIN`; the four `winner_elo_*` / `loser_elo_*` columns on `BattleRow` were widened to `number | null` and `applyBattleRankingUpdate` is now conditional on `rankingLoadOk` (SQLite columns were already nullable, no migration needed); a trailing `.catch(err => console.error(...))` was appended to the writes chain so a secondary failure inside the existing fallback handler is logged instead of becoming a process-level unhandled rejection. The two extra microtasks that change introduced made the hand-counted `setImmediate` flushes in `test/routes/battle.test.ts` flake intermittently (~25% rate); a `flushEndgame()` helper in `test/helpers.ts` (8 generous yields) replaced the six manual flushes and tests have been stable across 10 consecutive full runs.

### The original Stoic server is now a discoverable reference

Until now nothing in this workspace told a new contributor — human or AI — that the original 2013 Banner Saga Factions server source still exists. Anyone working on a server feature has been guessing-and-checking the wire format from Fiddler captures when the original Java source had the right answer in one file. The four reference codebases (the original Java server, the original AS3 client, the JPEXS decompile of the shipped SWF, and the raw SWF + ANE) live outside this repo at `%USERPROFILE%\Code\bsf-refs\`, but there was no signpost saying so or pointing at the highest-value files inside.

Why it mattered: every minute spent re-deriving a wire shape from network captures was a minute that could have been spent reading canonical Java. It also created real risk of subtle wire-format drift between the custom server and the client.

The fix is three new documents and a few short cross-links, no code changes. A new `REFERENCE.md` at the workspace root names the four reference codebases, pins the `server-2013-java` git commit that the milestone plan is anchored to, and lists the seven highest-value Java paths (Elo math, renown awards, matchmaking math, lobby endpoints, wire-format DTOs, schema). A new "Reference server" subsection in `bsf-server/CLAUDE.md` points future sessions at those same anchors and adds a working rule: when adding a route or changing a wire shape, cross-check against the Java reference; the reference is the source of truth when they conflict. A new `bsf-server/docs/protocol-cross-reference.md` is a one-screen route-by-route map of every `bsf-server` `services/*` route to its Java `*Svc.java` counterpart, with milestone status alongside each row. Short cross-reference callouts were added to the root project guide and to the existing endpoint protocol doc so the new files are reachable from where readers naturally land.

While writing the cross-reference, two stale claims in the milestone plan surfaced: the surrender route and the unit-stats-reset route — listed as M4 targets / Blockers #7 and #8 — are already implemented in the codebase. The plan is annotated inline; the M4 milestone may now shrink to verification only.

*Technical:* delivers M0 of `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`. New files: `REFERENCE.md` (workspace root, 36 lines) and `bsf-server/docs/protocol-cross-reference.md` (116 lines). New "Reference server" subsection appended to the Architecture section of `bsf-server/CLAUDE.md` (~22 lines, including a do-not-port rail listing vBulletin auth, RabbitMQ workers, MySQL pooling, EhCache, NewRelic, and the Heroku Procfile). Pinned reference SHA: `515555b26fa6a3b3e7b7b9743c18351cb01532b3` of `bsf-refs/server-2013-java/` (commit subject "Consolidate the AS3 client mirror out to its sibling reference", 2026-05-17). One-line cross-references added to `BSF/CLAUDE.md` "Reference Codebases" section and to `bsf-server/docs/serverEndpoints.md` above `## Auth Endpoints`. The reference repo itself received one commit (in `bsf-refs/server-2013-java/`) staging the AS3-mirror deletions from the 2026-05-16 consolidation so the pinned SHA matches what's on disk. M4 status notes added inline at `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md` confirming `Battle.ts:519` (surrender) and `roster.ts:226` (stats reset) are already implemented.

### 🔒 Debug endpoints are now harder to leave exposed by accident

The `/debug/party-limit`, `/debug/weak-units`, and `/debug/renown` endpoints are only registered when the server is *not* running in production mode. That's been the case for a while, but until now nothing told you whether production mode was actually on — if the `NODE_ENV` environment variable was forgotten on a deployment, the debug routes would come back live with no warning. The server now prints `[BOOT] NODE_ENV=...` once on startup and adds a loud `[BOOT] WARNING` line whenever the debug routes are enabled, so the misconfiguration is impossible to miss when looking at the log. A new automated test pins the behaviour: with `NODE_ENV=production` the three routes return 404; in any other mode they work normally. Tracked as GitHub issue #21.

*Technical:* `src/index.ts` logs `NODE_ENV` and warns when it isn't `"production"`. New `test/routes/debug.test.ts` uses `vi.resetModules()` + dynamic `import()` to assert 404 in production mode and 200 in test mode. No code change to `src/app.ts` — the existing `if (process.env.NODE_ENV !== "production")` block at line 44 already gates the routes.

### 🧹 Matches no longer freeze or leak memory on the 1 GB server

Five related fixes from the 2026-05-11 performance audit (`docs/audits/2026-05-11-perf-audit.md` findings #1–#5). Together they close every path that left a finished or abandoned battle sitting in memory and freezing the surviving player's screen.

**Findings #1 + #2 — A timed-out session no longer leaves its battle hanging**

Before: when a player sat idle in a battle long enough (30 min) to hit the session timeout, the server quietly forgot the player but didn't tell their opponent anything. The opponent's screen stayed frozen on the battle view, and the now-orphaned battle stayed resident in memory until the *other* player also timed out.

Why it mattered: orphan battles eat memory on the small 1 GB server, and players had no signal that their opponent was gone.

Fix: the once-a-minute cleanup routine now treats an in-battle timeout the same way a clean quit does. It announces the surrender to the survivor, awards renown, saves the result, and then frees the battle from memory.

*Technical:* `reapStaleSessions()` in `src/services/auth/auth.ts` (lines 115–150) now calls `finalizeSurrender()` and `battleHandler.removeBattle()` for mid-battle evictions; exported so tests can drive it without timer mocking. New `test/routes/session-reaper.test.ts`. Long-poll timeout reduced from 10 s → 5 s in `src/services/game.ts`. `_debugFastTimer` flag added to `Battle.ts` (currently `true`, 10 s in-battle timer for local testing). Caveat noted in `.claude/rules/gotchas.md`: the opponent is freed to re-queue before the DB write of renown completes.

**Finding #3 — A crashed or disconnected client no longer freezes the match for 30 minutes**

Before: if your opponent's game crashed mid-turn, your client just sat there. The server couldn't tell "still thinking" from "process died", so it kept the battle alive until the dead player's session timed out — up to 30 minutes of frozen screen.

Why it mattered: this was the most visible "match freeze" symptom players were hitting.

Fix: the server now runs its own 90-second per-turn deadline. Every time a turn-advancing message arrives the timer resets and starts watching the *other* side. If the other side stays silent for 90 seconds, the server treats it as a surrender, ends the battle properly, and frees the slot.

*Technical:* `TURN_LIMIT_MS = 90_000` constant and `turnDeadline?: NodeJS.Timeout` field added to the `Battle` class in `src/services/battle/Battle.ts`. New `refreshTurnDeadline(actorKey)` method called at the end of `/sync`, `/move`, `/action`, and `/killed` routes. On expiry, the timer resolves the opposite party via `Object.keys(this.parties)` and calls `finalizeSurrender(...)`; if either session has already been evicted, falls back to `battleHandler.removeBattle()`. Timer is `.unref()`'d so it never blocks process exit. `clearTurnDeadline()` runs whenever `endgameStarted` flips and also from inside `battleHandler.removeBattle()`. Known edge case: if the same player sent both `/move` and stalls before `/action`, the timer surrenders the wrong side — acceptable for now since a 90 s mid-turn pause is almost certainly a real disconnect.

**Finding #4 — A single bad error no longer crashes the whole server**

Before: an unhandled error thrown anywhere in the server's background work — for example deep inside the post-battle database write path — caused Node to shut the entire process down. On our single-instance 1 GB deployment that meant every active player lost their match and session at the same time.

Why it mattered: one edge case in one player's match could take out a dozen unrelated matches at once.

Fix: two top-level safety nets now catch uncaught errors and unhandled background promises, log them as `[FATAL] ...`, and keep the server running. The match that triggered the error may be left in an inconsistent state, but the rest of the players' matches continue normally. The log line is the breadcrumb for diagnosing the underlying bug.

*Technical:* `process.on("unhandledRejection", ...)` and `process.on("uncaughtException", ...)` installed in `src/index.ts` before `http.createServer(...)`. Both log `[FATAL]` and do not exit. No alerting or auto-restart logic added in this pass.

**Finding #5 — Finished battles are removed from memory shortly after they end**

Before: when a match ended normally, the server pushed the "you won / you lost" messages but only freed the battle from memory once *both* clients sent a "leaving" message. If either player closed the game window before clicking through the post-battle screen, the battle sat in memory until both players' sessions hit the 30-minute timeout.

Why it mattered: this is the most common form of the orphan-battle leak — it happens on any normally-completed match where a client doesn't cleanly exit.

Fix: thirty seconds after a battle finalizes, the server now forcibly removes it from memory whether or not the clients sent their "leaving" message. A polite client that does click through within 30 seconds still gets the normal flow; after 30 seconds the slot is reclaimed.

*Technical:* `.finally(() => setTimeout(() => battleHandler.removeBattle(...), 30_000).unref())` chained to both `endgame()` call sites in `src/services/battle/Battle.ts` — inside `/killed` and inside `finalizeSurrender()`. Captured closure references only the `battle.battle_id` string; `removeBattle()` is idempotent so the timer is harmless if `/exit` already ran.

**Test coverage and manual verification.** All 50 unit tests continue to pass. Manual two-client smoke test on 2026-05-15 confirmed findings #3 and #5: one full turn played, parent game process killed; server console logged `[BATTLE] turn deadline expired: ... surrenders ... wins` ~90 s after the last action, then the battle's registry slot was freed ~30 s later.

Affected files: `src/index.ts`, `src/services/battle/Battle.ts`, `src/services/auth/auth.ts`, `src/services/game.ts`, `test/routes/session-reaper.test.ts` (new), `.claude/rules/gotchas.md`.

### 📁 Reference codebases consolidated into one parent directory

Before: the project's read-only reference material — the JPEXS-decompiled current client, the raw SWF and ANE artifacts, the original 2013 ActionScript source Stoic shared, and the 2013 Java server source — lived in three scattered parent directories with cryptic names. The 2013 client was awkwardly nested inside the 2013 server directory, and one of the locations was a stale duplicate of the existing `bsf-client/` git submodule. New contributors and AI assistants had no obvious way to find any of it, and the location names had to be re-explained in every chat.

Fix: everything now lives under `%USERPROFILE%\Code\bsf-refs\` with self-describing names — `client-2013-as3`, `client-decompiled-as3`, `client-swf-and-ane`, `server-2013-java`. The stale duplicate was deleted. The root `CLAUDE.md` documents where each one lives and when to consult it, including a newly verified rule that the 2013 source matches the current client at the API level for 369 of 381 overlapping files, with 12 specific files (battle FSM, battle board, entity definitions, game config) where the decompile is the authoritative reference instead.

*Technical:* New parent at `%USERPROFILE%\Code\bsf-refs\` with `client-2013-as3/` (385 .as), `client-decompiled-as3/` (1,113 .as), `client-swf-and-ane/` (1,277 files), `server-2013-java/` (175 .java, MySQL schema 88). Signature-comparison script and artifacts at `%USERPROFILE%\Code\bsf-refs-compare\` (`pass2-sig.py`, `in-both.txt`, `added-since-2013.txt`, `removed-since-2013.txt`, `pass2-game.txt`, `pass2-engine.txt`). Docs updated: root `CLAUDE.md` (new "Reference Codebases" section + 12-file stale list), `bsf-server/misc/Codebase-Review-Findings-2026-05-07.md`, `Findings-Client-ActionScript-Crossplay.md`, `Plan-Extract-Client-Source-Code.md`, `Plan-Integrate-Original-Stoic-Server.md`, `Plan-Phase2c-Dredge-Party-Tag.md`.

### dredge_stoneguard now usable in versus matches

The dredge_stoneguard purchasable was listed with EXERTION and WILLPOWER both set to 1 — meaning the unit had only 1 willpower per turn and could spend at most 1 of it. In practice that left it unable to do anything except basic attack-and-pass, which made it a wasted slot. The stats are now EXERTION 3 / WILLPOWER 8, matching the active-budget range of the other dredge purchasables. Buying and fielding the unit also requires a matching client-side patch to `character_classes.json.z` recorded in `findings_unit_extensibility.md` Phase 2c — without that, the unit fails the party-tag filter and can't be added to a versus party.

*Technical:* `bsf-server/data/acc.json` — `dredge_stoneguard_base` stats updated (EXERTION 1→3, WILLPOWER 1→8). Server restart required: `acc.json` is cached at module import in `src/services/account.ts`. Open follow-up: "slagandburn" freeze documented in Phase 2c of `bsf-server/misc/findings_unit_extensibility.md`.

### Phase 2b dredge purchasable stats now match the real game data

Seven new dredge units added to the Great Hall shop list on 2026-05-09 (grunt, torpor, scourge, slag-slinger, fire-slinger, doom-slinger, sun-slinger) shipped with estimated stats and a "this is a guess" tag, parked behind a sentinel cost of 9990 renown so no one would buy one. We've since extracted the real numbers directly from the game client — it logs the allowed range whenever the server sends a stat outside it — and several were quite far off: torpor is actually a rank-4 heavy equal to bellower, not the rank-2 unit we'd guessed, and three of the units called "slingers" turned out to be melee, not ranged. Strength and armour numbers were off across the board.

This change overwrites the estimates with the real values and removes the "stats_estimated" tag from each entry. There is no gameplay change — the client was already clamping anything the server sent to its own internal values — but the shop data is no longer misleading for anyone reading it. The 9990 renown cost stays in place; these units are still kept out of normal play because of a separate problem (the Proving Grounds screen freezes when a player has any unit without a portrait, which is true of every dredge unit in this list).

*Technical:* 32 stat-value updates plus 7 `comment: "stats_estimated"` removals across the seven `dredge_*_base` entries in `bsf-server/data/acc.json`. Real values extracted from the client's `clampStats` log readout per `bsf-server/misc/findings_unit_extensibility.md:222–243`. Cost field unchanged at 9990 — Proving Grounds portrait hang (step 2 of that same findings doc's "Pending work" list) is still the gating blocker.

### 🪖 Mead House: hire and "Expand Barracks" now work for everyone

Two long-standing bugs were stopping anyone from using the Mead House properly:

**You could never hire a unit.** The server's "barracks full" check was off by a factor of nine. The roster grid in the game shows your units in rows of nine slots each — so a player with 8 rows on the wall actually has room for 72 units. The server was treating that 8 as "8 slots, total" and refusing every hire from the moment a new account was created. Now the server matches the client: capacity is `rows × 9` slots.

**The "Expand Barracks" button was hidden for everyone.** New accounts were being created with `roster_rows = 8` (which the original game treats as the maximum), so the client correctly hid the expand button — there was nothing left to buy. Combined with the broken hire check above, this made the Mead House feel completely dead. We didn't actually want the expansion economy in the MVP, so the new default of `roster_rows = MAX_ROSTER_ROWS = 8` is intentional: every new player starts with the full 72-slot barracks, and the expand button stays hidden because there's nothing to expand to. The `/roster/unlock` endpoint still works for any player who's somehow below max, and it now refuses with `400 "barracks at max"` instead of taking renown silently when the player is already at the cap.

A captured response from the original Stoic server (a real player with 7 units and `roster_rows = 1`) confirmed the new interpretation — the old "1 row = 1 slot" math would have made that player's existence impossible.

*Technical:* New exports `MAX_ROSTER_ROWS = 8` and `UNITS_PER_ROW = 9` in `src/db/account.ts`. `upsertAccount()` now inserts `roster_rows = MAX_ROSTER_ROWS` (was `DEFAULT_ROSTER.length`). The hire-cap check in `src/services/roster.ts` (`POST /roster/unit/hire`) is now `roster_json.length >= roster_rows * UNITS_PER_ROW`. `POST /roster/unlock` rejects with `400 {"error":"barracks at max"}` when `acc.roster_rows >= MAX_ROSTER_ROWS`. Test mock in `test/routes/roster.test.ts` exposes the two new constants; capacity-related tests adjusted to multiply by 9; new test `returns 400 when roster_rows already at MAX_ROSTER_ROWS` covers the clamp. Documentation rule in `bsf-server/.claude/rules/db.md` updated to spell out the `rows × 9` capacity formula.

### Six new units available in the Great Hall shop

Players can now buy six promoted-tier units that the game client has always supported but the server never offered for sale. The new units are skystriker (rank-2 archer), provoker (rank-2 shieldbanger), warleader (rank-2 warrior), axemaster (rank-3 axeman), warhawk (rank-3 warrior), and strongarm (rank-3 shieldbanger). The rank-2 units cost 25 renown; the rank-3 units cost 100. Their starting stats mirror the existing experienced/veteran archer, axeman, warrior, and shieldbanger purchasables, so the price-to-power curve stays in line with what players are used to. No game-client patch was needed — the client already had the art and rules for these classes, but the server's purchasable-unit list had never included them.

*Technical:* appended six `PurchasableUnitData` entries to `purchasable_units.units[]` in `bsf-server/data/acc.json`. New `id`s: `skystriker_base`, `provoker_base`, `warleader_base`, `axemaster_base`, `warhawk_base`, `strongarm_base`. Stat blocks copied from the matching `_exp`/`_vet` templates already in the file, with `RANK` set to 2 or 3 to match each class's intrinsic promotion tier. Server restart required to pick up the new `acc.json` (file is loaded once at module import in `src/services/account.ts:9`).

### 🛡️ Data integrity — battle finalize race + renown desync

Tier 1 of the 2026-05-07 codebase review (`misc/Codebase-Review-Findings-2026-05-07.md` §3.1, blockers #1–#2). Both fixes ship together. Tracked as GitHub issues #49–#50.

**Issue #49 — A battle can no longer finish twice**

When the last unit on one side dies, the server runs an "end of battle" sequence: tally kills, hand out renown, save the result, and tell both players the fight is over. Before this fix, two "unit killed" messages arriving back-to-back could both pass the same "is the battle over?" check before either had a chance to flip the answer. When that happened, the end-of-battle sequence ran twice — players got two "you won" popups, renown was added twice, and a duplicate result row was attempted in the database.

We added a one-way "battle has finished" flag that flips the moment the first finish path takes effect. Anything else racing in behind it sees the flag set and quietly steps aside. The same flag protects against the player surrendering at the same moment the last unit dies — only one of the two paths gets to run the finish sequence; the other is a no-op.

*Technical:* New `Battle.endgameStarted: boolean` field (default `false`) in `src/services/battle/Battle.ts`. The `/battle/killed` and `/battle/exit` handlers now gate the call to `endgame()` on `!battle.endgameStarted` and set the flag synchronously before invoking the async sequence — closing the C-1 race the prior comment had only acknowledged.

**Issue #50 — Renown can no longer go missing after a win**

The end-of-battle sequence used to send each player their "you earned 23 renown" message *and* update their displayed renown total *before* the database write that actually saved those numbers. If the database write failed for any reason, the player saw renown they didn't really have — the next time they logged in, it would be gone, with no explanation.

We rearranged the order. The server now runs the database writes first, and the "you won / you lost" popup and renown total are only sent after those writes succeed. Players see the result roughly 5–50 milliseconds later than before — fast enough that nobody will notice, and worth it for the guarantee that what you see is what was saved. If the database write does fail, the player still gets a "battle finished" popup so the screen doesn't freeze, but with renown shown as zero plus a chat message asking them to report it. That way it's clear something went wrong instead of silently inflating their numbers.

The achievement-progress messages (currently zero-deltas) still send immediately because they don't depend on the database.

*Technical:* `endgame()` in `src/services/battle/Battle.ts` was reordered. Achievement-progress `pushData` happens first. `RenownMessage` and `BattleFinishedData` construction plus the per-session `pushData` loop moved inside the `.then()` block of `Promise.all([addRenown, addRenown, saveBattleResult])`. `.catch()` pushes a fallback `BattleFinishedData` with `total_renown: 0` plus a `ChatMessage` ("Battle results could not be saved — please report") in `room: "battle"`.

**Test coverage:** New unit test `initializes endgameStarted to false` in `src/services/battle/Battle.test.ts`. 137 tests pass.

Affected: `src/services/battle/Battle.ts`, `src/services/battle/Battle.test.ts`, `CLAUDE.md` (Battle State + Endgame architecture sections).

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

- "News of the Banner" popup blocking Pieloaf's window: root cause was missing `news_date` property in `global_0.sol` Flash Local Shared Object — fixed by extracting the property from `global_0.sol.bak` and appending it to `global_0.sol`
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
