# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### The guide every session reads is a fifth smaller, and now has a limit

Two guides are handed to a session before it does any work, so every word in them is paid for
whether or not that session needed it. The one read by every session in the project was largely
lookup tables — which of the four read-only copies of the original game to consult, and which twelve
files in them are out of date. Those have moved to the reference page that already existed for them
and that nothing reads automatically. Checking them against the copies on disk on the way turned up
a claim nobody had ever measured: fifty files carrying the shape of every message between the game
and the server were described as unchanged when they had never been compared.

A new build check now fails a pull request that pushes any automatically-read guide past a set size.
The last time one was cut in half it grew back by 59% in eleven days, and nothing noticed.

*Technical:* moves `## Reference Codebases` out of the repository-root `CLAUDE.md` (14,891 → 11,939 bytes as committed) into `REFERENCE.md` under a new `## Which mirror to use`; repoints `README.md:24` and `bsf-server/CONTRIBUTING.md:634` at `REFERENCE.md#which-mirror-to-use`, and drops `REFERENCE.md`'s pointer back. Corrects "369 of 381 overlapping files are byte-equivalent" to 319 of the 331 that were compared — `in-both.txt` holds 381 paths, but `pass2-sig.py` was only ever run for `engine` (259) and `game` (72), leaving 50 `tbs/` files unchecked; the sentence claiming the protocol layer unchanged is removed. Adds `.github/workflows/context-budget.yml`, measuring with `git ls-tree -l` rather than `wc -c` because the working copies carry mixed line endings under `core.autocrlf=true` with no root `.gitattributes`. Corrects the document count from 23 to 24 in the three places `docs/README.md:96` names. Records the 82-session auto-load measurement in `docs/README.md` (`REFERENCE.md` is handed to none of them) and the regrowth case in `docs/retrospectives.md`. Files #295 (run the comparison for `tbs`) and #296 (bring `bsf-server/CLAUDE.md` back down, which this budget only freezes at 33,000).

### Every piece of work now says which release it belongs to, and the priority labels say how bad, not how soon

Choosing what to build next needed a priority decision that nothing was making, so work drifted to
whichever document was easiest to improve. There are now three releases. **v1.0, "a server strangers
can trust"**, is nine security and correctness fixes and nothing new for players. **v1.1, "more
players able to play"**, opens the game to people without Steam. **v1.2** is deferred on purpose, so
it stops competing for attention. The priority labels used to mean "do this next", which is what the
board's *Now / Next / Later* already said; they now say how bad a thing is if nobody fixes it. Three
issues that described one line of code became one issue, and a report about banners the game draws
moved to the game client's own repository.

*Technical:* milestones `v1.0`/`v1.1`/`v1.2` created on `BSF-Custom-Server` (v1.0 = #222, #164, #193, #231, #140, #198, #284, #246, #224; v1.1 = #251, #29, #159, #47; v1.2 = #275 and its six sub-issues, #199, #201, #202, #200). #167 and #217 closed as duplicates of #193 — all three are the `sessionKey !== "11"` gate at `src/app.ts:136` — with #167's protocol-version reasoning and #217's `STEAM_OVERLAY_RE` fix shape folded into the survivor. #212 transferred to `BSF-Client` as #53, losing `P1` because that repo has no `P` labels. `P0`–`P3` label descriptions rewritten as severity; #231 and #284 raised to `P1` under the new wording; #284's board Confidence set to *Reasoned* since it is read from the code and not yet observed. #47 rewritten and retitled: its `[todo]` was already resolved, but `CONTRIBUTING.md:27` pointed at `BSF-Custom-Server/releases/latest`, which answers `404` because every release on both repositories is marked pre-release — repointed at `BSF-Client`'s `Beta` tag. Board view 9, *By release*, groups by the built-in Milestone field; grouping cannot be set through the API, whose `ProjectV2ViewConfigurationInput` accepts only `visibleFieldIds`. Two command traps added to `.claude/rules/ops.md`, and the note about stopping the retired priority sentence from creeping back is in `docs/idea-triage.md`.

### The changelog now says what shipped and when, instead of one four-month pile

The changelog had not marked anything as released since May 2026, so every change since then sat in
one list of unreleased work — 68 entries, 1,409 lines. Four server updates went out in that time and
each was announced to players, but the changelog recorded none of those moments, so nobody could tell
from it what was live and what was merely merged. Those four announcements are now release headings,
each linking to the update players actually read, and everything up to the 19 June 2026 update has
moved into a separate archive file. Not one entry was reworded on the way across. The main file falls
from 228 KB to 67 KB.

*Technical:* `CHANGELOG.md` split at the 2026-06-18/2026-07-19 entry boundary; the older lines moved verbatim into `docs/changelog-archive/CHANGELOG-2026-H1.md` (tracked, and outside the container image since `docs/` is in `.dockerignore`). Release headings inserted from the announcement discussions: `[0.5.0] 2026-05-18` (#65), `[0.6.0] 2026-05-26` (#106), `[0.7.0] 2026-06-19` (#142) in the archive, `[0.8.0] 2026-09-03` (#245) in the live file, 7 entries left genuinely unreleased. Entry dates recovered with `git log -S` on each heading and cross-checked against what each announcement claims. `.github/workflows/path-rot.yml` changelog skip widened from `:!**/CHANGELOG.md` to `:!**/CHANGELOG*.md` plus `:!CHANGELOG*.md` — `**/` needs at least one directory, so both are required — which is item 1 of #255 and stops the archive's historical file names failing future delete-or-rename pull requests. Citations repointed in `docs/dataStructures.md`, `docs/serverEndpoints.md`, `docs/observability.md`, `docs/Deployment.md` and `docs/Development.md`; index row added to `docs/README.md`; archive added to the `$allowed` list in `scripts/check-docs.ps1`. `package.json` name and description corrected (`bsf_server_tesing`/`ye`); version left at `0.0.1` deliberately, since nothing reads it and the changelog heading is the version that matters. Convention to stop this recurring: #292.

### Two-player test battles on one PC now start reliably

Testing the game with two players side by side in one window had stopped working: five launches in a
row started no battle at all. Two separate faults in the game were behind it. The player who gets the
sound runs out of memory loading the battle music, so never finishes loading and never tells the
server it is ready. Either player can be left on the "found an opponent" screen, whose countdown
starts only if it has finished drawing when the match arrives. Both launch scripts now turn the sound
off for both players and hold pairing back for ten seconds with a new test-server-only setting,
clearing it when the game closes. Five launches in a row now start a battle.

*Technical:* `--sound false` in `launch-game-2p.ps1` and `launch-game-2p-quickbattle.ps1`; new dev-only `POST /debug/match-delay` (`src/app.ts`) driving `setDebugMatchDelay` and the `joinedTooRecently` check in `findBestMatch` (`src/services/queue.ts`), capped at 60000ms so a hold cannot outlast the 5-minute `expireStaleSearches` drop; both scripts poll for the game process and clear their settings from a `finally`; `test-2p-match.bat` clears a delay left behind by a crashed launch. Client-side fixes tracked as BSF-Client #49 and #50; the investigation is BSF-Client #7.

### The server now counts sign-ins, match searches and players online, so we can tell whether anything brings players back

Until now the server could not say how many people played: a sign-in left no record of when it
happened, nothing counted who was online, and match searches left only a log line. So no attempt
to bring players back could be judged. The server now keeps one row of totals per hour in the
database — sign-ins, different players that day, new and returning players, searches started and
how many found an opponent or timed out, and the most players online at once. It stores totals
only, never who. "Online" counts only games still asking the server for messages, since a crashed
game could otherwise look active for half an hour or more. The database inspection script prints
the last week.

*Technical:* migration `005_activity_totals.sql` (table `activity_hourly`; column `accounts.last_sign_in_at`, backfilled to 24 h before the migration ran); `src/db/activity.ts`; `src/services/activityStats.ts` (`recordSignIn`, `recordQueueJoin`, `recordSearchesMatched`, `recordSearchTimeout`, hourly `[STATS]` line, sampler started in `src/index.ts`); `Session.lastPollAt`, `ONLINE_WINDOW_MS` and `countOnlinePlayers` in `src/services/auth/auth.ts`, refreshed in `src/services/game.ts`; timeout sweep moved into `expireStaleSearches` in `src/services/queue.ts`; new section in `deploy/inspect-db.mjs`; `session_count` described correctly in `docs/dataStructures.md` and `docs/serverEndpoints.md`. #267.

### The work list now lives on a public board, not in a document

What we planned to work on next used to be a long table in a document. It repeated what
each issue already said, the two copies drifted apart, and three rows turned out to be wrong. The
list now lives on a public GitHub board covering the project's repositories, where the state of
each piece of work is a field rather than a sentence, and one issue waiting on another is a link
GitHub shows on the card. The document is now a short pointer that explains the order. Eight pieces
of planned work that never had an issue now do, and the guides now say only the board records
whether work is ready, blocked or done.

*Technical:* `misc/Plan-Master-Roadmap.md` cut to a pointer (board `orgs/Banner-Saga-Factions/projects/3`); new `docs/retrospectives.md`; working agreement in `CLAUDE.md` → "The backlog, and how work moves"; issues #267–#275 filed; blocked-by links #201←#198, #202←#201, #273←#30; #275 parents #101/#112/#113/#115/#116/#117; present-tense status lines removed from eight `misc/` files and `docs/battle-simulation.md`.

### The traps file is no longer read by sessions that will never touch the code it describes

The list of deep traps this project keeps for AI assistants is read before any work
begins. Until now it was read before *every* kind of work — writing a plan, editing
the deployment guide, opening a container file — even though almost everything in it
is about editing the server's own source code. It had grown to about 33,000 bytes, so
roughly 56,000 bytes of reading arrived at the start of every session and three fifths
of that was traps. Of the 32 sessions that were handed it on 2026-09-10, fifteen never
opened the source at all and paid for all of it.

Three changes fix that. The traps file now names the parts of the project it applies
to, so a session that only reads or writes documentation is no longer handed it. The
two traps that were never about source code — which shell a command block expects, and
the flags two game clients need on one PC — moved to a small separate file that
deployment work gets instead, about a twentieth of what the traps file had been; a
third rule, about naming the machine a cloud command is aimed at, was written into it
fresh. And the largest entry, most of which was the reasoning behind
the rule rather than the rule itself, kept its instruction here and sent its reasoning
to the document that already owned the subject.

A session that only reads documentation now starts about 32,000 bytes lighter, a
deployment session about 30,000, and a session editing the server about 6,500.

Which places a rules file can be pointed at was then measured directly, because nobody
had ever checked and a pattern that matches nothing fails silently. All of the forms
in use work. The rule is the one a git ignore file uses: a pattern with no folder in
it matches on the file name wherever that file sits, while a pattern containing a
folder is pinned to the top of the server folder. Two traps for anyone re-checking it
are written down alongside the result, one of which voids the check invisibly.

Moving that one entry turned up four things its destination had never been told, and
all four are now recorded there: a refusal the code fixed nine days earlier and the
document still described as live, two lessons from a routing fix, and a caution
against reasoning from a refund change that has not shipped.

*Technical:* adds `paths:` frontmatter to `.claude/rules/gotchas.md` (`src/**`, `test/**`, `data/**`, `.env*`) and a new `.claude/rules/ops.md`; moves the `HttpAction.canRetry` entry's argument into `docs/client-contract.md` R10, and corrects R10's `/battle/query` live instance against `Battle.ts` (#213 made it an empty `200`); splits the trap routing row in `CLAUDE.md`; adds a `503` row to `docs/error-handling.md`; repoints citations in `docs/README.md`, `docs/FAQ.md`, `docs/Deployment.md`, `docs/Development.md`, `CONTRIBUTING.md` and both `launch-game-2p*.ps1`; updates the #258 row in `misc/Plan-Master-Roadmap.md`. Issue #258.

### The documents no longer say the same things twice, and there is now a front page listing them

The guide this project keeps for AI assistants is loaded before any work starts,
so everything in it is read whether or not that session needed it. More than half
of it described how the server is built — and most of that description already
existed, sometimes word for word, in the documents sitting beside it. One list
was duplicated outright: the pointers to the original Stoic code restated, almost
word for word, a table that already sat in a file one folder up. That file is only
linked, never loaded automatically — so this was a second copy to keep in step,
not a second copy being read.

The parts that were genuinely written down only there have moved to the documents
where somebody would look for them: how two players get paired, and how the
private-match lobby behaves. What replaced the section is six lines saying which
document answers which question. The guide is now a little over half the size
it was — 43 KB down to 23 KB — so a session begins about 2,600 words of reading
lighter. Some of that is spent again on three new working rules this change
earned, which belong in a guide about how we work in a way that a description of
the server did not.

Nine things turned out to be wrong, and all nine are corrected. Reading the old
and new versions side by side found five. The most consequential: the error document said in two
places that only a private match's owner may change its settings, while the code
has allowed any player in the room to do so since the turn-length change — and the
comment above that code said "owner-only" while its own check twenty lines below
said otherwise. Reading the moved text against the code rather than against the
copy it came from found four more that were wrong in both copies, so no amount of
comparing would have caught them.

Finally, `docs/` has a front page. Twenty-two documents had no index, so finding
one meant knowing its file name or searching all of them.

*Technical:* `bsf-server/CLAUDE.md` Architecture section (Request Flow, Session &
Real-Time Data Delivery, Matchmaking & Battle Lifecycle, Battle State, Endgame,
Lobby, Database Layer, Static Data Files, Reference server) deleted, 43,262 →
23,130 bytes; content moved to `docs/ARCHITECTURE.md` (Queue Service walk-through,
full `QueueItem` type, `killReports`/`unitKillCounts`/`endgameStarted`, Static Data
Files), `docs/serverEndpoints.md` (new "How the lobby behaves" — invariants,
divergences, `express.text`/`readBody` wire format, `ServerClasses.LOBBY_*`,
`exitAllLobbies`) and `docs/battle-simulation.md` (Elo constants, `Math.trunc`
parity, friendly-battle rule, declined FRIEND award). New `docs/README.md` indexes
all 22 documents; `README.md` Start Here cut 18 rows → 8. Corrections in
`docs/error-handling.md`, `docs/ARCHITECTURE.md`, `src/services/lobby.ts`. Links
repointed in `docs/security.md`, `docs/error-handling.md`, `docs/client-contract.md`,
`docs/gameFlow.md`, `misc/Plan-Master-Roadmap.md`,
`misc/Plan-Client-Contract-Third-Review-Corrections.md`, `src/services/queue.ts`,
`test/routes/battle.test.ts`. Relates to #255, #183, #213.

### A copy of this project is now a third of the size, and the server stops installing files it never opens

Most of what this repository held was not code. Three recordings of the real game
talking to Stoic's original servers — made in 2022, before those servers were
switched off — came to 5 MB, about two thirds of every file in it. They are
irreplaceable and they are the reason we know what the original server sent back,
but no part of the server ever opens them: they are reference material for a
person, not an input to the program.

They now live on a permanent download page attached to this project (the
`reference-captures` release) instead of inside the repository. Nothing was
thrown away, and every place in the documentation that told you to go and look at
them now says where to get them and how to unpack them. One extracted message
stays in the repository, because an automated test reads it and that test has to
work on a fresh copy with nothing downloaded.

Separately, six sample data files that no code reads were still being installed
onto the server inside the running container. They stay in the repository as
reference material but are no longer shipped.

Finally, two configuration files that GitHub was never going to run have been
deleted. GitHub only looks for these at the very top of a repository, and these
sat one folder down, where they had no effect. One was a copy of the real build
check, close enough to the real thing to be mistaken for it — the more expensive
kind of dead file, because it invites you to edit it and wonder why nothing
changes.

*Technical:* `data/game_captures/*.saz` untracked with `git rm --cached` (the
`*.saz` ignore rule already existed, so no new pattern was needed — a comment
above it now records where they went); `data/game_captures/extracted/raw/0058_s.txt`
stays tracked for `src/services/matchmaker0058.test.ts`. `.dockerignore` gains
`acc-backup.json`, `acc-new-units.json`, `battle.json`, `battlereadyData.json`,
`battleDataStructure.txt` and `client-README.txt` — each confirmed unread by
searching the whole repository; the `data/` files the running server opens are
`acc.json`, `accounts.json`, `first.json`, `lboard.json`, `build-number`, the
database it creates itself, and `factions.tar.gz` (the game download served by
`GET /download`, which is not in git and so is easy to overlook). Deleted
`.github/workflows/ci.yml` and `.github/workflows/todo-issue.yml`;
`docker_build_publish.yml` is left in place because issue #228 owns it. Capture
references updated in `CLAUDE.md` (4 places), `docs/Development.md` (4),
`docs/HISTORY.md` and `.claude/commands/stream-done.md`. Tracked server tree:
7.00 MB -> 2.11 MB; a clone limited to the latest version, 11 MB -> 3.4 MB; a
full clone, 13 MB -> 8.1 MB. What a full clone *downloads* is unchanged (the
packed history is 5.3 MB before and 5.5 MB after) — removing a file from the
current version does not remove it from the past, so only the checked-out half
gets smaller. See [`docs/idea-triage.md`](docs/idea-triage.md)
→ *Making the server machine download less than the project's whole past* for
what would be needed and why it was left alone.

### You can now tell at a glance which plans are live and which are finished

The folder of working documents had grown to twenty-five files with nothing to
distinguish work still in progress from work that finished months ago. Ten had
finished. Those are now kept on the maintainer's disk rather than in the public
copy of the project, and each of the fourteen that stayed opens with three lines
saying what state it is in, which issue tracks it, and when it was last touched.

Nothing was thrown away. Where a document explained why something was done, that
explanation was posted to the issue it belongs to before the file moved, so it is
still findable by anyone reading the issue.

Two pieces of work that had no issue now have one, because a plan with no issue
is invisible to everyone who does not already know it exists: **#251** for letting
people without Steam sign in and play, and **#252** for putting the game and the
server in one repository.

The steps for getting your own readable copy of the game's code were not a plan —
every contributor needs them — so they moved into the documentation suite rather
than being archived.

_Technical:_ `bsf-server/misc/` 25 tracked files -> 14; finished plans moved to the
git-ignored `misc/archive/`. `Plan-Extract-Client-Source-Code.md` renamed to
`docs/extracting-the-game-client-source.md`. Citations updated in `CONTRIBUTING.md`,
`src/services/queue.ts` (comment only), `scripts/check-docs.ps1`, `Plan-Master-Roadmap.md`
and five plans; roadmap archive-table entries now omit the `.md` ending so the
`path-rot` check does not read a historical record as a live citation.

## [0.8.0] - 2026-09-03

Announced to players in [Community Update #245](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/discussions/245).

### New players are no longer made to play the tutorial

Signing in for the first time used to drop you straight into a scripted tutorial battle, and the game
would not let you do anything else until it was over. Almost everyone arriving here already owns the
game and has played it, so this was a lesson nobody had asked for standing between them and their
first real match. Anyone setting up a test account met it too, every single time, and the only way
out was to sign in once, stop the server, edit the database by hand and start it again.

New accounts are now created as though they had already played the tutorial, so it never starts. This
is a change to how an account is *created*, so nobody who already has one is affected in either
direction: if you were part-way through the tutorial it is still waiting for you, and if you had
finished it you have not been sent back. A server operator who would rather new players did see it
can switch it back on without a code change.

Nothing was removed. The tutorial is still there, and the game's own `--tutorial` launch option still
plays it on demand.

*Technical: `skipTutorial()` + `DEFAULT_SKIP_TUTORIAL` in `src/const.ts`, read at call time so dotenv
load order cannot freeze it, overridable with the `SKIP_TUTORIAL` environment variable (`true`/`false`/
`1`/`0`; anything else warns once and falls back, and is never read as its opposite). Applied in
`upsertAccount` (`src/db/account.ts`) by adding `completed_tutorial` to the INSERT column list only —
the `ON CONFLICT` branch is untouched, which is what keeps this new-accounts-only — bound as `1`/`0`
because `node:sqlite` throws on a bound boolean. No migration; the column already exists and its
default stays `0`. `completed_tutorial` is the only thing the server sends that decides this; the
game has two inputs of its own that beat it (`FactionsState.as`) — its `--tutorial` launch flag, and
running offline, which skips the tutorial whatever we send. Closes #230.*

### The server moved to a new machine, and its backups now live somewhere else

The machine running the public server was deleted by accident. Everything on it went with it — every
account, every rating, every battle record — and none of it could be recovered. The player base
started again from nothing.

The reason nothing could be recovered is worth stating plainly, because the setup looked careful.
There *was* a backup routine, and it was documented, and it worked. It wrote its copies to a folder
on the server itself. So the copies were destroyed by the same event they existed to protect
against. A backup that lives on the machine it is backing up guards against a bad software update
and against essentially nothing else.

The replacement server now copies its database, every night, to Google Cloud Storage — a place that
survives the machine being deleted. Each copy is a few kilobytes, kept for a fortnight, and small
enough to sit inside Google's free allowance many times over. Copies are still kept on the server as
well, because restoring from those is faster; they are just no longer the only ones. The guide now
also says how to check that the stored amount is staying free, and what that check quietly misses:
the allowance is counted across everything you store, not one folder, and Google keeps charging for
deleted files for another week while hiding them from view. That second behaviour is now switched
off, so the number you are shown is the number you pay for.

Two related weaknesses were closed at the same time. The server's public address was never
reserved, so it can change whenever the machine is stopped and started again — which would leave the
server running perfectly while nobody could reach it. It now tells the naming service where it is,
every five minutes, so a changed address corrects itself. And the deployment guide had drifted badly
enough that following it start to finish could not have worked: it named a machine that no longer
existed, gave a folder to clone into that had moved four months earlier, described a different
operating system, and installed a piece of Docker by a name no Linux distribution publishes. It also
repeated a claim about Google's free tier that is no longer true — free storage for disk snapshots,
which Google used to offer and does not any more. A separate exercise on 2026-09-02 then ran the same
guide on a machine it does **not** describe — a different computer, a different account, a different
cloud project, which is the version an emergency actually needs — and found fifteen things wrong with
it. Those are corrected. Three parts have still never been run from start to finish: pointing a name
at the machine, the security certificate that depends on it, and a real upload to the storage bucket.

One further thing was caught by reviewing the new guide before publishing it, and it was the least
obvious part of the whole job. The nightly copy originally worked the way almost everyone does it:
bundle up the database files and send the bundle away. That is not safe for this kind of database.
It keeps recent changes in a second file alongside the main one and merges them across periodically,
and a bundler reads the two files a moment apart — so if a merge happens in between, the bundle
contains an old main file next to a newer change list. Restoring it replays those changes onto the
wrong starting point, and the result opens perfectly and is quietly wrong. On this server the
change list was forty-seven times the size of the database it belonged to, so almost everything was
in the part most likely to shift. The job now asks the database software itself for a copy, which is
a supported way to do it while the server is running, and checks that what came out really is a
database before sending it anywhere. A copy was then restored and read back to prove it works.

On 2026-09-02 that was taken a good deal further. A stored copy was restored into a second server
built from nothing on a separate account, and a real game client on the open internet signed in as a
player who had never existed on that machine. It is the mechanism that is proven, not a large body of
data — the player base restarted from empty the day before, so the stakes were zero, which is exactly
the right moment to find out whether something works. The guide's restore instructions were rewritten
around what that exercise actually did, because the ones it had could not restore the kind of backup
this server makes: followed literally they deleted the live database and then unpacked a bundle that
no longer exists. There is also now a section saying, in writing, what a second person could and
could not do — they can rebuild the machine, but they cannot read a backup or answer on the public
address, because both are held by one person.

*Technical:* new `docs/Deployment.md` Steps 0–7 replace the previous Steps 1–6 and absorb the
untracked `docs/HowToCreateNewServerVM.md`, which is deleted. Production VM is now `bsf-server-vm` /
`us-central1-a` / Debian 12 (was `bsf-community-server-vm` / `us-central1-f` / Ubuntu 22.04);
`35.209.221.226`; `bsf-server.duckdns.org`. Clone path corrected to `BSF-Custom-Server/bsf-server`
(compose files have lived one level down since the May 2026 reorganisation). Docker installed from
`download.docker.com`: `docker-compose-plugin` is Docker's package name and exists in neither
distribution's archive, though Ubuntu ships Compose v2 as `docker-compose-v2` in *universe*. Swap
raised 1 GB → 2 GB. Off-VM backups: `gs://bsf-community-server-db-backups` (`us-central1`, 14-day
lifecycle, soft delete cleared so `storage du` reports true billed size), written by
`/usr/local/bin/bsf-backup.sh` on a systemd timer — `VACUUM INTO` via `node:sqlite` inside the app
container, gzipped, `SQLite format 3` header asserted before upload; the earlier whole-volume `tar`
was replaced because it cannot produce a consistent set on a live WAL database (see
[sqlite.org/howtocorrupt.html](https://www.sqlite.org/howtocorrupt.html)), and a `:ro` mount forces
the unsafe method since WAL needs to create `-shm`. Writes need the `devstorage.read_write` access
scope (via `instances set-service-account`, which requires the instance stopped) *and* an IAM role;
note the default compute service account here already holds `roles/editor`, so the added
`roles/storage.objectAdmin` binding is belt-and-braces. DNS self-heal:
`/usr/local/bin/duckdns-update.sh` plus `duckdns.timer`, with `duckdns-set-token` validating token
shape at entry. New verification asserts `[BOOT] NODE_ENV=production` and a **POST** 404 from
`/debug/party-limit` over the public internet (`src/index.ts`, `src/app.ts:45`); a GET 404s either
way. Also corrected: `.env.example` documented `VS_WINDOW_POWER_TIME_SECS=90` and a per-player power
cap of 3–4, where `src/services/queue.ts:26` uses `20` and `VS_WINDOW_POWER_MAX = 4` uniformly;
`README.md` required Node ≥ 23.4 against `engines: >=24.0.0`; `docs/Development.md` single-player
launch line carried two `--server` flags. Let's Encrypt limits restated (5/week per identical
hostname set, 50/week per registered domain, 5 failed validations per hostname per hour). Noted:
`bsf-server/.github/workflows/` holds three unreachable workflow files; `docker_build_publish.yml`
last ran 2026-05-02 and all 29 recorded runs were `pull_request`, which it blocks from pushing — so
`docker.pieloaf.com/bsf-server:latest` was never published by it (#228). Rationale for choosing a
storage bucket over disk snapshots recorded in `docs/idea-triage.md`. Drill corrections: `--scopes` quoted and joined, `value(type.basename(),sizeGb)`, `grep` guard on the `/etc/fstab` append, `try`/`catch` round the debug-route probe, the `chown 1002:1003` removed (the container runs as root), the tar restore replaced by a single-file swap with a `sha256sum` check either side, header bytes 18/19 documented, and the inlined script bodies replaced by links to `deploy/`. New `deploy/inspect-db.mjs`. Filed #236 and #237.

### New players start with something to spend

Renown is the game's spending money — it hires units, promotes them, renames them and pays for
barracks space. A brand-new account was created with none of it. That never stopped anyone hiring,
because sixteen of the eighteen units on offer cost nothing, but it did mean a new player could not
promote, rename or improve a single one of them until they had played several battles. On a server
where a match can take a while to find, that is a wall at the front door rather than an early goal.

It turns out this was never a decision. The original game's server handed a first-time player three
things out of one starting-account file: a roster, a party, and a pile of renown. When a file of that
shape was brought across to this server the roster and the party came with it, and the renown was
quietly left behind — the number is still sitting in the file, unused.

New accounts now start with 10,000 renown. Hiring and fully promoting a completely full barracks —
all seventy-two places, every unit at top rank — costs about 8,705, so nothing the server charges for
is out of reach any more. Existing players are unaffected in either direction: signing in again never
adds to a balance and never resets one, so whatever you have earned or spent is exactly what you
keep. A server operator who wants a different number, or none at all, can set one without a code
change.

*Technical: `startingRenown()` + `DEFAULT_STARTING_RENOWN` (10000) in `src/const.ts`, read at call
time so dotenv load order cannot freeze it (measured: this module loads 5th, the first `config()` runs
12th). Overridable with the `STARTING_RENOWN` environment variable, bounded by `Number.isSafeInteger`
and 2^31−1; anything else warns once and falls back, and `0` disables the grant. That safe-integer
bound is load-bearing rather than tidy — a whole number between 2^53 and 2^63 stores fine and then
throws when the row is read straight back, permanently bricking the account just created. Applied in
`upsertAccount` (`src/db/account.ts`) by adding `renown` to the INSERT column list only — the
`ON CONFLICT` branch is untouched, which is what keeps this new-accounts-only. No migration; the
column already existed. Ports `AccountInit.setupUser` / `GameConfig.starting_renown` from the 2013
Java server, diverging on the amount (19 → 10000) and granting once at creation rather than as a
floor. Closes #227.*

### The turn timer you pick is the turn timer you get

Two friends who set up a private match can choose how long each turn lasts: none, thirty seconds, or
a minute. Choosing **none** did not work. The game has always told us which one was picked, and this
server has never once looked at the answer. It made up a number instead, based on nothing more than
which of the two players was found first — thirty seconds for one, forty-five for the other, or
fifteen for both on a test server. So the one setting whose entire purpose is to remove the clock
quietly added one.

A second promise broke behind the first. This server keeps its own ninety-second rule: whoever has
not moved by then is treated as having left, and loses the match. That rule is not a clock, and was
never meant to be one — it is there so a game that crashes cannot freeze its opponent's match for
half an hour. But a player who was promised no clock still lost after ninety seconds of thinking.

Now the length people ask for is the length they get. **Both players in a match share one clock**,
taken from what the two of them asked for: the shorter of the two wins, so nobody is left waiting on
somebody with far longer to think. The one exception is "no clock", which is only applied when *both*
players asked for it — otherwise a single player could take their opponent's clock away, and since
nobody is surrendered for thinking, they could then sit on their turn for ever with the other person
unable to do anything but quit. Someone who genuinely agreed to no clock is never surrendered for
thinking; the server just looks in every ten minutes to see whether they are still connected, and
only clears the match away once they have actually gone.

Two things follow that are worth knowing. **Ordinary matches change too.** Both players now get
forty-five seconds instead of one getting thirty and the other forty-five, and the game's own expert
mode — which asks for thirty-second turns — starts working for the first time on this server, having
been ignored along with everything else. And **the "network problem" message should be rarer for
everybody**, not just for people who chose no clock: when your opponent used up their whole turn,
your game began asking us for a move that had not been made yet, and we answered "not found". The
game treats that as a broken server, asks again every two seconds without ever giving up, and puts
the storm-at-sea overlay on screen if it keeps failing for more than five seconds. We now answer
plainly instead. It is the same reply the game already gets when the move *has* arrived — the move
itself never travelled in that reply anyway — so it simply waits a little and asks again.

**One thing this does not do yet.** We have not watched the original fault happen and then watched it
stop. Every step from the wrong clock to that on-screen message is supported by the code, but the
overlay is a single generic message with no information about which request upset it, so only sitting
in front of two running games can confirm which part of this was the cause.

*Technical:* `MAX_TURN_TIMER_SEC` / `DEFAULT_TURN_TIMER_SEC` in `src/const.ts`; `timer` read in
`POST /vs/start` and carried on `QueueItem`; `sharedTurnTimer(a, b)` in the same file collapses the two
requests to one value on `BattleOptions.timer` — deliberately **not** `PerSideMatchData`, because the
clock is a property of the battle and both parties should be equal by construction — on the live path
*and* the `BSF_MATCHMAKER_LEGACY` rollback path. `Battle.ts` gains `Battle.turnTimerSec` and
`resolveTurnTimer()` (which leaves a zero alone so `/debug/fast-timer`, on by default whenever
`NODE_ENV !== "production"`, cannot mask this bug in tests or in dev), replaces
`TURN_LIMIT_MS = 90_000` with `TURN_DEADLINE_GRACE_MS` + `NO_TIMER_SWEEP_MS` measured against
`turnTimerSec`, and answers `/battle/query` with an empty `200` rather than `404` when
`battle.turns[turn]` is absent. `/lobby/options` in `src/services/lobby.ts` now admits any member of
that lobby, not only its owner. Ported from `VsWorker.java:701-703` with three divergences (one shared
clock rather than one per player; a bounded value; the `dTimer` pairing term still omitted) — see
`docs/protocol-cross-reference.md`. The previous seat-based constants came from misreading capture
`0058_s.txt`.
Client-side chain: `VersusStartMatchTxn.as` (unconditional `body.timer`), `SceneLoader.as:195`
(`opponent.timer`), `BattleTurn.as:71`, `BattleStateTurnBase.as:31`, `BaseBattleState.as:84`
(`if(timeoutMs)`), `BattleStateTurnRemote.checkTurnQuery`, `HttpErrorState`. 430 tests in total, 25
of them new. Closes #213.


### Unit colours: every one is yours, they are free, and they stay put

Each of your units can be given a different colour — twelve of the thirty unit types offer three
to choose from — and picking one has never worked. It failed in three separate ways at once.

The second colour asked ninety renown for itself. The third did not even offer to sell you
anything: it showed a shopping-cart icon and, when clicked, tried to open a shop that Stoic shut
down years ago, which led nowhere at all.

The ninety renown was the worse half, because it was quietly disappearing. The game takes the
payment and repaints the unit the moment you click, *before* it tells the server anything — and
this server had never been taught what a colour change was, so the request was turned away. The
renown stayed missing from your screen for the rest of that session, and the colour reverted the
next time you logged in. You paid, and got nothing.

And even when a colour did appear to take, it did not survive closing the game. There was nowhere
to write it down.

All three are fixed. Every player now owns every colour outright, so all three swatches show as
yours, no price is asked and nothing is deducted. The choice is recorded properly, so it is still
there when you come back — and so is the fact that you own it, which means switching between
colours you have already worn stays free rather than asking you to buy them again.

Making colours free rather than charging for them was a decision, not an accident. The alternative
was to keep the price and have the server collect it, but the game and the server have to agree on
the number or your renown counter visibly springs back at the next refresh — and free is the
kinder of the two ways to agree.

Alongside this the server gained a proper record of what each player owns, which was the missing
piece behind a battle bonus that has been parked since the scoring system was first written, and a
correction to where the server looks for your login when a web address has extra parts after it.
That last one had to ship in the same change: on its own it would have turned a harmless refusal
into a request the game repeats every second for as long as it is open.

**One thing this does not do yet.** If a friend is watching your units in a lobby when you recolour
one, their screen keeps showing the old colour until the battle starts. The original server told
the room; this one does not yet.

*Technical: adds `unlocks` table (migration `004`) and `src/db/unlocks.ts` (`getUnlockIds` /
`grantUnlock` / `hasUnlock`); `UNIVERSAL_UNLOCK_IDS` in `src/const.ts` holds the twelve
`var_<class>s` ids read out of the decoded appearance table — the five `var_all*` ids named in #98
are referenced by no appearance and are excluded. `buildUnlocksData` in `src/services/account.ts`
replaces the hardcoded `unlocks: []`. Adds `POST /roster/unit/variation/:session_key/:unit_id/:variation/:lobby_id`
in `src/services/roster.ts`, which writes both `appearance_index` and the `appearance_acquires`
bit via `saveRoster` and charges nothing; unknown unit and out-of-range colour answer `400`, a
repeat answers `200`, never `404`. `src/app.ts` gains `VARIATION_RE` so the session key is read
from its real position, and the handler guards `req.session` because the `"11"` login sentinel can
now reach it. `appearanceCountFor` bounds the colour per class. Closes #98, #72, #119, #188.*

### Challenging a friend now actually starts the battle

You could invite somebody, meet them in the lobby and both press ready — and then nothing happened.
Both players sat looking at a spinner. Nothing on either screen said why, and nothing in the server's
own log did either, so from the outside it looked like the game had simply stopped.

The reason was that the game was asking for something this server had never been taught to recognise.
When two friends ready up, the game asks for a *friend match* — a private one, naming the person you
invited and the map you chose in the lobby. This server understood only the three kinds of match you
reach from the open queue, so it turned the request down, and it ignored both the opponent and the map.
All three are understood now, and two players have played a friend battle from the invitation through to the results screen: nothing was paid to either of them, and both ratings moved.

Two people who named each other are put together on that basis alone. That matters more than it
sounds: normally the server will only pair players whose parties are close in strength, and it widens
that tolerance only so far — so two friends with a veteran party and a new one would have waited for a
match that could never have been made. Choosing each other overrules it, which is the whole point of
choosing.

The map you pick in the lobby is now read, and used when it names one of the five the server has
actually watched load. Anything else quietly falls back to one of those five, because a map name the
game cannot find makes it give up on the battle altogether — losing your choice of ground is a far
better outcome than losing the match. Be aware the fallback is likely the *common* case rather than the
rare one: the lobby offers every map the game ships and starts on a random one, so most picks fall
outside the five. Widening that list, and telling players when their pick is replaced, is #200.

**What a friend battle is worth** was a decision, not an inheritance, and it is worth stating plainly.
It counts towards your rating and your win/loss record exactly as an ordinary match does. It pays no
renown at all, and it does not move your units towards a promotion. The original 2013 server said no to
all three of those; we kept only the last one. The consequence, chosen with eyes open: two people who
want to can trade wins to climb the leaderboard, and it costs them nothing to do it.

One older behaviour was kept deliberately and is worth knowing about. Naming an opponent works even if
that person never asked for you — so somebody waiting in the open queue can be pulled into a battle a
stranger arranged. That is how the original server behaved. Such a battle is *not* treated as a friendly
one, because being friendly needs both sides to have asked for it: it pays and rates normally, and the
stranger does not get to pick the ground.

*Technical:* `GameModes.FRIEND` plus `REPORTED_QUEUE_MODES` in `src/const.ts`; `checkForceMatch` ported
from `VsWorker.java:769-800` into `src/services/queue.ts` and consulted **before** `checkWindows` in
`findBestMatch` (and exempting the pair from the re-check in `tryCreateBattle`); `forcematch` / `scene`
read in `POST /vs/start` and carried on `QueueItem`; `friendly` computed from both entries and passed
to `battleHandler.addBattle` via a new optional `BattleOptions`. `Battle.ts` gains module-level
`BATTLE_SCENES` / `isKnownScene`, sends the real `friendly` on `BattleCreateData`, puts `FRIEND` on
`tourney_id` 0, and `endgame()` now reads `battle.friendly` for both `computeRenownAwards` and the
per-unit KILLS guard. `getInitialData` and `notifyQueueUpdate` skip unreported modes; `getQueue` drops
entries with a `forcematch`. Self-match requests answer `400`. Closes #205. 376 tests
in total, 34 of them new (a couple of existing ones were rewritten rather than added, so the
suite grew by less than that). `ranking.friend_battles` is deliberately left unwritten — see `docs/database-schema.md`.


### You can now see who else is playing, and challenge them

The game has a "Challenge a Friend" screen, and it has always been empty. It was the only way into the
private-match system, so that whole system — eight working, tested pieces of the server — had never
once been used by a player. The screen was blank for a simple reason: it lists whoever the server tells
it to list, and the server had never told it anybody.

It does now. Everyone signed in appears on everyone else's list, with the room they are standing in
shown beside their name, and the list keeps itself right while you play: somebody arriving is announced
in the chat window and appears on the screen, and somebody leaving goes grey and can no longer be
invited. Two players have walked the whole flow — pick a name, send a challenge with a taunt, accept it,
and meet in the lobby.

There is no way to choose who is on your list, and that is not an oversight. The game ships no button to
add, remove, search for or block anybody, and no message exists that can take a name off a list it has
already been given — so "everyone who is signed in" is not a shortcut, it is the only rule the game can
express. Nothing is stored: the list is worked out fresh from who is connected.

**The battle at the end of it** was missing when this landed, and is fixed in the entry above — both
ship together.

*Technical:* new `src/services/friends.ts` builds `tbs.srv.data.FriendsData` from the live session map
and pushes it on login (both the Steam and Discord paths), with `FriendOnlineData` on login/logout/reap
and `GameLocationData` from a now-implemented `POST /services/game/location/:session_key` (plain-text
body, whitelisted room tokens). Fan-out to *other* players uses a new `Session.pushDataPassive` that
does not refresh `lastActivity` — using `pushData` there would re-arm every connected session's idle
timer on every login and stop the reaper clearing crashed clients, which is exactly what leaves a ghost
on the friends list. The `FriendsData` stub was removed from `data/first.json` so the list has one
source. `Session.location` added. Never send singular `tbs.srv.data.FriendData`; see
`.claude/rules/gotchas.md`. `/services/vs/start` now logs a refused `vs_type`. Closes #91.*

### Requests that failed used to go unanswered, leaving the game waiting for ever

When something went wrong inside the server while it was handling a request, the request often got no
answer at all — not an error, nothing. The connection stayed open and the game sat waiting on it for as
long as the player left the game running.

That is worse than an error, because nothing shows it. The game has no time limit of its own for a
request, so it does not give up, does not try again, and does not put up the "reconnecting" notice. If
the stalled request happened to be the one the game uses to collect new messages, the player could stop
receiving anything at all — chat, match found, battle updates — while the game still looked fine.

Every request now gets an answer: anything that fails is written to the log with the route and the
player it belonged to, and the game is told "no" in a way it accepts and does not re-send. We also
tightened several places in the roster code that could fail this way, including one that could fail
*while already dealing with a failure*, which threw away the original problem and sent nothing at all.
Worth recording: we expected to find an endless retry loop, because that is what the report described.
It is not one — silence makes the game stall rather than loop, and a stall is quieter and worse.

*Technical:* new `src/http/asyncRouter.ts`. Express 4 `Layer.handle_request` only try/catches a
synchronous throw, so a rejected promise from an `async` handler never reaches `next(err)` and no error
middleware can run; `asyncRouter()` wraps each registered handler so it does, and all eleven `Router()`
sites now use it (plus `wrapAsync` on the one async handler mounted straight on `app`). A terminal
`app.use((err, req, res, next))` in `src/app.ts` logs `[UNCAUGHT]` and answers `409`, guarding
`res.headersSent` (`chat.ts` replies before it finishes) and honouring a carried 4xx `err.status`, so
`express.json()`'s malformed-body `400` survives. `roster.ts` gains `accountShapeOk` and optional
chaining on four `unit.stats` reads, and `/unit/stats/purchase` resolves its stat objects once instead
of four times — removing all three non-null assertions, including the one inside the `catch`. The
long-poll timer callbacks in `game.ts` keep their own try/catch: they run outside the middleware stack
and no Express error handler can reach them. Tests: `test/routes/errors.test.ts`. Closes #176.

### After a restart the game now notices, and signs you back in

Sign-ins only live in the server's memory, so restarting the server forgets everyone who was signed in.
The game never found that out. It carried on talking to a server that no longer knew who it was, with
no message and no attempt to sign in again — just a network-problem graphic after about six seconds
and every button doing nothing, for as long as the player left it open.

The cause was the answer we sent. The game got "forbidden", which it treats as an ordinary failure.
There is exactly one answer it reads as *you are signed out* — "unauthorised" — and that one already
does the right thing: it stops the request, shows a "Disconnected From Server" message, and once
the player clicks OK it fetches fresh credentials — signing straight back in where it can, and
showing the login screen where it cannot.

The server now says "unauthorised" when it does not recognise a sign-in, but only when what it was
given actually looks like one. That second half matters. One screen in the game sends a request with a
room number on the end, where the sign-in normally goes — so the server reads the room number,
recognises nothing, and would have thrown a perfectly connected player out for changing a unit's
colour. Anything that was never a sign-in still gets the old "forbidden", which the game never
reads as being signed out.

*Technical:* `src/app.ts` session gate answers `401` when the last path segment matches
`SESSION_KEY_RE` (`/^[0-9a-f]{32}$/`, the shape `auth.ts` generates) and `403` otherwise, replacing a
flat `403`. `401` is the only code `GameFsm.txnProcessedCallback` branches on — it aborts the txn, sets
`communicator.connected = false` and `credentials.offline = true`, opens the disconnect dialog and, on
OK, transitions to `PreAuthState`; `403` matches no branch at all. The shape test protects
`/roster/unit/variation/{key}/{unit}/{variation}/{lobby}`, which alongside the already-allowlisted
Steam overlay is the only client route that puts segments after the key (checked against every
`super("services/...")` in the decompile) — see `docs/client-contract.md` → R5, and #188. The seven
`requireSession` guards in `lobby.ts` move to `401` for the same condition; the three lobby ownership
refusals (two ownership checks and one invite-list check) and `Battle.ts`'s party check stay `403`. Tests: `test/routes/auth.test.ts`; verified against
the running client 2026-08-25 — banner during the outage, dialog on the first `401`, automatic
sign-in after OK, landing on the match-search screen rather than the one the player left (observed,
not yet explained). Closes #180.

### Stopped one lobby refusal from putting the game into an endless retry loop

If you accepted an invitation to a friend lobby that had just disappeared — because the person who
created it left, or their session timed out — the server answered "no such room". That is one of only
three answers this game re-sends by itself, and it re-sends every couple of seconds with no limit, for
as long as the game stays open. Nothing told the player it was happening, and nothing could stop it.

The server now answers "the room is gone" when the room is gone, and "you were not invited" when the
caller was never on the invite list. Neither is an answer the game re-sends, so it asks once and stops.
The player is still left looking at a lobby screen for a room that is not there — the game switches
screens before it asks, and never undoes that — but it is no longer talking to a server that keeps
saying no.

**A correction that came out of the same work.** Our own notes said a server *restart* was what caused
this. It is not, and cannot be: a restart clears the login sessions along with the lobbies, so after one
the game is turned away at the front door and never reaches the lobby code at all. The real trigger is
narrower — losing the room while the player's session is still alive. That mistake had survived four
rounds of review, and it is corrected everywhere it appeared.

*Technical:* `src/services/lobby.ts` → the join handler answers `409` when the lobby id does not
resolve and `403` when the caller is not in `members`, replacing two `404`s; `404` is retryable per
`HttpAction.canRetry` (`0`, `404`, `>=500`, no attempt cap) and all 8 lobby routes set
`resendOnFail`. Both tests in `test/routes/lobby.test.ts` renamed and flipped. Reachable trigger is
`lobbies.delete` via the exit handler or `exitAllLobbies` (session reaper / logout) — not a process
restart, because `sessions` in `auth/auth.ts` is a module-scope object with no persistence, so
`app.ts`'s gate answers `403` before `LobbyRouter` is reached. Docs moved in the same change:
`docs/client-contract.md` (R23 BROKEN→HOLDS, tally now 15/5/3; R10 live instances), `CLAUDE.md` →
Lobby, `.claude/rules/gotchas.md`, `docs/error-handling.md` (whose `lobby.ts` line anchors are now
handler names — adding the comment shifted ten of them). Refs #164.

### Five more things the game requires of this server, and one dormant trap

The requirement list grew from eighteen entries to twenty-three. The new ones were all missing for the
same reason: the original sweep looked at what the game *asks us for*, and never at what it does with
what we *send back*.

- **Anything the game might re-send has to be safe to do twice.** The list already said the game
  re-sends failed requests; it never wrote down the obligation that follows. Confirming a unit's death
  already works this way — a repeat is recognised and ignored — and that is the shape the
  renown-spending actions need.
- **A pushed battle message with no battle identifier is never accepted, and one with the wrong
  identifier is silently thrown away.** Neither shows an error anywhere. We push battle messages from
  thirteen places and have not checked them one at a time, so this is recorded as unverified.
- **Refusing a duplicate status check is right, but it costs that player a full waiting period** before
  they can receive anything. Fine occasionally; serious if a session ever gets stuck refusing.
- **If the game cannot read our account answer it shows the player stale information instead of an
  error** — falling back to its own saved copy from last time. So "my roster is out of date" can mean we
  sent something the game rejected, not that we lost data.
- **A lobby the game still believes in.** A room can vanish while a player is still holding an
  invitation to it, and the "no such lobby" answer was one the game retried forever. Fixed in the entry
  above; the restart wording this bullet originally carried was wrong, and the correction is recorded
  there.

**The dormant trap:** the game contains everything needed to give up on a slow request — a timer, a
failure code, a handler — except the line that would start the timer, which does not exist anywhere. So
the game has no time limit at all, which is why it waits patiently through our five-second hold. The
unused timer is set to **exactly five seconds**. If anyone ever switches it on, the game's limit and our
hold land on precisely the same boundary, and our hold must move well below it.

Also tidied: the same facts were being restated in three files, so a single correction meant three
edits. Each fact now lives in one place and the others link to it.

*Technical:* R19–R23 added to `docs/client-contract.md` (23 requirements; the tally at the time was 14 HOLDS, 6
BROKEN, 3 UNPROVEN — R23 has since moved to HOLDS). R19 replay-safety (positive example: `Battle.applyKillReport` early-returns on
`reports[entity] === mask`); R20 `BattleFsm.handleOneMessage` returns `false` when `battle_id` is
undefined (never consumed, accumulates) and `true` on mismatch ("SILENTLY EAT WRONG BATTLE"); R21 the
`429`'d poll re-arms behind `_pollTimeMs` and counts toward `HttpErrorState` (`HttpCommunicator`
`code >= 401 && code != 500`); R22 `EngineJsonDef.validateThrow` wired at `GameMainAir.as:147`, failure
falls back to `global_0.sol`; R23 `lobby.ts:435,442` `404` on a missing lobby/member, and `LobbyTxn`
sets `resendOnFail`. R1 extended — `Credentials.checkValidity` requires a **truthy** `userId`, so `0`
fails login. R8 note records the dead `HttpRequest` timer (`new Timer(5000,1)` at `:35`,
`INTERNAL_TIMEOUT_STATUS = 999` at `:19`, `timer.stop()` at `:174`, **no `timer.start()` anywhere**).
"Keeping this current" gains the mechanical client-`PATH`-constants vs mounted-routers sweep that would
have found `/services/iap/info`. De-duplication: roadmap rows and the audit plan now link R-numbers
instead of restating them.

### Corrected the audit of what the game requires of this server

Two independent reviews went over the requirement list published a few days ago. They withdrew one
finding entirely and corrected several others, so the list now says something different in places.

**The withdrawn one:** we had recorded that the server fails to compare the two players' end-of-turn
checksums, leaving a desynchronised battle unnoticed. That was wrong twice over. The games compare the
checksums themselves and end the battle when they disagree — and the server never stored them in the
first place, so the check we described as "free" would actually need new bookkeeping. What is genuinely
missing is only that the server has no record of *why* a battle ended, which is a logging improvement
rather than a missing safety net.

**The guidance was backwards.** We had written that a request the game will keep re-sending should be
answered with a "that's final" code. That stops the endless retrying but leaves the player looking at a
stale screen, because it is the *success* answer that refreshes their roster and renown. The original
2013 server simply made these actions safe to repeat and answered success either way. That is now the
first recommendation, with the "that's final" codes as the fallback.

**And the retirement double-refund was mis-explained.** We blamed a database write that half-succeeded.
That cannot happen — the write is a single indivisible statement. The real cause is two copies of the
same request overlapping, each seeing the unit still present and each paying the refund. This matters
because it means the already-planned change that stops retirement refunding anything removes the
problem completely.

Smaller corrections: the game pauses between status checks by an amount that varies by screen — half a
second around chat, one second in battle, two on the matchmaking screen, three otherwise — so an older
note saying "about every two seconds" was right for the screen it was written about, not wrong. Several
counts were off, and the measured evidence is now described as strong support rather than proof, since
three of eighty-six observations were unexplained.

No behaviour changes here; this corrects documents and a set of issues.

*Technical:* R15 flipped BROKEN → HOLDS in `docs/client-contract.md` (clients compare via
`BattleFsm.handleSync`, `BattleFsm.as:336-361`; `/battle/sync` stores nothing — only move/action data
reach `battle.turns`); #165 re-scoped to observability. R10 rewritten: fix order is idempotent-`200`
first (precedent `UnitRetireSvc.java`), `400`/`403`/`409` second, and **never `501`** (it is `>= 500`,
hence retryable); 23 `resendOnFail` assignments = **25** concrete classes (`BattleTxn_Base` is
abstract); `rename` charges renown and does *not* opt in; `abort()` bounds `BattleTxn*` but nothing
bounds the 11 menu-driven txns; new instances `app.ts` `501` (fixed), `Battle.ts:426`, `/services/iap/info`.
R7 rewritten with the per-subsystem poll gaps (`resetPollTime` min-wins) and the "worst-case latency =
the gap" claim withdrawn (`checkPoll` restarts an unsent poll). 429 cause corrected to the
re-arm-without-in-flight-guard path. R5 notes `SessionSteamOverlayTxn` as the working precedent and the
segment-index frame. R2/R11 corrected to `team`, not `user`. `roster.ts` 500-count 9 → 8. #144
re-scoped and folded into #164. Same updates in `.claude/rules/gotchas.md`,
`misc/Plan-Client-Contract-Audit.md`, `misc/Plan-Master-Roadmap.md`.

### Stopped a Discord login from putting the game into an endless retry loop

After a Discord login the game holds a signed token that it has to trade for a session key
before it can call game routes. If it called one too early, we answered "not implemented".

That answer was the problem. The game automatically re-sends any request that comes back as a
server error, every couple of seconds, and **never stops trying** — so a token that hadn't been
traded yet didn't produce one failed request, it produced an endless stream of them for as long
as the game stayed open, all of them failing the same way. Because this sits in the Discord
login path, it was reachable by any Discord player, not an obscure corner.

The server now answers with a code the game accepts as final, so it asks once, learns it needs
to trade the token first, and stops. The message to the client is unchanged in meaning.

*Technical:* `app.ts` session-gate fallthrough `sendStatus(501)` → `sendStatus(409)` for the
valid-JWT-but-no-session case. `501` was retryable because `HttpAction.canRetry`
(`HttpAction.as:346`) retries on `0`, `404`, and anything `>= 500` with no attempt cap; `409`
is not retried. No change to `shouldProcessResponse` behaviour (that keys on `404` only) or to
`HttpCommunicator`'s error-state accounting (both codes are `>= 401`). Docs updated in
`FAQ.md`, `error-handling.md` (numbered list, code table, per-code section, heading),
`ARCHITECTURE.md`, `HISTORY.md`, `serverEndpoints.md`. Found by the client-contract audit;
the general rule is `docs/client-contract.md` → R10 (#164).

### Wrote down what the game program actually requires of this server

The game program now has its own documentation describing how it really behaves. We had absorbed that
material into our own documents as cross-links, but never checked our **code** against it — every
change made before the client was documented rested on guesses about it that couldn't be verified at
the time.

This checks all eighteen of those requirements one at a time and records the result. Twelve are met,
five are not, and one can't yet be decided. The most consequential discovery: **the game re-sends a
failed request by itself, every one to two seconds, with no limit on attempts** — whenever our answer
is "no response", "not found", or "server error". Twenty-three kinds of request do this, including
every one that spends or refunds renown. Two things follow. A route we haven't built yet answering
"not found" puts the game in a permanent loop asking for it, which `/services/tourney/join` does
today. And a request that changes something must survive being sent twice, because a reply that never
reaches the game looks exactly like a failure — which turns out to be a likelier cause of the
known double-refund-on-retirement bug than the rare mistimed double-click it was blamed on.

Also found: we store both players' end-of-turn "are we still in sync?" numbers and never actually
compare them, so a desynchronised battle goes unnoticed even though the check would be free; and two
Discord players who happen to share a derived player number are told they're "already in the queue"
when the other one is waiting, and can never be matched together.

Nothing about how the server behaves changes in this release — the corrections here are to documents
and one code comment. Each real problem now has its own issue and a place in the roadmap.

*Technical:* new `docs/client-contract.md` (18 requirements, R1–R18, with status and evidence) and
`misc/Plan-Client-Contract-Audit.md`. Retry rule (`HttpAction.canRetry`, `HttpAction.as:346`;
`resendOnFail` on 23 txn classes) added to `.claude/rules/gotchas.md` and indexed in `docs/FAQ.md`.
Corrected the poll-cadence and timeout-body prose in `docs/ARCHITECTURE.md` and
`docs/serverEndpoints.md` and the load-bearing note in `src/services/auth/accountId.ts` (comment only).
Measured against a captured 2-player battle: 86 polls started, 73 (85%) held the full 5 s, 6 (7%) `429`
— confirming the 5 s hold in `game.ts:98` is correct. Tracking down why that contradicted the client's
documented 3 s "request timeout" established R7: the value is a **pre-send delay**, not a timeout
(`HttpCommunicator.as:135` → `HttpAction.send`'s `param3`, which starts a timer and returns without
sending, `HttpAction.as:106-114`) — so the client sleeps 3 s between polls, 1 s in battle. Our old
"~2 seconds" was right in kind; the May 2026 review's "instant 0-backoff reconnect"
(`Codebase-Review-Findings-2026-05-07.md:78`) is wrong and is superseded. Timeout returns `[]`, not an
empty body. Roadmap rows added for R1/R4/R9/R10/R15; #144 and #140 rows re-scoped.

### Faster leaderboard, and a dead table finally removed

The leaderboard shows every player's standing for a given ladder. Until now the database had no shortcut for "give me everyone in ladder N", so it read through the entire rankings list each time — fine today, but slower as more players are recorded. This adds that shortcut so the lookup jumps straight to the rows it needs.

It also removes an old, unused `battles` table that nothing has written to since early on — a newer, richer battle-history table long ago replaced it. The empty table lingered only so old databases wouldn't error at startup, and mostly just confused anyone reading the schema into thinking it was still used. A one-time database upgrade drops it (and its two leftover indexes) automatically the next time the server starts.

*Technical:* new migration `003_leaderboard_index_and_drop_legacy_battles.sql` adds `idx_ranking_tourney` on `ranking(tourney_id)` and drops `idx_winner`/`idx_loser` + the `battles` table; removed the inline `battles` CREATE from `connection.ts` and the two `DELETE FROM battles` cleanups in `connection.test.ts`; new `migrations.test.ts` runs the full chain on an in-memory DB and asserts the index exists, `battles` is gone, and `EXPLAIN QUERY PLAN` for the leaderboard read uses the new index — EXPLAINing the shared `LEADERBOARD_RANKING_QUERY` constant (new `leaderboardQuery.ts`) that `buildLeaderboards()` also runs, so the test guards the exact production query. Docs reconciled across `schema.sql`, `database-schema.md`, `database-migrations.md`, `ARCHITECTURE.md`, `Deployment.md`, `src/db/README.md`, `CLAUDE.md`, `battles.ts`. Closes #145.

### Cleaner, safer follow-ups to the player-number fix

A review of the recent player-number change (#156) turned up refinements and one pre-existing bug worth writing down. None of this changes what players see in this batch — it's naming, guardrails, comments, and a newly filed bug.

- The shared player-number helper is now **named for what it actually is** — the Steam-only rule — so it can't be mistaken for a universal converter. That mistake is exactly what leaves Discord players showing as a generic "Player &lt;number&gt;" placeholder on the leaderboard instead of their real name; that bug is now filed as #159 and flagged right in the leaderboard code (this change documents and labels it — the real fix, storing each player's number on their account, is tracked in #159).
- The "close your older login" bookkeeping no longer offers a shortcut that could silently corrupt data: callers must now hand it the exact login ID, so a future caller can't accidentally key a player's saved data off a rounded-down number.
- A comment that wrongly implied the game client re-derives the player number itself (it doesn't — the server hands it the number) was corrected, and a stale test name was fixed.

*Technical:* renamed `accountIdFromUserId` → `accountIdFromSteamId` across `accountId.ts`, `auth.ts`, `db/leaderboard.ts`, `accountId.test.ts`, and `.claude/rules/gotchas.md`; made `external_id_str` a required parameter of `sessionHandler.addSession(user_id, external_id_str)` (dropped the `= String(user_id)` default; updated the test call-sites); reworded the `accountId.ts` "load-bearing" header (the real lock is stored `ranking.account_id` rows + the leaderboard name-join, not client-side entity hashing — both battle clients receive the server's value) and the `loadNameMap` comment in `db/leaderboard.ts` (now marks the Steam-only derivation as bug #159); renamed the now-misnamed `auth.test.ts` eviction test. Related: filed #159; added a cross-provider note and root-cause pointer to #140.

### Two Discord players can no longer log each other out

Every player gets a small in-game "player number" derived from their much longer login ID. Different Discord accounts can end up with the same player number, because only the tail end of the long Discord ID is used to build it. The server treated a matching player number as "this same person logged in again" and closed the older login — so two unrelated players who happened to share a number could knock each other offline, over and over, without either understanding why. The check that screens Discord IDs also accepted the nonsense ID "0".

The "close your older login" check now compares the full original login ID, which is truly unique per account, so only a genuine re-login by the same person closes the old session. IDs that aren't positive numbers are now refused at both Discord login doors. And the player-number math itself — previously copy-pasted in three files that had to be kept identical by hand — now lives in a single shared file, with tests proving it gives exactly the same answers as before (the math is deliberately left byte-identical: every saved ranking row and the game client's battle bookkeeping depend on its exact rounding).

What this deliberately does not fix (#140 stays open): two accounts sharing a player number still share the deeper things keyed on it — the same saved-stats row and the same identity inside a battle. The real fix is the server assigning its own player numbers, planned as part of the cross-play design.

*Technical:* new `src/services/auth/accountId.ts` (`STEAM_ID_BASE`, `accountIdFromUserId`, `accountIdFromSnowflake`, `isValidSnowflake` — rejects `"0"`/non-positive); `auth.ts` `addSession(user_id, external_id_str)` now dedupes/evicts on `external_id_str` and owns setting it; `discord.ts` uses the shared helpers at both the OAuth callback and `POST /session`; `src/db/leaderboard.ts` imports the shared `accountIdFromUserId`. Tests: `accountId.test.ts` (parity with the old inline math), `auth.test.ts` (eviction by exact id; no eviction on derived-id collision), `discord.test.ts` (`"0"` rejected; colliding Snowflakes co-exist). Closes #146; mitigates #140 (residual documented there).

<!-- archive-footer -->

## Older history

Everything up to and including the 19 June 2026 update lives in
[`docs/changelog-archive/CHANGELOG-2026-H1.md`](docs/changelog-archive/CHANGELOG-2026-H1.md) —
releases 0.1.0 through 0.7.0. It was split out because this file had grown to 228 KB, most of which
nobody reads day to day. Nothing was reworded on the way across.
