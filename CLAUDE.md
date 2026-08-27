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

## Start-of-Session interview

At the **start of every new plan chat**, before doing other work, interview user in-deph using askuserquestion tool and focus on pulling out and clarifying any ambiguities.

## Plan Structure — BSF Specifics

My personal global guide already says to break long work into sequential
**waves** (one wave = one chat = one pull request), and to end each plan with a
ready-to-paste kickoff prompt for every follow-up chat. In BSF specifically:

- **"Push request" means a GitHub pull request** against the
  `Banner-Saga-Factions` repos, branched off `main`, following my stacked-branch
  workflow (branches build on each other; never auto-rebase or reset them).
- **Save each wave's kickoff prompt in `%USERPROFILE%\.claude\plans\`** — the
  same folder my existing plan docs live in — so a fresh chat can pick up the
  next wave without re-deriving the design.

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
- For long-running or verbose local-dev commands — `yarn build`, `yarn test`, `yarn dev`, `start-server.bat`, `yarn test:coverage` — **prompt the user to run them locally** and paste back relevant output, rather than invoking them via the Bash/PowerShell tool. This avoids loading multi-thousand-line compiler/test output into the conversation context.
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
See `bsf-server/docs/protocol-cross-reference.md` ([local](../../bsf-server/docs/protocol-cross-reference.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/blob/main/bsf-server/docs/protocol-cross-reference.md)).
```

Reference: BSF-Client issue #6 / PR #10 converted the existing docs to this pattern.

## Documentation conventions

- **Durable concepts vs issue-specifics — cross-link, never duplicate.** Reusable knowledge (a mental model, a verification method, a recurring gotcha) belongs in the relevant repo's durable docs suite — `bsf-server/docs/` or `bsf-client/docs/` — *not* buried in an issue plan. Keep each repo's `misc/Plan-*.md` for issue-specific findings, decisions, and wave breakdowns, and have them *link* to the concept in `docs/`. A reusable finding trapped inside one issue's plan gets re-derived from scratch next session.
- **Where each repo's durable knowledge lives:** server architecture, schema, wire protocol, and the Java-reference cross-map → `bsf-server/docs/` (see [`bsf-server/CLAUDE.md`](./bsf-server/CLAUDE.md) → "Documentation conventions"); the SWF/runtime mental model, reference-mirror map, and build mechanics → `bsf-client/docs/` (see `bsf-client/CLAUDE.md` → "Documentation conventions"). When a chat clarifies something reusable, land it in the right repo's `docs/` and point the plan at it.
- **After a review or a planning pass, ask what was learned that is _not_ a code change — and route it before the session ends.** Such a session yields three kinds of finding: defects, which get fixed; wrong statements, which get corrected; and what it worked out about **work nobody has started**, which has neither a fix nor a correction and so disappears by default. That third kind is the reasoning behind a decision *not* to build something, which is the most expensive kind to rebuild from scratch. It belongs on the idea's issue if it has one, and in [`bsf-server/docs/idea-triage.md`](./bsf-server/docs/idea-triage.md) if it does not. The full routing table — including where traps and reusable concepts go — is in [`bsf-server/CLAUDE.md`](./bsf-server/CLAUDE.md) → *Code Review*; it applies to **both** repos. Note that plan files under `%USERPROFILE%\.claude\plans\` sit outside both repos and are git-ignored, so anything left only there cannot be found again.

## Reference Codebases

Read-only reference material lives outside the BSF repo at `%USERPROFILE%\Code\bsf-refs\`. None of these are built or shipped; they exist to help reverse-engineer client behavior, understand the wire protocol, and port original-server features.

For the pinned `server-2013-java` SHA, top-7 highest-value Java paths, and integration-plan entry point, see [`REFERENCE.md`](./REFERENCE.md). For the route-by-route map of each `bsf-server` route to its Java `*Svc.java` counterpart, see [`bsf-server/docs/protocol-cross-reference.md`](./bsf-server/docs/protocol-cross-reference.md).

| Path                              | What it is                                                                                                                                                           | When to consult                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bsf-refs\client-2013-as3\`       | Original 2013-era ActionScript source Stoic shared (385 .as files, multi-module Java-style layout under `game/code/client/lib.engine.core/src/` and `lib.game/src/`) | **Default reference for AS3** — 97% of overlapping classes are signature-equivalent to the shipped client and the original code is much more readable than the decompile |
| `bsf-refs\client-decompiled-as3\` | JPEXS decompile of the shipped SWF v1.10.51 (1,113 .as files; flat layout: `engine/`, `game/`, `tbs/`, `lib/`, plus `GameMainAir.as`, `AneFixer.as`)                 | Use for code added after 2013 (732 files don't exist in 2013), or to verify any of the 12 files in the stale-list below                                                  |
| `bsf-refs\client-swf-and-ane\`    | Raw `app.game.air.swf` + extracted ANE scripts (decompile inputs)                                                                                                    | Rarely read directly; needed to regenerate the decompile                                                                                                                 |
| `bsf-refs\server-2013-java\`      | Original 2013-era Java server Stoic shared (175 .java files, MySQL schema 88, Maven `pom.xml`)                                                                       | When integrating or porting original-server features — follow the live `bsf-server/misc/Plan-Master-Roadmap.md`; milestone history is archived; see `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md`                                                     |

### Prefer 2013 source over decompile, except for 12 stale files

Pass-2 signature comparison (2026-05-16) found 369 of 381 overlapping files are byte-equivalent in API surface. The exceptions — files Stoic actually modified after 2013, where the 2013 source is **stale** and the decompile is authoritative:

- **`engine/battle/fsm/`** (4) — `BattleFsmConfig`, `BattleTurnOrder`, `BattleStateDeploy`, `BattleStateInit`
- **`engine/battle/board/`** (3) — `BattleBoard`, `BattleBoardView`, `EntityFlyText`
- **`engine/battle/ability/effect/op/model/Op.as`** (1)
- **`engine/entity/def/`** (2) — `EntityDef`, `EntityClassDefList`
- **`game/cfg/`** (2) — `GameConfig`, `AccountInfoDefVars`

Pattern: post-2013 changes were exclusively gameplay iteration (battle internals, entity defs, game config). Core utils, the protocol layer (`tbs/srv/...`), JSON serialization, stats, and session-state code are all unchanged. Comparison artifacts saved to `%USERPROFILE%\Code\bsf-refs-compare\`.
