# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A custom server reimplementing the backend for **The Banner Saga Factions** (a defunct multiplayer turn-based strategy game). The game client is an Adobe AIR/Flash app that communicates with this Express server over HTTP long-polling. All client protocol details were reverse-engineered from recordings of the original servers made in 2022. Those recordings are a **download**, not part of a copy of this repository — get them from the [`reference-captures` release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/tag/reference-captures) and unpack **each into its own folder** under `data/game_captures/extracted/`, as [`docs/Development.md`](docs/Development.md#official-fiddler-captures) explains. Unpacking two of them into the same place silently mixes two different recording sessions, and one of them overwrites a file this repository keeps on purpose.

## Start-of-Session interview

At the **start of every new plan chat**, before doing other work, interview user in-deph using askuserquestion tool and focus on pulling out and clarifying any ambiguities.

## Working Style

**Every action falls in one of three buckets, by how far its effects reach.** *Does its effect leave this machine?* That is **REACH**, and any `gcloud` or live-server `curl` counts. *If not, does it change anything, inside the repository or outside it?* That is **CHANGE**. Neither is **LOOK**: a read changes nothing, so `gh issue view` is a look even though it asks GitHub.

| Bucket | Examples | What happens |
|---|---|---|
| **LOOK** | `git log`, `grep`, `wc`, `Read`, `gh issue view` | Runs immediately with its one-line description |
| **CHANGE** | `git commit`, a `sqlite3` write | One-line gloss — what it does / what it changes / how to undo — then `y` |
| **REACH** | `git push`, `gh pr create`, `curl` at the live server, any `gcloud` | Gloss **plus what it makes public**, then `y` |

**Gloss every command that changes something, not only the ones that edit files** — the rule this replaced gated only file-modifying calls, so a `git push` or `gh pr create` never needed a `y`.

**For file edits, a third question sets how much explanation comes first: *does it touch `src/`, or anything else that runs?*** Edits under `docs/`, `misc/` and `.claude/rules/` are the one kind of CHANGE with no `y`: they are explained inline as they are made. Edits to anything that runs — `src/`, `test/`, `deploy/`, scripts, `package.json`, the `Dockerfile`, `docker-compose.yml`, any `.env*` file — and **any `.claude/` settings file, hook script or command file** get the full treatment before the `y`: **what it does**, **why we need it**, **any tradeoff or risk**, in plain English a non-programmer can follow. Those `.claude/` files sit on this side because they are code in all but location: a settings file decides what may run without asking, a hook runs without anyone asking (see #264), and a command file can do both, through the settings at its top, once it is run. The user replies **y** to approve and **n** to decline, and each new batch of changes needs its own `y`, even after an earlier "go ahead".

**This section steers what a session tries; the `ask` rules in the settings files are what Claude Code enforces.** They make the common REACH commands prompt even in auto mode, so do not trim them to save a prompt.

**Write shorter, in the same plain voice.** A new `CHANGELOG.md` entry gets about **120 words** plus its existing `*Technical:*` line; anything longer goes on the issue instead. A new pull-request body gets about **250 words**. The cap exists because new prose written to correct `docs/client-contract.md` brought about **3.8 errors per 100 lines** whatever its format, so length is a source of errors, not only a cost to the reader. Existing entries and bodies are not rewritten to fit.

## The backlog, and how work moves

**The live backlog is the public [BSF Roadmap board](https://github.com/orgs/Banner-Saga-Factions/projects/3).** Pick from its [Now](https://github.com/orgs/Banner-Saga-Factions/projects/3/views/4) view, top first. Priority stays as the `P0`–`P3` labels, which say how bad a thing is if nobody fixes it, not when it will be done. [`misc/Plan-Master-Roadmap.md`](misc/Plan-Master-Roadmap.md) only explains the order and where its old table went.

- **One item in progress at a time** — one wave, one chat, one pull request.
- **Process work waits while a v1.0 issue is open and unstarted.** Tidying documents, rules and tooling is real work and it is allowed — but it always has an obvious next step where product work needs a decision first, so it wins by default unless this rule stops it.
- **A card moves to Ready only when its issue stands on its own.** If you had to read a plan file to understand it, the issue is not finished.
- **Verify in game is a real step.** Some claims are settled only by starting the client and looking; those items are not Done until somebody has.
- **Nothing outside the board records status.** A document may link to an issue; it may not say the issue is ready, blocked, postponed or done. Dated history ("shipped 2026-08-27, #91") is fine, and a plan's status line says what the document *is*, not where its work stands.
- **Once a month:** empty the Inbox, re-read Parked, and check that anything whose confidence is marked Measured still is.

**Where a relationship goes.** GitHub has two built-in links between issues: a **blocked-by link** says one issue waits on another, and **sub-issues** group several issues under a parent issue.

| Relationship | Where |
|---|---|
| One issue cannot sensibly start before another lands | a blocked-by link on the issue |
| A family of issues | sub-issues under a parent issue |
| Waiting on something outside the backlog — a rebuilt client, two players, a look at the running game, a decision | the board's **Blocked by** field |
| "Better to do this one first" | the order of the **Now** view |

Link only a dependency somebody has **observed**, not a theory: #249 was once said to block three items, and only one was shown to depend on it.

**Each field answers one question.** Status is where the work stands (*Parked* means looked at and set aside); Track is how soon it is planned, so a parked card has none; Milestone is which release it belongs to. The `P0`–`P3` labels answer a different question again — how bad it is if left alone — so a `P3` inside v1.0 is normal rather than a mistake, and the four labels carry their own one-line definitions on GitHub; read them there instead of keeping a second copy here. Do not add an option that repeats another field — the board once had *Parked* in both Status and Track, and a *Blocked* status that repeated the blocked-by link.

**One trap:** the board's setting that adds new issues automatically covers `BSF-Custom-Server` only, and a free GitHub organisation gets one such setting, so add an issue from any other repository by hand. The exception is a sub-issue of a card already on the board, which a separate setting adds.

*Technical:* `gh` 2.91.0 has no flag for issue links; use the `addBlockedBy` and `addSubIssue` GraphQL mutations. `gh issue view N --comments` prints nothing in Git Bash, and putting `GH_PAGER=cat` in front stops the pre-approval matching, so read comments with `gh issue view N --json comments --jq '.comments[].body'`.

## Commands

```bash
yarn test           # Run the automated test suite (~3s, no DB needed)
yarn test:watch     # Re-run on file changes during development
yarn test:coverage  # Run tests + generate coverage report
yarn build          # Compile TypeScript → build/
yarn dev            # ts-node-dev hot-reload (dev only)
node build/index.js # Run compiled server (requires .env)
```

**start-server.bat** — builds, kills any running node process, then starts fresh. Always use this instead of `node build/index.js` directly — running the old build after code changes is the most common cause of "my change isn't working" during testing.  
**test-2p-match.bat** — headless 2-player API smoke test (login → queue → match creation).  
**launch-game-2p.ps1** — launches two players side by side in one window, in versus mode against localhost. Two faults in the game otherwise stop the battle starting; the script works around both, by turning the sound off for both halves and asking the server to wait ten seconds before pairing anyone. Do not type the command by hand instead (see [`docs/Development.md`](docs/Development.md#two-player-local-test-same-machine)).

A pre-commit hook runs `yarn build && yarn test` automatically — commits are blocked if either fails. Use `scripts/verify-and-commit.ps1 -Message "..."` to commit instead of a plain `git commit` — it runs that same check once, keeps the full output in `logs/` instead of printing it, and skips the hook's own redundant second run (`SKIP_SIMPLE_GIT_HOOKS=1`, the hook's own switch, set only for that one commit and put back afterwards). It needs PowerShell 7.3 or newer (`pwsh`), and it checks the working folder, so unstaged edits are built and tested too. See #279.

## After Completing Changes

After finishing any bug fix, stream, or feature, follow this order — do not skip steps:
1. Prompt user to manually test the changes and wait for confirmation.
2. Only after the user confirms, ask: "Do you want me to update the documentation to reflect these changes?"
3. Only after docs are updated (or skipped), ask: "Do you want me to create a commit?" If yes, stage the intended files by name and run `scripts/verify-and-commit.ps1 -Message "..."` — it builds and tests once and then commits, instead of a separate `yarn test` round-trip followed by a commit that silently re-runs the same check. If it reports a build or test failure, fix the regression and try again before committing. Give that call a 10-minute timeout (`timeout: 600000`, the most the command tool allows) instead of the default 2 minutes. This helper is the exception to the root guide's "ask the user to run `yarn build`/`yarn test`" rule, which exists to keep their long output out of the chat — the helper already does that.

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

**Swapping a technical unit for a plain one makes the number attached to it wrong.** This is a sharp edge on the rule above, and it has drawn blood once ([the case](docs/retrospectives.md#replacing-a-unit-is-a-fresh-measurement-2026-09-09)). Replacing a unit is a fresh measurement, not a translation. Convert the number honestly, or **drop it and describe the size instead** — *"the guide is now half of what it was"* is plainer and cannot go stale. And **re-take any measurement of a file the same change is still editing**.

## Code Review

After code changes or at the end of each stream, offer a review of the work, sized as *Size the review to the change* sets out below and run as *Review in a new chat* describes:

```
Agent({ subagent_type: "general-purpose", description: "Code review", prompt: "Review the changes in <files> for correctness, security, and edge cases..." })
```

Look for: unhandled promise rejections, missing input validation, type mismatches, auth bypasses, edge cases in matchmaking/battle logic, and protocol compliance with the Fiddler captures under `data/game_captures/extracted/` (a fresh clone holds only `0058_s.txt` there — the rest come from the [`reference-captures` release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/tag/reference-captures)).

**Offer the review *before* the pull request opens.** The instinct is to review after pushing, but by then any mistake is public and fixing it costs an extra commit plus a second review pass. Ask before the push.

**Size the review to the change.** Nothing below sets a size threshold, so its paragraphs could add up to four agents on any diff. This sets how many run; the rest of the section says how to brief them and what to do with what they find.

- **One reviewer and one refuter** for a diff under roughly **150 lines that no player can reach** — our own documents, plans, rules files and comments. The refuter stays even at this size, for the reason given under *briefed to disprove* below.
- **The full split described below** for anything over that size, anything that changes behaviour, anything touching renown or sign-in, and anything a player can reach at all. Size does not excuse these: a nine-line sign-in change gets the full split.

**Review in a new chat, not the one that wrote the work.** By the time the writing chat starts reviewers it typically carries about four times what a new chat starts with, and every later step — fixing what they find included — pays for all of it again ([the measurement](docs/retrospectives.md#what-review-rounds-cost-2026-09-14)). So route what this chat learned, commit the work, write `%USERPROFILE%\.claude\plans\review-<branch>.md` (a `/` in the branch name becomes `-`) naming the branch and its base, the commit reviewed, the review size, the files, and the claims for the refuter — then stop, and give the user one line to paste into a new chat. That chat reads the file, runs the reviewers, checks their findings at the source, commits the fixes separately, and routes the third kind of finding below.

**A second round reviews the fixes, not the whole change.** Brief it with what changed since the reviewed commit (`git diff <reviewed-commit>..HEAD -- . ':(exclude,glob)**/yarn.lock'`; the `glob` form skips the lockfile from either folder, where `':!**/yarn.lock'` misses it inside `bsf-server/`) and the claims those fixes altered. It still includes a refuter. Review everything again only when a fix changed what the work rests on.

**For documentation changes, put most of the review on the prose — but do not skip the tables.** Mistakes land in proportion to how much was written, not to how it was formatted. **Checking the counts is not checking the table** ([the cases](docs/retrospectives.md#where-the-errors-in-the-client-contract-were-2026-08-11)). The failures live in sentences containing *because*, *therefore*, or *cannot happen*, wherever those sentences sit. **Never write a "because" clause you have not traced into the code**, and make every number name its unit.

**Prefer deleting a wrong explanation to rewriting it.** Measured across three rounds, each correction round introduced about half as many errors as it fixed, and all of that came from replacing wrong sentences with new ones — roughly 11 new lines of prose per error fixed, at about 4 errors per 100 lines of prose. Deleting costs nothing. Where an explanation has been wrong more than once and no decision depends on it, cut it and keep the finding.

**Use more than one reviewer for factual claims, and treat disagreement between them as the finding.** A single reviewer is not a check.

A split that worked well: one agent verifying claims against source (told explicitly not to trust the document under review), one on cross-document consistency and whether cited evidence resolves, one on judgement and architecture. While #278 runs, start the consistency agent on the cheaper Sonnet model (`model: "sonnet"`) and note on that issue what it caught and missed; every other reviewer keeps the main model.

**Always include a reviewer briefed to *disprove*, not to check.** The passes above ask "does this sentence match the code?" — a question that finds support wherever support exists. None of them asks whether the *situation* the change is built on can happen at all, so a false premise survives them indefinitely ([the case](docs/retrospectives.md#what-only-the-refuter-caught-181)).

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

**Verify the refuter's own findings before acting on them.** It has been confidently wrong, and two reviewers have split over a fact only the source could settle ([both cases](docs/retrospectives.md#the-refuter-can-be-wrong-too)). When two reviewers disagree, that disagreement *is* the finding: resolve it at the source yourself.

**Ask the third question: what did this teach us that is not a code change?** A review — or a planning pass — produces three kinds of finding, and only two of them have somewhere to go. Defects get fixed. Wrong statements get corrected. The third, **what the session worked out about work nobody has started**, has no diff to live in and no claim to correct, so it evaporates unless it is deliberately routed: ideas that left the #149 review with an issue kept their design advice, and ideas that left without one lost it ([the details](docs/retrospectives.md#ideas-keep-their-reasoning-only-when-they-have-an-issue-149)). **Parking an idea produces no artifact, and that is precisely when the reasoning is most expensive to rebuild.** So before closing a review, ask what it taught that is not a code change, and route each piece:

| What the finding is about | Where it goes |
|---|---|
| An item that already has an issue | A comment on that issue — plus its board fields, or a blocked-by link, if it changes order or readiness |
| An item we accepted but have not filed | **File the issue.** That is the vehicle that demonstrably works |
| An idea we are not building, or not building yet | [`docs/idea-triage.md`](docs/idea-triage.md) — the verdict **and** the evidence for it |
| A trap for anyone editing `src/` or `test/` — **the instruction itself**, in a sentence or two | [`.claude/rules/gotchas.md`](.claude/rules/gotchas.md) |
| **The evidence behind that trap** — the trace, the counts, the carve-outs, the history of the fix | the matching `docs/` page, linked from the trap |
| A trap for anyone deploying, or writing a command block anyone will paste | [`.claude/rules/ops.md`](.claude/rules/ops.md) — same split: the instruction here, the evidence in the guide that owns the subject |
| A reusable concept or mental model | the docs suite — see *Documentation conventions* below |
| How we work, the instruction only | this file, which has a size limit |
| A lesson from past work that no guide owns, or the case behind a rule here | [`docs/retrospectives.md`](docs/retrospectives.md) |

**A trap has two halves, and they go to different places.** Each rules file is read before the work it applies to begins, so every word is paid for by that work whether or not it needed it — which is how the traps file reached 32,889 bytes before it was narrowed. The rule of thumb: **keep what a session must *do*; move why we know it** ([how that played out](docs/retrospectives.md#narrowing-the-traps-file-258)). Its sharper form, "the because goes to `docs/`", is not a general test.

**Route it before the session ends, not after.** The plan files under `%USERPROFILE%\.claude\plans\` are outside the repo and git-ignored, so anything left in one is invisible to every future search — including this project's own.

## Documentation conventions

- **Durable concepts vs issue-specifics — cross-link, never duplicate.** Put reusable knowledge — a mental model, a parity/verification method, a recurring gotcha — in the durable docs suite (`docs/`), or a rules file under `.claude/rules/` for a short trap — `gotchas.md` for code, `ops.md` for deployment — **not** in an issue plan. Keep `misc/Plan-*.md` for issue-specific findings, decisions, and milestone/wave breakdowns, and have them *link* to the concept in `docs/`. Burying a reusable finding inside one issue's plan means the next session re-derives it — which is how the matchmaking-window math, the Elo parity rules, and the 32-bit account-id model each got re-explained more than once before they were written down.
- **Where durable knowledge lives:** [`docs/README.md`](docs/README.md) says which of the 24 documents answers which question — open that rather than searching across all of them. Tracked missing docs are inventoried in [`docs/doc-gaps.md`](docs/doc-gaps.md) — fill the linked issue, don't expand the plan.
- **"Did Stoic do it, or did we?"** When a behavior, formula, or wire shape is reverse-engineered or ported, cross-check it against the read-only Java reference (`%USERPROFILE%\Code\bsf-refs\server-2013-java\`; see [`../REFERENCE.md`](../REFERENCE.md) for the pinned commit and the highest-value paths, and [`docs/protocol-cross-reference.md`](docs/protocol-cross-reference.md) for the route-by-route map) and the recorded traffic from the original servers. The reference is the source of truth when they conflict — record divergences (and *why* we diverge) in `docs/`, not only in a plan.
- **Where scratch and dead plans go — keep the tracked tree lean.** Private or throwaway working notes → `misc/local/`; superseded plans and old reviews → `misc/archive/`. Both folders are git-ignored, so their files stay on your disk but never get tracked, published to the public repo, shipped in the Docker build, or pulled into an AI session's search context. Only *live* plans stay tracked at the top of `misc/`. (Heavy binaries — `misc/*.docx`, `misc/*.bin`, `misc/discord-chatexport/` — are ignored separately in `.gitignore`.)
- **Moving a plan is checked for you — attempt it.** The `path-rot` check fails a pull request that deletes or moves a file some other document still points at, and it now looks for all three ways we cite files: the full path, the same path with Windows slashes, and the bare file name on its own. (It only searches for the bare name when that name no longer belongs to any tracked file, so moving a file between folders without renaming it does not flood the log.) So archiving a finished plan is safe to try: if a link would break, the check names the document and the line. When the target lands somewhere a reader cannot follow — `misc/archive/` is git-ignored, so it does not exist on github.com — **reword the sentence rather than relinking it**.
- **But the check only sees whole files — moving a *section* is invisible to it.** It inspects the paths of files a change deletes or renames, so a change that moves text between documents without deleting a file gives it nothing to look at: it passes green having checked nothing, which reads like coverage and is not. Measured on 2026-09-09, when trimming this file moved four sections: **ten** citations needed repointing and the check saw none of them. So when you move a section, do the search yourself — `git grep -n -F "<file>#<anchor>"` for links and `git grep -n -F "<section name>"` for prose, across every file type, because two of those ten were comments in the code. Nothing else in CI resolves a Markdown link or a heading anchor either. Tracked as **#255**.
- **Re-read moved text where it now sits, as though you had never seen the original.** Broken links are the visible half of a move; the invisible half is a sentence that was precise only because of what surrounded it. Reading the two versions side by side — the obvious way to review a move — cannot catch this, because **both copies say the same thing** ([two cases](docs/retrospectives.md#sentences-that-were-precise-only-where-they-stood-2026-09-09)). So after moving a section, open it where it landed and check it against `src/`, not against where it came from.
- **The one place a removed file name belongs is a record that it was removed.** The roadmap's *Archived plans* table exists to say what a file was and why it went; that is not a broken link, but the check cannot tell the difference, because it now searches bare file names. So write the names in that table **without their `.md` ending** — `Plan-Foo`, not `Plan-Foo.md`. It reads the same to a person and stops looking like a citation to the check. A note above the table says so; please do not "fix" the names back. **Outside that table, prefer the other way out: don't name the file at all.** **But do not take it as far as hiding a name the reader genuinely needs** ([the case](docs/retrospectives.md#hiding-a-file-name-the-reader-needed-2026-09-08)). The rule is therefore: drop the name when it is decoration, and when a reader must have it, write it **without its extension** — the same trick the archive table uses. Both halves are needed; neither is the whole rule.

## Environment Setup

Copy `.env.example` to `.env` and fill in values:
```
DB_PATH=./data/bsf.db
JWT_SECRET=replace-with-a-strong-random-secret
```

No database initialization step needed — `src/db/connection.ts` creates `data/bsf.db` and runs `CREATE TABLE IF NOT EXISTS` automatically on server startup.

The server fails fast at startup if `JWT_SECRET` is missing or empty.

## Architecture

The system is described in the docs suite, not here — [`docs/README.md`](docs/README.md) indexes all of it. These are the six questions this section used to answer:

- **How a request is authenticated, and what each refusal means** → [`docs/error-handling.md`](docs/error-handling.md)
- **Every route, its transport, and how the lobby behaves** → [`docs/serverEndpoints.md`](docs/serverEndpoints.md)
- **Long-polling, matchmaking, the battle object, the database layer, the static data files** → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **What the server enforces during a battle, and endgame bookkeeping** → [`docs/battle-simulation.md`](docs/battle-simulation.md)
- **The shape of every message on the wire** → [`docs/dataStructures.md`](docs/dataStructures.md); tables and columns → [`docs/database-schema.md`](docs/database-schema.md)
- **What the original Stoic server did** → [`../REFERENCE.md`](../REFERENCE.md) for the pinned commit and the highest-value Java paths, [`docs/protocol-cross-reference.md`](docs/protocol-cross-reference.md) for the route-by-route map

**Do NOT port** from the Java reference: vBulletin auth (`AuthDataVbb`, `auth_vbb`), the RabbitMQ-coupled workers and `MsgSystem`, MySQL `DbHelper` pooling, EhCache, NewRelic, the Heroku Procfile. `VsSystem` and `WorkerMain` are RabbitMQ wrappers — port the `VsWorker` maths instead. And do not vendor or submodule the reference into this repo; it stays a sibling under `%USERPROFILE%\Code\bsf-refs\`.
