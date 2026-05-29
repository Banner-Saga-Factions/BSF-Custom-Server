# Contributing to BSF Custom Server

This is the single source of truth for local development, testing, the git workflow,
coding standards, and the memory-management rules that keep the server stable on a
1 GB-RAM host.

If you only want a 60-second project overview, start with [README.md](README.md).
If you want to run the server, follow this file.

> **Last verified against branch:** `RichardElTaino-MVP_documentation-Phase1`

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | `>=24` | Matches the `node:24-alpine` image used in production. Required for the built-in `node:sqlite` module. *(`package.json` `engines` currently says `>=23.4.0` — that field is stale and should be bumped to `>=24` to match the Dockerfile.)* |
| **Yarn** | any recent v1.x | `npm install -g yarn` |
| **Git** | any | |
| **SQLite tooling** | not required | DB driver is built into Node — no native binaries, no `sqlite3` install. |

> **No MySQL.** Older docs reference MySQL — that has been replaced by SQLite via
> `node:sqlite`. Ignore any setup step that asks you to `CREATE DATABASE` or load
> a `.sql` file.

The game client (Adobe AIR bundle, no separate runtime install) is on the
[latest GitHub release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/latest).

---

## 2. Quick Start

The repo is a monorepo with two top-level folders: `bsf-server/` (this Node server) and `bsf-client/` (a git **submodule** pointing at the game-client repo). All the `package.json` / `Dockerfile` / source you will touch lives inside `bsf-server/`.

```bash
# Server-only — submodule not needed
git clone https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
cd BSF-Custom-Server/bsf-server
yarn install
cp .env.example .env
```

If you also need the client source, clone with submodules instead:

```bash
git clone --recurse-submodules https://github.com/Banner-Saga-Factions/BSF-Custom-Server.git
# or, if you already cloned without --recurse-submodules:
git submodule update --init
```

Edit `.env` and set **`JWT_SECRET`** — the server exits at startup if it is
missing or empty. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then build and start:

> **Path note:** Replace `$env:USERPROFILE\Code\BSF\bsf-server` with your actual clone path if different.

```powershell
cd $env:USERPROFILE\Code\BSF\bsf-server ; yarn build ; .\start-server.bat   # builds, kills any stale node, starts fresh
```

The server listens on `http://localhost:8082`.

On macOS / Linux use the equivalent shell script:

```bash
./start-server.sh       # builds, kills any stale node process, starts fresh
```

Or for hot-reload during development: `yarn dev`.

The SQLite database (`./data/bsf.db` by default) is created on first boot
along with all tables — no manual schema step.

---

## 3. Required Data Files

The server reads three JSON files **at module load time**. If any is missing,
`src/services/auth/auth.ts` throws and the process crashes before listening:

| File | Purpose |
|---|---|
| `data/build-number` | Returned in the login response as `build_number` |
| `data/first.json` | Pushed to every client on first long-poll (currency, friends) |
| `data/accounts.json` | Username lookup fallback for unknown `user_id`s |

These are tracked in the repo. Do not delete them. Edits to any of them require
a **full server restart** — `yarn dev` hot-reload picks up `.ts` changes only,
not the cached JSON.

---

## 4. Running Tests

The suite uses Vitest + Supertest. **All tests mock the DB layer**, so no
database, no `.env`, and no running server are needed.

```bash
yarn test            # full run (~3s)
yarn test:watch      # re-run on save
yarn test:coverage   # adds an HTML coverage report
yarn test:ci         # verbose + coverage (used by CI)
yarn test:db         # opt-in DB-integration tests against a real :memory: SQLite
```

Coverage thresholds enforced by CI: **70% lines, 70% functions, 60% branches**.

If a clean checkout fails before you have changed anything, double-check
`node --version` is `>=23.4.0` and that `yarn install` finished cleanly.

### 2-Player Smoke Test

With the server running:

```powershell
cd $env:USERPROFILE\Code\BSF\bsf-server ; .\test-2p-match.bat
```

This logs in two test accounts (`test` / `Pieloaf`), queues both, and asserts
the same `battle_id` reaches both via long-polling. A `[FAIL]` at step 5 is
almost always a power-level mismatch — both parties must have the same total
`(RANK - 1)` sum. Watch the server console for `[MATCHMAKING]` lines.

For a full in-game test use `launch-game-2p.ps1` (Windows + game client
required; the script's `--versus_start --versus_countdown 0` flags are
mandatory for 2-on-one-PC — see [`.claude/rules/gotchas.md`](.claude/rules/gotchas.md)).
See [docs/Development.md § Manual Testing](docs/Development.md#manual-testing)
for single-client, 2-player, long-Steam-ID, Cloudflare-tunnel, and
DuckDNS/GCP launch-flag variants.

---

## 5. Git Workflow

### Sync main before you branch

Always pull the latest `main` before creating a branch. (`main` is the official
"good" copy of the project that everyone's work eventually lands on.)

```powershell
cd $env:USERPROFILE\Code\BSF
git checkout main
git pull origin main
git checkout -b feature/<short-name>
```

`git checkout` switches you to a different branch; `git pull` downloads any
new commits that have landed on `main` since you last looked; `git checkout -b`
creates a new branch starting from wherever you are right now (which, after
the pull, is the freshest `main`).

If you forgot and already created your branch off an older `main`, run
`git rebase main` from your branch. "Rebase" means: take the commits you've
made on this branch and re-apply them, one by one, on top of the latest `main`
— as if you'd branched from the new tip in the first place.

### Branching

Branch names should describe what the branch is for. Use a prefix that signals
the kind of work:

```powershell
cd $env:USERPROFILE\Code\BSF\bsf-server

git checkout -b feature/<short-name>      # new functionality
git checkout -b fix/<short-name>          # bug fix
git checkout -b docs/<short-name>         # documentation only
# example
git checkout -b Plan-Integrate-Original-Stoic-Server_phase_M3
```

### Stacked PRs (when one PR depends on another)

A "stacked PR" is a pull request whose branch was created from another
in-progress branch instead of from `main`. The second PR depends on the
first — its diff only makes sense once the first one lands.

Default behaviour: **don't stack.** Branch off `main` and wait for the first
PR to merge before starting work that depends on it. This avoids the failure
modes covered in [Merge strategy](#merge-strategy-always-use-a-merge-commit)
and [Recovery cookbook](#recovery-cookbook).

When you genuinely need to keep working while the first PR is in review:
- Pick a branch name that makes the dependency obvious. For example, if your
  work depends on `feature/login-page` (a PR already in review), name your
  branch `feature/login-page-tests` or `feature/login-page-error-handling` —
  **not** `feature/M3` or some other generic milestone name that hides which
  earlier branch you built on top of. Future-you, returning two weeks later,
  will thank present-you.
- In the second PR's description, write `Depends on #N` on its own line,
  where `#N` is the first PR's number. Reviewers look for this.
- The moment `#N` merges, run `git fetch ; git rebase origin/main` on your
  stacked branch. Rebasing here drops the commits that are now part of `main`
  and leaves only the work that's new in your second PR. Then
  `git push --force-with-lease` to update the PR.

### Pre-commit hook

This repo runs `yarn build && yarn test` automatically every time you make a
commit. The mechanism is `simple-git-hooks`, installed by `yarn install` via
the `prepare` script. If either the build or any test fails, the commit is
blocked and your work stays in your working tree — nothing is lost, you just
can't commit until you fix the failure.

You can bypass the hook with `git commit --no-verify`. **Don't, except in
true emergencies.** The same checks run in CI (continuous-integration —
GitHub's automated check that runs against every PR) on push, and will fail
there too. Bypassing locally just moves the problem to the PR.

### Commit messages

**Always quote commit messages with single quotes** so the same line works in
bash, zsh, cmd.exe, and PowerShell:

```bash
git commit -m 'fix: guard battle exit against null opponent'
git commit -m 'feat: evict idle sessions after 30 minutes'
```

Write the subject (the first line) in plain English — *what* changed and
*why*, not which functions were touched. A non-coder reading the line should
understand the change. Put file names and function names in the body (the
lines after a blank line below the subject), where engineers and AI agents
can still grep for them.

Good:
```
Fix crash when exiting a battle after the opponent disconnects

Battle exit route was not guarded against a null opponent reference.
Affected: src/services/battle/battleRouter.ts
```

Avoid: `feat: fix null ref in battleRouter.ts exit handler`

Use a conventional prefix (`fix:`, `feat:`, `chore:`, `docs:`) only when it
genuinely adds clarity, never at the expense of plain-English meaning.

### Force-push policy

A "force push" overwrites the version of a branch on GitHub with whatever's
on your local machine, even if the two have diverged. Plain `git push --force`
overwrites unconditionally — including any commits a collaborator pushed
since you last fetched. Their work is silently lost.

Rules:
- **Use `--force-with-lease` instead of `--force`.** The `--with-lease`
  variant checks that the branch on GitHub still matches what you last saw
  locally. If someone else pushed in the meantime, the command refuses and
  you get a chance to fetch and review their work before overwriting.
- Force-pushing is **allowed on your own feature branches**. Two common
  reasons:
  - *You want to tidy up before opening a PR* — for example, you spotted a
    typo right after committing, fixed it in a tiny second commit, and now
    want to combine the two into one clean commit. That combining step
    changes your branch's history, so the push that follows needs
    `--force-with-lease`.
  - *New commits landed on `main` while your branch was in review*, and you
    want to rebase your branch on top of them so the diff stays focused on
    your actual change. Rebasing also rewrites your branch's history, so
    the push needs force.
- Force-pushing to `main` is **blocked by branch protection** (a GitHub
  setting that rejects the push at the server). Don't try to disable this.

### Pull requests

A pull request (PR) is the GitHub interface where you propose merging a
branch into `main`. The PR is also where code review happens.

1. Push your branch and open a PR against `main` (GitHub's "Compare & pull
   request" button appears automatically after a push).
2. CI must be green — `yarn build` and `yarn test:ci` pass on GitHub's
   runners. Red CI blocks merging.
3. In the PR description, explain **what changed and why**, not how, in plain
   English a non-coder could follow. Link any related issue with
   `Closes #N` or `Refs #N`.
4. If you changed behaviour visible to the game client, run
   `test-2p-match.bat` locally and paste the `[OK]` block into the PR
   description. This is the closest thing we have to an end-to-end smoke
   test.
5. If you moved or deleted any file, run the grep from
   [Path-citation audit](#path-citation-audit-when-moving-or-deleting-files)
   and confirm no stale citations remain.

A PR template (`.github/pull_request_template.md`) pre-fills these as
checkboxes when you open a PR — tick each box honestly.

### Linking PRs to issues (closing keywords)

You can link a PR to a GitHub issue from the PR description. The link shows
up as a "pill" on both the PR and the issue. Two variants:

- **`Refs #42`** (or just `#42` anywhere in the description) — creates the
  link only. Doesn't change the issue's state. Use when the PR touches an
  issue but doesn't fully resolve it.
- **`Closes #42`** — creates the link **and** auto-closes the issue when the
  PR merges into `main`. No manual click needed.

`Closes` is one of nine closing keywords GitHub recognises:

```
close   closes   closed
fix     fixes    fixed
resolve resolves resolved
```

Three caveats:
- Only triggers when the PR merges into the repo's **default branch** —
  `main` for this repo. Merging into any other branch creates the link but
  does **not** close.
- The keyword is case-insensitive — `Closes #42`, `closes #42`, `CLOSES #42`
  all work.
- For an issue in a different repo, use `Closes owner/repo#42` (rarely
  needed here).

### Merge strategy: always use a merge commit

When you click GitHub's green merge button after review, there are three ways
the work could land on `main`:

- **Merge commit** — your branch's commits go onto `main` as-is, plus one
  extra "merge" commit that ties them together. **This is the only option
  this repo allows.**
- **Rebase merge** — copies your commits onto `main` with *new IDs*. Disabled.
- **Squash merge** — collapses all your commits into a single commit on
  `main`. Disabled.

The merge button only shows the first option, so there's no decision at
click-time. This is configured under **Settings → General → Pull Requests**
in the GitHub UI.

**Why we don't use rebase merge.** Every git commit has a unique ID (a
40-character hash). When GitHub does a rebase merge, it copies your commits
onto `main` *with new IDs*. If you had a second PR stacked on the first (see
[Stacked PRs](#stacked-prs-when-one-pr-depends-on-another)), that second PR
still points at the *old* IDs from before the rebase. Git can't tell the work
has already landed under different IDs and shows fake conflicts. This bit us
twice in May (PRs #85 and #87) — both required manual rescue and an afternoon
of debugging.

**Tradeoff.** `git log --graph` shows small "merge bubbles" (a sideways
branch loop) instead of one straight line. `git bisect` — the tool that
finds which commit introduced a bug by binary-searching through history —
may have to skip one extra commit per merge bubble. Both are mild noise at
our current scale.

### Branch cleanup

After a PR merges, three pieces of leftover state can pile up: the remote
branch on GitHub, your local branch, and cached references to other
contributors' remote branches that have since been deleted ("stale remote
refs"). All three clutter `git branch -a` output if you let them.

Recommended hygiene:
- **Remote branch** — GitHub auto-deletes the source branch when the PR
  merges. This is enabled under **Settings → General → Pull Requests →
  "Automatically delete head branches"**. No action needed.
- **Your local branch** — delete with `git branch -d <name>` after the PR
  merges. The lower-case `-d` refuses to delete if the branch has commits
  that aren't on `main`, which protects you from accidentally throwing away
  unmerged work. Use the upper-case `-D` only when you're certain.
- **Stale remote refs** — `git fetch` automatically drops references to
  deleted remote branches once `fetch.prune=true` is set in your global git
  config.

Quick check: `git branch --merged main` lists every local branch whose work
is already on `main`. Everything in that list is safe to `-d`.

### Path-citation audit (when moving or deleting files)

If your PR moves or deletes a file, also search every other file in the repo
for any reference to the old path and update them — **in the same PR**,
before opening it for review. Otherwise the references quietly rot: readers
click the link and hit a 404, or follow a path on disk that no longer exists.
This bit us on 2026-05-16 when reference codebases were consolidated; stale
citations went uncaught for four days until they were noticed in PR #83.

Run this from the repo root so the search covers `bsf-server/`, the
`bsf-client/` submodule, and root-level files:

```powershell
git -C $env:USERPROFILE\Code\BSF grep -n "<old-path-substring>" -- "*.md" "*.ts" ":(glob)**/.claude/**/*.md"
```

What `git grep` does: searches every file tracked by git (so it ignores
`node_modules/`, `build/`, etc.). `-n` shows line numbers. The arguments
after `--` are "pathspecs" — patterns that restrict the search to certain
file types or paths. `:(glob)**/...` is git's own glob syntax — raw `**` is
shell-glob and does **not** expand here.

Doc surface this covers:
- All `*.md` repo-wide (`CHANGELOG.md`, `REFERENCE.md`, `bsf-server/docs/`,
  `bsf-server/misc/`, `bsf-server/CONTRIBUTING.md`, `bsf-server/CLAUDE.md`,
  root `CLAUDE.md`).
- TypeScript files (catches JSDoc `@see` and inline path comments).
- `.claude/rules/*.md` under any directory.

This step belongs in the "After Completing Changes" finish ritual
([CLAUDE.md](CLAUDE.md)) between manual test and docs update.

### Recovery cookbook

Three scenarios you might hit. Each starts with the symptom you'd see in
GitHub.

**Scenario 1 — "GitHub says my PR has conflicts but I haven't touched anything."**

The bottom of a stack was just merged, and your branch is now slightly out
of date with `main`. With `rerere.enabled=true` set globally, git remembers
how you resolved similar conflicts before and auto-replays them. Run:

```powershell
git fetch origin                         # pull new commits from GitHub but don't apply them
git checkout <branch>                    # switch to your branch
git rebase origin/main                   # replay your commits on top of fresh main
git push --force-with-lease              # update the PR
```

"REuse REcorded REsolution" is what `rerere` stands for. Once enabled, it's
invisible: conflicts you've already solved by hand re-resolve themselves.

**Scenario 2 — "I have unstaged changes blocking a rebase / checkout."**

You're trying to switch branches or rebase, and git refuses because you have
edits in progress. "Stash" is git's name for "save my in-progress edits to a
temporary side-shelf, restore a clean working tree, then put them back later":

```powershell
git stash push -m "pre-rebase wip" --include-untracked   # shelve everything, including new files
# … your operation (rebase, checkout, etc.) …
git stash pop                                            # restore the shelved work
```

**Scenario 3 — "A PR stacked on a now-merged branch shows commits that are 'already in main' as still pending."**

This is the orphan-SHA case described in
[Merge strategy](#merge-strategy-always-use-a-merge-commit). Rare under the
merge-commit-only policy but possible if a contributor merged with the old
settings still active locally.

You need the SHA (commit ID) of the bottom branch's *original* tip — the
one that still exists in your local refs but no longer on `main`. Find it
either via:
- `git reflog show <parent-branch>` — git's local history of every move that
  branch has made, including the original tip before the merge replaced it;
  or
- The closed PR's "merged commit" link in the GitHub UI (under the green
  "merged" banner).

Then:

```powershell
git rebase --onto origin/main <old-tip-of-bottom-PR> <branch>
```

What `--onto` does: it takes every commit in `<branch>` that *isn't* an
ancestor of `<old-tip>` and replays them on top of `origin/main`. The orphan
commits (the ones whose new copies are already in `main` under different
IDs) get dropped.

---

## 6. Coding Standards

The server runs on a **GCP e2-micro (1 GB RAM)** in production. Every standard
below exists because we have hit the failure mode it prevents.

### 6.1 Memory management — non-negotiable

Two patterns are already in the codebase. New caches must follow one of them.

**Idle eviction** — `src/services/auth/auth.ts`:

```ts
// Sessions evicted after 30 minutes of inactivity
setInterval(reapIdleSessions, 5 * 60 * 1000).unref();
```

The TTL resets on every poll request and every `pushData` call. When a
mid-battle player is evicted, the opponent's TTL clock is also reset to
prevent cascading eviction. `.unref()` is required so the timer does not
hold the event loop open during shutdown.

**Periodic sweep** — `src/services/queue.ts`:

```ts
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;   // 5 min
// swept every 60 s
```

Rules for any new in-memory `Map` / `Record` that grows from client input:

- Implement either idle TTL (`auth.ts` style) or a fixed-age sweep (`queue.ts` style).
- Always call `.unref()` on `setInterval` / `setTimeout` you create at module scope.
- Have a clean-up path on every disconnect / timeout / error branch — never
  rely on the GC alone.
- Never `console.log` an entire battle or session object — they contain
  circular references and large `defs[]` arrays.

### 6.2 `accountData` is the in-session source of truth

`session.accountData` is populated at login and held in memory for the session
lifetime. DB writes (`saveParty()`, `saveRoster()`) are **fire-and-forget** —
reading back from the DB mid-session returns stale data. Mutate
`session.accountData` and let the DB catch up asynchronously.

### 6.3 32-bit `account_id` vs 64-bit Steam ID

`auth.ts` derives:

```ts
STEAM_ID_BASE = 76561197960265728
account_id    = Number(user_id - STEAM_ID_BASE)   // 32-bit
```

| Field | Width | Used in |
|---|---|---|
| `session.user_id` | 64-bit | DB rows, login, Steam |
| `session.account_id` | 32-bit | All battle messages: `party.user`, `team`, `user_id`, `aliveUnits` keys, DJB hash inputs |

Mixing them causes the client-side DJB hash to diverge at turn 0 and the game
shows a desync error. Pick the right one for the layer you are in.

### 6.4 TypeScript / language rules

- **No `var`.** `const` by default, `let` only when reassignment is needed.
- **`parseInt(value, 10)`** — always pass the radix.
- **Explicit null checks** (`val !== null`, `val !== undefined`) over truthy
  checks where `0`, `""`, or `false` are valid.
- **Wrap every DB call in `try / catch`.** Clean up in-memory state before
  returning a 500.
- **No `any`.** Type DB rows via the helpers in `src/db/*` (`AccountRow`,
  `BattleRow`).

### 6.5 Logging

Use the established prefixes so log greps keep working:

```
[BATTLE] ...
[MATCHMAKING] ...
[AUTH] ...
[QUEUE] ...
```

`console.log` is fine for now — there is no logger framework. Do not add one
without discussing first.

---

## 7. Doc ↔ Code Cross-Reference

When you change one of these areas, update the matching doc in the same PR.

| Doc | Code area |
|---|---|
| [README.md](README.md) | Top-level scope, prerequisites, quick start |
| [CONTRIBUTING.md](CONTRIBUTING.md) (this file) | Local dev workflow, testing, coding standards |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | `src/index.ts` (routing), `src/services/auth/auth.ts`, `src/services/game.ts`, `src/db/*` |
| [docs/serverEndpoints.md](docs/serverEndpoints.md) | All `/services/*`, `/login/discord/*`, `/health`, `/debug/*` route handlers |
| [docs/gameFlow.md](docs/gameFlow.md) | `src/services/queue.ts`, `src/services/battle/Battle.ts`, `endgame()` |
| [docs/dataStructures.md](docs/dataStructures.md) | `src/services/battle/BattlePartyData.ts`, `BattleTurnData.ts`, wire formats |
| [docs/Development.md](docs/Development.md) | Steam launch flags, Fiddler captures, IDE setup, debug recipes |
| [CHANGELOG.md](CHANGELOG.md) | Any user-visible change |
| [docs/HISTORY.md](docs/HISTORY.md) | Original Stoic stack, MySQL era, decommissioned subsystems |
| [Plan-ServerSetupAndDeployment.md](Plan-ServerSetupAndDeployment.md) | `Dockerfile`, `docker-compose.yml`, Caddy config, GCP runbook |

---

## 8. Where Things Live

```
bsf-server/
├── src/
│   ├── index.ts                      # Express app + session middleware
│   ├── const.ts                      # Protocol enums (ServerClasses, GameModes)
│   ├── db/
│   │   ├── connection.ts             # node:sqlite, WAL mode, query helpers
│   │   ├── account.ts                # upsertAccount, addRenown, saveParty, saveRoster
│   │   ├── battles.ts                # saveBattleResult
│   │   └── schema.sql                # DDL — informational; auto-applied by connection.ts
│   └── services/
│       ├── auth/
│       │   ├── auth.ts               # Session, sessionHandler, idle eviction
│       │   └── discord.ts            # Discord OAuth (incomplete — returns 501)
│       ├── battle/
│       │   ├── Battle.ts             # Battle state, endgame, renown
│       │   ├── BattlePartyData.ts
│       │   └── BattleTurnData.ts
│       ├── queue.ts                  # Matchmaking + 5-min queue sweep
│       ├── game.ts                   # Long-poll delivery
│       ├── chat.ts
│       ├── account.ts
│       └── download.ts
├── data/                             # build-number, first.json, accounts.json, acc.json, lboard.json
├── docs/                             # ARCHITECTURE, gameFlow, serverEndpoints, dataStructures, etc.
├── Dockerfile                        # node:24-alpine
├── docker-compose.yml                # app + caddy + db-data volume
└── package.json                      # engines.node = ">=23.4.0"
```

---

## 9. Common Gotchas

**Stale build.** `yarn dev` does not rebuild the compiled `build/` directory.
If you are running `start-server.bat` or `node build/index.js`, run `yarn build`
first. This is the single most common "my change isn't working" cause.

**`first.json` and friends are cached at module load.** Any edit to a JSON
file in `data/` requires a full restart, not a hot-reload.

**Session key `"11"` is a hardcoded login bypass — not a bug.**
`POST /services/auth/login/11` is how the game client logs in; any other path
segment is treated as a real session key and rejected if it does not match.

**Blank units in battle = missing `name` in `data/acc.json`.** Every
`EntityDef` must have a `name` property; the client silently renders blanks
otherwise.

**Discord OAuth returns 501.** The session-exchange step is not implemented.
The login route exists end-to-end but a 501 at the callback is expected.

**MQTT is in `dependencies` but not used.** `async-mqtt@^2.6.3` is installed
because earlier prototypes used it; no source file imports it today.
Do not add MQTT use without a discussion in an issue first.

---

## 10. Reference Codebases (optional)

Some areas of this project — the client/server wire protocol, porting features from Stoic's original server, decompiled-client lookups — lean on four read-only reference codebases that live **outside the repo** at `%USERPROFILE%\Code\bsf-refs\`. **This setup is only needed if you plan to work in those areas.** Most contributors can skip it.

Per-directory purpose and the "prefer 2013 source over decompile, with 12 stale exceptions" rule are documented in the [repo-root CLAUDE.md](../CLAUDE.md#reference-codebases).

### What to set up

| Directory | What it is | Source |
|---|---|---|
| `bsf-refs\server-2013-java\` | Stoic's original 2013 Java server (175 .java files, MySQL schema 88, Maven `pom.xml`) | Public GitHub repo [stoicstudio/tbs-factions-2013](https://github.com/stoicstudio/tbs-factions-2013) |
| `bsf-refs\client-2013-as3\` | Stoic's original 2013 ActionScript client (385 .as files) | Nested as `tbs-2013/` inside the same GitHub repo above |
| `bsf-refs\client-swf-and-ane\` | Raw shipped SWF + ANE extracts (build inputs to the decompile) | Your own Steam install — extracted per [Plan-Extract-Client-Source-Code.md](misc/Plan-Extract-Client-Source-Code.md) |
| `bsf-refs\client-decompiled-as3\` | JPEXS decompile of the shipped SWF (1,113 .as files) | JPEXS export of the SWF above |

### Setup — 2013 sources

One clone plus one move (to un-nest the client into its own peer directory):

```powershell
git clone https://github.com/stoicstudio/tbs-factions-2013.git $env:USERPROFILE\Code\bsf-refs\server-2013-java
Move-Item $env:USERPROFILE\Code\bsf-refs\server-2013-java\tbs-2013 $env:USERPROFILE\Code\bsf-refs\client-2013-as3
```

After this, `bsf-refs\server-2013-java\` holds the Java server (under `src/main/java/tbs/srv/...`) and `bsf-refs\client-2013-as3\` holds the AS3 client (under `game/code/client/lib.engine.core/src/` and `lib.game/src/`).

### Setup — SWF and decompile

Follow [misc/Plan-Extract-Client-Source-Code.md](misc/Plan-Extract-Client-Source-Code.md) end-to-end. The plan documents copying the SWF from your Steam install into `%USERPROFILE%\Code\bsf-refs\client-swf-and-ane\` and JPEXS-exporting the AS3 to `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\`. About 20 minutes including JPEXS install.

### What you cannot redistribute

The shipped SWF (`app.game.air.swf`) and its decompile are Stoic's commercial intellectual property. Each contributor must extract their own from their own legally-owned Steam install. **Do not commit these files into any public repo, attach them to a GitHub release, or post them in public chats.** The Plan-Extract document above exists precisely so every contributor derives their own copy.

The 2013 source repo is published on Stoic's own GitHub — no restriction there.

---

## 11. Where to Go Next

| Doc | What's in it |
|---|---|
| [README.md](README.md) | Project overview, scope, quick start |
| [docs/Development.md](docs/Development.md) | Full debug recipes, IDE setup, Steam launch flags, internet-test |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, request flow, design decisions |
| [docs/serverEndpoints.md](docs/serverEndpoints.md) | HTTP API reference + transport (long-poll vs JSON) |
| [docs/gameFlow.md](docs/gameFlow.md) | Battle lifecycle, matchmaking, endgame |
| [docs/dataStructures.md](docs/dataStructures.md) | Wire-format payloads |
| [CHANGELOG.md](CHANGELOG.md) | Release history + root-cause notes |
| [docs/HISTORY.md](docs/HISTORY.md) | Original Stoic stack and the MySQL era |
| [docs/Deployment.md](docs/Deployment.md) | GCP e2-micro deploy runbook |

---

*Last updated: 2026-05-05*