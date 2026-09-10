# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A custom server reimplementing the backend for **The Banner Saga Factions** (a defunct multiplayer turn-based strategy game). The game client is an Adobe AIR/Flash app that communicates with this Express server over HTTP long-polling. All client protocol details were reverse-engineered from recordings of the original servers made in 2022. Those recordings are a **download**, not part of a copy of this repository — get them from the [`reference-captures` release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/tag/reference-captures) and unpack **each into its own folder** under `data/game_captures/extracted/`, as [`docs/Development.md`](docs/Development.md#official-fiddler-captures) explains. Unpacking two of them into the same place silently mixes two different recording sessions, and one of them overwrites a file this repository keeps on purpose.

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
**launch-game-2p.ps1** — launches two game client windows in versus mode against localhost. The script bakes in `--versus_start --versus_countdown 0`; do **not** remove these — they are mandatory for 2-on-one-PC because FMOD's ANE only initializes for the first client (see [`docs/Development.md`](docs/Development.md#two-player-local-test-same-machine)).

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

**Swapping a technical unit for a plain one makes the number attached to it wrong.** This is a sharp edge on the rule above, and it has drawn blood once. A change measured a saving of about 5,800 **tokens**; the changelog entry obeyed "no library terms in the body", wrote *"about 6,000 words"*, and doubled the claim — a token is roughly three quarters of a word, so the figure needed to change when the unit did. Replacing a unit is a fresh measurement, not a translation. Convert the number honestly, or **drop it and describe the size instead** — *"the guide is now half of what it was"* is plainer than either figure and cannot go stale. And **re-take any measurement of a file the same change is still editing**: that entry also quoted a finished size taken two commits before the end, and the last commit put 912 bytes back.

## Code Review

After code changes or at the end of each stream, ask if the user wants to spawn code reviewer subagents over the code written in that session — an ordinary checker, and, whenever the work rests on factual claims, a second one briefed to disprove them:

```
Agent({ subagent_type: "general-purpose", description: "Code review", prompt: "Review the changes in <files> for correctness, security, and edge cases..." })
```

Look for: unhandled promise rejections, missing input validation, type mismatches, auth bypasses, edge cases in matchmaking/battle logic, and protocol compliance with the Fiddler captures under `data/game_captures/extracted/raw/` (a fresh clone holds only `0058_s.txt` there — the rest come from the [`reference-captures` release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/tag/reference-captures)).

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
| A trap for anyone editing `src/` or `test/` — **the instruction itself**, in a sentence or two | [`.claude/rules/gotchas.md`](.claude/rules/gotchas.md) |
| **The evidence behind that trap** — the trace, the counts, the carve-outs, the history of the fix | the matching `docs/` page, linked from the trap |
| A trap for anyone deploying, or writing a command block anyone will paste | [`.claude/rules/ops.md`](.claude/rules/ops.md) — same split: the instruction here, the evidence in [`docs/Deployment.md`](docs/Deployment.md) |
| A reusable concept or mental model | the docs suite — see *Documentation conventions* below |
| How we work | this file |

**A trap has two halves, and they go to different places.** Both rules files are read before a session does anything, so every word is paid for by work that may never need it — which is how the traps file reached 32,889 bytes. The test is small enough to apply while writing: **if the sentence needs a "because", the because goes to `docs/`.** Keep what a session must *do*; move why we know it. Measured 2026-09-10 (#258): the four sharpest traps in that file came to 2.3% of it, its three largest entries to 40%.

**Route it before the session ends, not after.** The plan files under `%USERPROFILE%\.claude\plans\` are outside the repo and git-ignored, so anything left in one is invisible to every future search — including this project's own.

## Documentation conventions

- **Durable concepts vs issue-specifics — cross-link, never duplicate.** Put reusable knowledge — a mental model, a parity/verification method, a recurring gotcha — in the durable docs suite (`docs/`), or `.claude/rules/gotchas.md` for short operational traps — **not** in an issue plan. Keep `misc/Plan-*.md` for issue-specific findings, decisions, and milestone/wave breakdowns, and have them *link* to the concept in `docs/`. Burying a reusable finding inside one issue's plan means the next session re-derives it — which is how the matchmaking-window math, the Elo parity rules, and the 32-bit account-id model each got re-explained more than once before they were written down.
- **Where durable knowledge lives:** [`docs/README.md`](docs/README.md) says which of the 22 documents answers which question — open that rather than searching across all of them. Tracked missing docs are inventoried in [`docs/doc-gaps.md`](docs/doc-gaps.md) — fill the linked issue, don't expand the plan.
- **"Did Stoic do it, or did we?"** When a behavior, formula, or wire shape is reverse-engineered or ported, cross-check it against the read-only Java reference (`%USERPROFILE%\Code\bsf-refs\server-2013-java\`; see [`../REFERENCE.md`](../REFERENCE.md) for the pinned commit and the highest-value paths, and [`docs/protocol-cross-reference.md`](docs/protocol-cross-reference.md) for the route-by-route map) and the recorded traffic from the original servers. The reference is the source of truth when they conflict — record divergences (and *why* we diverge) in `docs/`, not only in a plan. **The recordings are a download.** Only one extracted message (`data/game_captures/extracted/raw/0058_s.txt`) is in the repository; the rest come from the [`reference-captures` release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/tag/reference-captures), unpacked **one folder per recording** under `data/game_captures/extracted/` — see [`docs/Development.md`](docs/Development.md#official-fiddler-captures) for why that matters, and note that any message number cited in our docs refers to the recording named `factionsTrimmed`. So if you go looking for a capture and find an almost-empty folder, nothing is broken; you have not downloaded them yet.
- **Where scratch and dead plans go — keep the tracked tree lean.** Private or throwaway working notes → `misc/local/`; superseded plans and old reviews → `misc/archive/`. Both folders are git-ignored, so their files stay on your disk but never get tracked, published to the public repo, shipped in the Docker build, or pulled into an AI session's search context. Only *live* plans stay tracked at the top of `misc/`. (Heavy binaries — `misc/*.docx`, `misc/*.bin`, `misc/discord-chatexport/` — are ignored separately in `.gitignore`.)
- **Moving a plan is checked for you — attempt it.** The `path-rot` check fails a pull request that deletes or moves a file some other document still points at, and it now looks for all three ways we cite files: the full path, the same path with Windows slashes, and the bare file name on its own. (It only searches for the bare name when that name no longer belongs to any tracked file, so moving a file between folders without renaming it does not flood the log.) So archiving a finished plan is safe to try: if a link would break, the check names the document and the line. When the target lands somewhere a reader cannot follow — `misc/archive/` is git-ignored, so it does not exist on github.com — **reword the sentence rather than relinking it**.
- **But the check only sees whole files — moving a *section* is invisible to it.** It inspects the paths of files a change deletes or renames, so a change that moves text between documents without deleting a file gives it nothing to look at: it passes green having checked nothing, which reads like coverage and is not. Measured on 2026-09-09, when trimming this file moved four sections: **ten** citations needed repointing and the check saw none of them. So when you move a section, do the search yourself — `git grep -n -F "<file>#<anchor>"` for links and `git grep -n -F "<section name>"` for prose, across `*.md` **and** `*.ts`, because two of those ten were comments in the code. Nothing else in CI resolves a Markdown link or a heading anchor either. Tracked as **#255**.
- **Re-read moved text where it now sits, as though you had never seen the original.** Broken links are the visible half of a move; the invisible half is a sentence that was precise only because of what surrounded it. Reading the two versions side by side — the obvious way to review a move — cannot catch this, because **both copies say the same thing**. Measured on the same 2026-09-09 change: a code comment reading *"the client re-sends **a** 404"* arrived in a general lobby section, read as underspecified, and was sharpened into *"`404` is **the one refusal** the game client retries forever"* — false, and contradicted by two other documents in this very suite, since the game also re-sends after a network failure and on any `5xx`. A second one turned *"creating the battle takes both players out of the queue"* — a fair summary standing next to the call — into a numbered step crediting the `Battle` constructor with something it cannot do, since it cannot reach the queue at all. Neither is a typo, and neither survives being read against **the code** at the destination. So after moving a section, open it where it landed and check it against `src/`, not against where it came from.
- **The one place a removed file name belongs is a record that it was removed.** The roadmap's *Archived plans* table exists to say what a file was and why it went; that is not a broken link, but the check cannot tell the difference, because it now searches bare file names. So write the names in that table **without their `.md` ending** — `Plan-Foo`, not `Plan-Foo.md`. It reads the same to a person and stops looking like a citation to the check. A note above the table says so; please do not "fix" the names back. **Outside that table, prefer the other way out: don't name the file at all.** A sentence explaining where something went reads better as *"three recordings — one complete match plus two longer sessions"* with a link to where they now live, than as a list of file names a reader cannot open. That was the first fix when this same clash came up for the recorded traffic in 2026-09. **But do not take it as far as hiding a name the reader genuinely needs** — a review of that very change found the opposite failure a few hours later: having removed all three recording names, the instructions could no longer say *which* recording our message numbers refer to, and following them as written would have corrupted a file the tests depend on. The rule is therefore: drop the name when it is decoration, and when a reader must have it, write it **without its extension** — the same trick the archive table uses. Both halves are needed; neither is the whole rule.

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
