# The server's documentation

## Co-Authored-By: Claude <noreply@anthropic.com>

**Start here rather than searching.** There are 22 documents under `docs/` — about half a megabyte of reading. This page says which one answers which question, so you can open one instead of searching through all of them.

Four files **inside this server folder** are read **automatically**, without anyone asking for them, and only one of them is unconditional: [`../CLAUDE.md`](../CLAUDE.md), how we work here, which arrives as soon as a session opens anything in this folder. (The repository's own guide one level up, about 14,000 bytes, is read for every session in the whole project and is not counted below.) The other three narrow themselves, in their own opening lines, to the work they apply to — [`../.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) (deep protocol, security and persistence traps) to `src/`, `test/`, `data/` and the settings files; [`../.claude/rules/ops.md`](../.claude/rules/ops.md) (deployment and command-block traps) to `deploy/` and `scripts/`, to the deployment guide and container files it names, and to any PowerShell or batch script anywhere in this folder; [`../.claude/rules/db.md`](../.claude/rules/db.md) to work touching `src/db/`. That is why they are meant to be short, and why a fact belongs in a document below rather than in one of them — moving something *into* an automatically-read file costs every future session, whether or not it needed to know.

**What that used to cost, and why it changed.** Until 2026-09-10 the traps file narrowed itself to nothing, so it was charged to every session that opened **anything** here — a plan, the deployment guide, a Dockerfile, the batch file that starts the server — not only code. Measured that day: `CLAUDE.md` was 23,130 bytes and the traps file 32,889, so about 56,000 bytes arrived before any work began, roughly three fifths of it traps. Of the 32 recorded sessions that opened a file here and were handed it, **15 never opened `src/` at all**, and paid in full for traps about code they did not touch. That measurement is why the traps file now names the paths it applies to, why the operational traps moved to their own smaller file, and why the largest entry left: its instruction stayed behind and its reasoning went to [`client-contract.md`](client-contract.md) → R10, where a reader can find it on purpose. A session that opens only documentation is now handed the two guides and none of the code traps; the deployment guide is the deliberate exception, and opening it brings the operational traps along on purpose. The narrowing on `db.md` was the evidence that this would work: every session handed it had opened a file under `src/db/`, and no session opened one without being handed it.

**Which forms of path that list accepts — settled 2026-09-11.** A fresh session opened one file per form and watched the record; a review then found the rule the tool itself applies, which explains every result and answers more than the openings could alone. It is the rule a `.gitignore` file uses, applied to the opened file's path relative to this folder:

- **A pattern with no folder in it** — `Dockerfile`, `*.bat`, `.env*` — matches on the file's **name**, wherever that file sits. So `*.ps1` reaches a script in `deploy/`, in `misc/`, anywhere below here, and `Dockerfile` would match one in a sub-folder too.
- **A pattern with a folder in it** — `docs/Deployment.md`, `src/db/**` — is pinned to the top of this folder, and a single `*` inside it stops at the next folder along. `**` is what crosses one: `docs/**` reaches everything under `docs/`, but `docs/*.md` would not reach `docs/sub/x.md`.

The four openings that day all agree with it: `Dockerfile`, `start-server.bat` and `deploy/duckdns-update.sh` each brought the file whose pattern matched, and `src/db/connection.ts` brought the code traps and the database rules but **not** `ops.md`.

**Two traps if you check this yourself.** A rules file is handed over once per run of the program — resuming starts a new one — so a second check in the same sitting quietly produces nothing, which looks exactly like a pattern that failed. Worse, **a file you have opened yourself is never handed to you at all**, and nothing in the record says why, so reading a rules file to look at its settings spends that file's one chance. Open them with a shell command instead. Method and evidence: issue #260.

**Check that yourself rather than trusting this page.** Which files a session was handed is recorded by the tool, not by us: every session keeps a log under `%USERPROFILE%\.claude\projects\`, one folder per project, and each automatically-loaded file appears there as its own entry — distinct from the files that session went on to open for itself. Read those entries. **Asking a session what it was given is a report, not a measurement, and can be wrong**: two reviewers reasoned their way to opposite answers about this very file, and searching this repository for the mechanism finds nothing at all, because the mechanism lives in the tool rather than here. The same caution applies to a file that describes its own loading — that is a claim like any other, and this one happened to be true.

---

## Working on the server

| If you want to… | Read |
|---|---|
| Set up a local server, run the tests, use the debug routes | [`Development.md`](Development.md) |
| Turn your own Steam copy of the game into readable source | [`extracting-the-game-client-source.md`](extracting-the-game-client-source.md) |
| Look up a symptom somebody has already hit | [`FAQ.md`](FAQ.md) — problem → cause → fix, and an index of the deep traps |

## How the system works

| If you want to… | Read |
|---|---|
| Understand the whole server: how a request travels, how players stay signed in, how they get paired, what the server remembers about a battle in progress, and what it stores | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Follow one battle from login to result, message by message | [`gameFlow.md`](gameFlow.md) |
| Know what the server decides during a battle and what it leaves to the game | [`battle-simulation.md`](battle-simulation.md) |

## The line between the game and this server

| If you want to… | Read |
|---|---|
| Look up a route — its address, what you send, what comes back, and what the server sends on afterwards without being asked | [`serverEndpoints.md`](serverEndpoints.md) |
| Look up the exact fields in a message the game and the server send each other | [`dataStructures.md`](dataStructures.md) |
| Choose a status code, or find out what the game does with the one you sent | [`error-handling.md`](error-handling.md) |
| Check what the game *requires* of us, and where we currently fall short | [`client-contract.md`](client-contract.md) |
| Find the original Java handler a route was ported from | [`protocol-cross-reference.md`](protocol-cross-reference.md) |

## Data that outlives a restart

| If you want to… | Read |
|---|---|
| Look up a table or a column | [`database-schema.md`](database-schema.md) |
| Change the schema without breaking everyone's startup | [`database-migrations.md`](database-migrations.md) |

## Running it for real

| If you want to… | Read |
|---|---|
| Deploy, back up, restore, or move the server machine | [`Deployment.md`](Deployment.md) |
| Read the logs, or unstick a battle, a queue, or a player who stopped receiving updates | [`observability.md`](observability.md) |
| Know what the server protects against, and — honestly — what it does not | [`security.md`](security.md) |

## Decisions, history, and what is missing

| If you want to… | Read |
|---|---|
| Find out whether an idea has been looked at already, and why it was or was not taken | [`idea-triage.md`](idea-triage.md) |
| Understand where this project came from and what the original stack was | [`HISTORY.md`](HISTORY.md) |
| Read what the community said about the game in 2022 | [`Community-Insights.md`](Community-Insights.md) |
| See which documents are known to be missing, and which issue tracks each one | [`doc-gaps.md`](doc-gaps.md) |

## Investigations we have already run

| If you want to… | Read |
|---|---|
| Read the 2026-05-11 performance and memory audit of the 1 GB instance | [`audits/2026-05-11-perf-audit.md`](audits/2026-05-11-perf-audit.md) |
| See the plan written to fix that audit's high-severity findings | [`audits/2026-05-11-perf-audit-high-severity-plan.md`](audits/2026-05-11-perf-audit-high-severity-plan.md) |

---

## Elsewhere

- **The game program this server talks to** has its own suite. Start at `bsf-client/docs/client-overview.md` ([local](../../bsf-client/docs/client-overview.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/client-overview.md)) — it explains the whole client in one read. A good deal of what looks like server behaviour is actually decided over there.
- **The original 2013 Stoic server and client** are read-only reference material. [`../../REFERENCE.md`](../../REFERENCE.md) has the pinned commit and the highest-value paths.
- **The scripts that keep the live server running** — the nightly backup and the address updater — have their own notes at [`../deploy/README.md`](../deploy/README.md).
- **Live plans** are at [`../misc/`](../misc/); the roadmap is [`../misc/Plan-Master-Roadmap.md`](../misc/Plan-Master-Roadmap.md). Superseded plans are archived outside the public repository.

## Adding a document

Add a row above, in the group that matches the question it answers. If it fills a gap listed in [`doc-gaps.md`](doc-gaps.md), remove that entry and close its issue — do not strike it through.

The number of documents is written in three places: the first line of this page, the table in the repository's own [`README.md`](../README.md), and the *Where durable knowledge lives* note in [`CLAUDE.md`](../CLAUDE.md). Update all three, or take the number out of all three — one page saying 22 while another says 23 is worse than neither saying a number at all.
