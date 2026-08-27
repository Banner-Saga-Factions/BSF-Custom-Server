# Ideas we have already looked at

## Co-Authored-By: Claude <noreply@anthropic.com>

**The standing answer to "has anyone looked at this?"** People keep suggesting the same handful of
things. Some are good. Some are impossible for reasons that cost a day to rediscover. This page
records what we decided about each one and — the part that usually gets lost — **why**, so nobody
works it out twice.

Read it before promising anyone a feature, and before starting to design one.

Three things can happen to an idea:

- **We are building it.** It becomes a numbered issue, and that issue is the spec. Those are not
  repeated here — see [the roadmap](../misc/Plan-Master-Roadmap.md).
- **We cannot build it.** The reason is a standing fact about the game, not a shortage of effort.
  First list below.
- **We could build it, but have not started.** Whatever we worked out while deciding that is in the
  second list, so whoever picks it up begins where we left off instead of at the beginning.

**Every entry says how sure we are.** *Measured* means somebody traced it into the code or watched
the game do it. *Not measured* means it is our best reading, unproven — a starting point for a
check, not a settled answer. Nothing here is too old to re-open; if you prove an entry wrong, move
it and say what changed.

---

## What we cannot build, and why

Each reason below is a property of the game itself, or of the fact that our server *watches* battles
rather than playing them. None of them is a matter of effort — see
[what the server does and does not decide in a battle](./battle-simulation.md).

| Idea | Why it is out of reach | How sure |
|---|---|---|
| **Fog of war** | What gets drawn on screen, and every rule about who can see what, run inside the game. Our server passes moves between the two players; it decides none of them. | Measured |
| **Objective scenarios** — king of the hill, capture the flag, break the base, kill the boss, carry the banner | **Two changes, not one.** The game decides how a battle is won, *and* separately our server declares a winner by noticing which side still has units. Any victory that is not "wipe the other side out" needs both halves changed together, so neither half alone gets you there. | Server half measured; the game's half not measured |
| **Shrinking map / encircling fire** | A battle rule, and battle rules live in the game. The same wall as fog of war. | Measured |
| **Injuries that persist across a campaign** | The game **overwrites** a unit's injury values from its rank, no matter what the server sends. There is no way to hand a player a wounded unit. | Measured |
| **Co-operative play against the computer** | Two gaps at once. A battle would need more than two sides, and somebody would have to play the computer's. Our server cannot: it records battles, it does not play them. | "Cannot play a side" measured; more-than-two-sides not measured |
| **One player against many** | Needs that same more-than-two-sides change. **Not** blocked by the friend lobby's one-guest limit — that rule is ours, copied from the original server, and could be lifted; it is not what stands in the way. | Measured that the lobby cap is not the blocker; the rest not measured |
| **Showing a per-tournament unit rule inside the game** | The tournament description the game reads has no field for a list of allowed units. The server can turn away an illegal party when someone joins, but the game cannot display the rule, so it has to be announced elsewhere. This is why issue #202 is scoped down to enforce-and-announce. | Measured |

_Technical: the server runs no combat simulation and derives the winner from the party still holding
units — `src/services/battle/Battle.ts` (`aliveUnits`, and the "whichever party is not this one"
lookups), issue #79, [`battle-simulation.md`](./battle-simulation.md). Injury overwrite:
[`../.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) → `EntityDef.applyClassStats` overwrites
`ACTIVE_0` / `INJURY` / `INJURY_DAYS` from rank. Friend-lobby guest cap:
`src/services/lobby.ts` → the one-invitee-per-lobby check, ported from the Java `doInvite`._

---

## Looked at, but not started

Nobody is working on these. Each one carries what we already know, so the next person does not start
cold.

### Leagues and campaign play

A league is **a tournament id, a starting roster we hand out, and its own leaderboard** — it rides
entirely on the tournament plumbing rather than needing anything new. The half that sounded most
appealing, injuries carrying between battles, is not buildable (see the first list).

**Blocked by:** the ranked-ladder split (**#198**) must land first, because leagues need scores
written to and read from the same place. Then tournaments (**#201**).

_Source: the community discussion #149 review, 2026-08-26._

### A global rebalance of unit numbers

The stat ranges for each class live in a data file the game loads at startup, which we can edit and
hand out without rebuilding anything. So a rebalance is a data job, not a code job.

**The catch:** it is **one file for everyone**. Per-tournament or per-league balance is therefore not
possible without changing the game itself. Say that plainly when someone asks for "a tournament with
different numbers" — it is a different and much larger request.

_Technical: `common/character/character_classes.json.z`, loaded by the game at boot — see
`bsf-client/docs/data-model.md` ([local](../../bsf-client/docs/data-model.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/data-model.md)).
Edit it with **TBSDecompiler**, never JPEXS._

### Anti-turtling — a second reward for winning fast

**One already ships.** A player who wins within thirty seconds gets a bonus of two renown, ported
from the original server. Anyone asking for "a reason not to stall" should be told it exists.

A *second* bonus was designed but never built, and it waits on the same decision about which unlocks
we grant that **issue #98** already has to make. **Decide the two together** — settling one without
the other means revisiting it.

_Technical: `src/services/battle/renownAwards.ts` → `EXPERT_TIMER_SEC` and `EXPERT_AWARD`._

---

## How something gets onto this page

A review or a planning session produces three kinds of finding: defects, which get fixed; wrong
statements, which get corrected; and **what we worked out about work nobody has started**, which has
no fix and no correction and therefore disappears unless somebody puts it somewhere.

That third kind belongs here — but only when the idea has no issue. If it does have an issue, the
advice goes on the issue, which is the vehicle that already works. The full routing table lives in
[`../CLAUDE.md`](../CLAUDE.md) under *Code Review*.

## Not triaged yet

[`Community-Insights.md`](./Community-Insights.md) records asks from the 2022 Discord that have never
been checked against the code — a hotseat mode, computer-versus-computer matches, richer game logs,
and the fourth subclasses whose art already exists. They are candidates for this page; each one needs
someone to trace it first.
