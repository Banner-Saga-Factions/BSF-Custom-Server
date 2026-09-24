# BSF Project Root Guide

## Repository Structure

- **Backend:** `./bsf-server` (Node.js/TypeScript)
- **Frontend:** `./bsf-client` (ActionScript/AIR, git submodule of `Banner-Saga-Factions/BSF-Client`)
- **Reference codebases:** `%USERPROFILE%\Code\bsf-refs\` (read-only, outside repo — see below)

## Start-of-Session Git Check

At the **start of every new or resumed chat**, before doing other work, run a quick git orientation and report it to me up front (keep it to a few lines):

1. **Fetch** remote refs first — read-only and safe: `git fetch` (skip only if offline).
2. **Active branch:** `git branch --show-current`.
3. **Sync vs `origin`:** report ahead/behind for the current branch _and_ `main`. Call it out explicitly when either is **behind** (needs updating), **ahead** (unpushed commits), or **diverged**.
4. **Report only — never auto-pull/merge/reset.** My working tree is often dirty and I use stacked branches; if something is out of sync, say so and _offer_ to update, then let me decide.

If everything is current, one line is enough (e.g. "On `fix/foo`; it and `main` are in sync with `origin`").

**Cut new branches with `--no-track`** when branching from something you will not land on — `git switch -c <branch> --no-track origin/main`. Without it, the new branch inherits `origin/main` as the branch it compares itself against, and a later `git pull` quietly merges `main` into your work instead of refusing. With no branch to compare against, that pull stops and asks, which is what you want in a stacked workflow where the branch you started from is often not the branch you will land on. (Pushing is already safe — `push.default` is `current` here, so a push goes to a remote branch of the same name whatever the comparison says.)

**One session holds the main checkout; every other session works in a sibling worktree**, because `git switch` moves every file in the folder, another session's included. Start the chat in `%USERPROFILE%\Code\BSF`, so the start-up hook and memory load, and work in a folder made with `git worktree add ..\BSF-<topic>`. A new worktree has no `bsf-client` submodule, and needs `yarn install` in `bsf-server` before its first commit, since the commit check builds the server.

**"Ahead of `origin/main` by N" can be an artefact, not a fact.** A branch that inherited the wrong comparison reports its ahead/behind against `main` rather than against itself, so step 3 above measures the wrong thing and reads as unpushed work that does not exist. Check what the branch is actually comparing itself against (`git rev-parse --abbrev-ref @{u}`) before reporting anything surprising, and say so if it looks inherited.

## Start-of-Session interview

At the **start of every new plan chat**, before doing other work, interview user in-deph using askuserquestion tool and focus on pulling out and clarifying any ambiguities.

## Plan Structure — BSF Specifics

My global guide's waves apply. In BSF:

- **"Push request" means a GitHub pull request** against the
  `Banner-Saga-Factions` repos, branched off `main`, following my stacked-branch
  workflow (branches build on each other; never auto-rebase or reset them).
- **Put each wave's kickoff prompt on its issue as a comment**, as #224, #256 and
  #283 do. `%USERPROFILE%\.claude\plans\` is scratch space: a plan there gets a
  `<topic>-<yyyy-mm-dd>.md` name once approved, and moves to `archive\` when finished.

## The backlog

The live backlog is the public [BSF Roadmap board](https://github.com/orgs/Banner-Saga-Factions/projects/3), covering all the project's repositories. **Nothing outside the board records an issue's status**: documents link to issues and do not say whether one is ready, blocked or done, except as dated history. The working agreement, and where issue relationships go, are in [`bsf-server/CLAUDE.md`](./bsf-server/CLAUDE.md) → *The backlog, and how work moves*.

**Until 2026-10-08, code only.** Each pull request changes what the server or the client does; documents change only inside one of those, or to fix something broken now (`P0`).

## Coordination Protocol

1. **Verify Boundaries:** Before changing a server endpoint, search `bsf-client/src/` for the matching `URLLoader` or `URLRequest` to ensure the data structures match.
2. **Context Switching:** When focusing on a specific repo, use the internal `CLAUDE.md` within that directory for specific build/test commands.
3. **Database Truth:** The SQLite schema in `bsf-server/src/db/schema.sql` is the source of truth for all persistent data shared between client and server.

## Checking Work That Only the Real Game Can Settle

Some claims cannot be settled by reading code or running tests — anything about what a player sees on screen, and any prediction about what the client does while it runs. Those are checked by starting the real game and looking. `bsf-client/docs/driving-the-client.md` ([local](./bsf-client/docs/driving-the-client.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/driving-the-client.md)) covers launching it, reading the screen, and the traps that otherwise cost an afternoon.

- **Two ways to drive it, and they split the work.** The **mod bridge** — a small text channel between the game and a helper program — owns setting up state, reading a battle, and stepping turns: scriptable, and it needs no screen. A **screenshot** owns layout, rendering, and anything a player sees. Set the state up over the bridge, then take one picture; the expensive part of screen testing is reaching the moment worth photographing, not the looking.
- **During a run, the server's log is the readable witness.** The client's own log file is locked shut until the game exits, and the launcher's copy still holds the *previous* session — believing it is today's output is an easy and convincing mistake.

## Shell & Command Output

- The user's default shell is **PowerShell** (Windows). When suggesting commands for the user to run, write them in PowerShell-friendly form (e.g. `;` for sequencing instead of `&&`, `$env:VAR=...` for env vars).
- For long-running or verbose local-dev commands — `yarn build`, `yarn test`, `yarn dev`, `start-server.bat`, `yarn test:coverage` — **prompt the user to run them locally** and paste back relevant output, rather than invoking them via the Bash/PowerShell tool. This avoids loading multi-thousand-line compiler/test output into the conversation context. **Exception:** committing through either repo's `scripts/verify-and-commit.ps1` — it keeps that output in a log file, so Claude runs it directly (see `bsf-server/CLAUDE.md` → *After Completing Changes*).
- Continue running short, low-output commands directly: `sqlite3` queries, `git status`/`git log`, file edits, single-file `Read`/`Grep`, etc.

## Plain Language

Write **all prose** so a non-programmer can follow it — documentation, READMEs, PR titles and descriptions, commit and changelog bodies, code comments, and doc-index lines. Lead with the plain-English what/why; when a technical term is unavoidable, gloss it on first use (e.g. "long-poll — the server holds the request open until it has something to send", "idempotent — safe to run twice", "serialization — packaging data to send over the network"). Keep function names, file paths, and library terms out of subject lines and prose; put that detail in a trailing technical note where a developer can still grep for it. This applies in **both repos** (`bsf-server` and `bsf-client`) and to every Claude session and contributor.

## Documentation Path Style

- In documentation (Markdown files, comments, READMEs, plans, changelog entries), write Windows paths using standard `%VARIABLE%` environment variables instead of hardcoded user-specific paths.
  - Good: `%USERPROFILE%\Code\bsf-refs\client-2013-as3`, `%APPDATA%\BSF`, `%LOCALAPPDATA%\...`
  - Bad: `C:\Users\rleyb\Code\bsf-refs\client-2013-as3`
- This keeps docs portable across machines/users and avoids leaking the current username into committed files.

## Cross-Repo Doc Links

When a Markdown link in one published repo (`bsf-server` or `bsf-client`) targets a file in the other, write it in **dual-link** form so it works locally (Ctrl+click in VS Code) **and** on github.com (where each repo is viewed in isolation, with no sibling on disk):

```
`<path>` ([local](<relative-path>) | [GitHub](https://github.com/Banner-Saga-Factions/<repo>/<blob|tree>/<branch>/<path>))
```

- **Why**: relative paths like `../../bsf-server/...` resolve under the parent BSF/ checkout but 404 on github.com — the standalone repo has no sibling.
- **`[local]`** keeps Ctrl+click navigation working in VS Code; **`[GitHub]`** is what github.com readers follow.
- **Files use `/blob/<branch>/`**; **directories use `/tree/<branch>/`**.
- **Branch is the _other_ repo's default**: `BSF-Custom-Server` → `main`, `BSF-Client` → `master`.
- If the file doesn't exist on the other side, drop the reference — don't ship a link that 404s in either context.

Example (from `bsf-client/docs/wire-protocol.md`):

```markdown
See `bsf-server/docs/protocol-cross-reference.md` ([local](./bsf-server/docs/protocol-cross-reference.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/blob/main/bsf-server/docs/protocol-cross-reference.md)).
```

Reference: BSF-Client issue #6 / PR #10 converted the existing docs to this pattern.

## Documentation conventions

- **Durable concepts vs issue-specifics — cross-link, never duplicate.** Reusable knowledge (a mental model, a verification method, a recurring gotcha) belongs in the relevant repo's durable docs suite — `bsf-server/docs/` or `bsf-client/docs/` — *not* buried in an issue plan. Keep each repo's `misc/Plan-*.md` for issue-specific findings, decisions, and wave breakdowns, and have them *link* to the concept in `docs/`. A reusable finding trapped inside one issue's plan gets re-derived from scratch next session.
- **Where each repo's durable knowledge lives:** server architecture, schema, wire protocol, and the Java-reference cross-map → `bsf-server/docs/` (see [`bsf-server/CLAUDE.md`](./bsf-server/CLAUDE.md) → "Documentation conventions"); the SWF/runtime mental model, reference-mirror map, and build mechanics → `bsf-client/docs/` (see `bsf-client/CLAUDE.md` → "Documentation conventions"). When a chat clarifies something reusable, land it in the right repo's `docs/` and point the plan at it.
- **After a review or a planning pass, ask what was learned that is _not_ a code change — and route it before the session ends.** Such a session yields three kinds of finding: defects, which get fixed; wrong statements, which get corrected; and what it worked out about **work nobody has started**, which has neither a fix nor a correction and so disappears by default. That third kind is the reasoning behind a decision *not* to build something, which is the most expensive kind to rebuild from scratch. It belongs on the idea's issue if it has one, and in [`bsf-server/docs/idea-triage.md`](./bsf-server/docs/idea-triage.md) if it does not. The full routing table — including where traps and reusable concepts go — is in [`bsf-server/CLAUDE.md`](./bsf-server/CLAUDE.md) → *Code Review*; it applies to **both** repos. Note that plan files under `%USERPROFILE%\.claude\plans\` sit outside both repos and are git-ignored, so anything left only there cannot be found again.

## Reference Codebases

Read-only reference material lives outside the BSF repo at `%USERPROFILE%\Code\bsf-refs\` — the original 2013 Stoic server and client that Stoic shared, a decompile of the client that actually shipped, and the raw game file that decompile came from. They exist to answer "what did the original do?" when reverse-engineering client behaviour, working out the wire protocol, or porting an original-server feature.

**Never vendor, submodule or copy them into this repo.** They are not built and not shipped, and the production image must not carry them.

[`REFERENCE.md`](./REFERENCE.md) says which mirror to use for what, names the twelve files where the 2013 source is out of date, and holds the pinned `server-2013-java` commit and the highest-value Java paths. For the route-by-route map of each `bsf-server` route to its Java `*Svc.java` counterpart, see [`bsf-server/docs/protocol-cross-reference.md`](./bsf-server/docs/protocol-cross-reference.md).
