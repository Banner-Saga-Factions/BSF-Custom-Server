# The server's documentation

## Co-Authored-By: Claude <noreply@anthropic.com>

**Start here rather than searching.** There are 22 documents under `docs/` — about half a megabyte of reading. This page says which one answers which question, so you can open one instead of searching through all of them.

Three files are set up to be read **automatically**, without anyone asking for them. [`../CLAUDE.md`](../CLAUDE.md) (how we work here) and [`../.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) (traps that cause real bugs when editing `src/`) are not limited to any part of the code; [`../.claude/rules/db.md`](../.claude/rules/db.md) narrows itself, in its own opening lines, to work touching `src/db/`. That is why they are kept short, and why a fact belongs in a document below rather than in one of them — moving something *into* an automatically-read file costs every future session, whether or not it needed to know.

---

## Working on the server

| If you want to… | Read |
|---|---|
| Set up a local server, run the tests, use the debug routes | [`Development.md`](Development.md) |
| Turn your own Steam copy of the game into readable source | [`extracting-the-game-client-source.md`](extracting-the-game-client-source.md) |
| Work out why something is behaving oddly | [`FAQ.md`](FAQ.md) — problem → cause → fix, and an index of the deep traps |

## How the system works

| If you want to… | Read |
|---|---|
| Understand the whole server: request flow, sessions, matchmaking, the battle object, the database | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Follow one battle from login to result, message by message | [`gameFlow.md`](gameFlow.md) |
| Know what the server decides during a battle and what it leaves to the game | [`battle-simulation.md`](battle-simulation.md) |

## The line between the game and this server

| If you want to… | Read |
|---|---|
| Look up a route — its address, body, reply, and what it pushes | [`serverEndpoints.md`](serverEndpoints.md) |
| Look up the shape of a message on the wire | [`dataStructures.md`](dataStructures.md) |
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

## Audits

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
