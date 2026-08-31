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
| **Friend requests, or choosing who is on your friends list** — adding, removing, blocking, searching for a player by name | The game has no control that changes this list. Not a missing screen: there is no request it can send. Every request class it ships was checked and none is friend-related; no address anywhere in the game — the main program **or** any of its 37 separate screen files — contains the word; and the friends screen's only controls are page-forward, page-back, a row to pick, and a taunt to send with the invitation. Worse for removal specifically — **no message can take a name off a list the game has already been given**, because its list merges what arrives and has no delete path at all. The most a server can do is mark somebody offline, which greys their row. So the list is a read-only view of whatever the server decides, and any rule about who appears on it has to be a server rule. **Two things that look like exceptions and are not:** the game can open Steam's own overlay on a player, from which you can add a *Steam* friend — but that changes nothing we store, and the game never reads the Steam friend list back. And there is a leftover `friend_notification` chat-room name in the code with **no caller**, which anyone searching for "friend" will find and misread. | Measured |

_Technical: friends - `game/gui/pages/GuiFriendList.as` and `GuiFriendLobby.as` (the whole control
surface), `tbs/srv/data/FriendsData.as` `addFriendData` (merge-only, no removal). The address sweep
covered `app.game.air.swf` and all 37 shipped gui SWFs; the two dynamic path segments are `LobbyTxn`'s
verb (a closed set of six) and `ChatSendTxn`'s room. Non-exceptions:
`SteamFriends_ActivateGameOverlayToUser` via `GameConfig.as`, and `engine/session/Chat.as`
`FRIEND_NOTIFICATION_ROOM` (zero call sites). Our side is `src/services/friends.ts`, and the shapes are
in [`dataStructures.md`](./dataStructures.md#friends-list).
The server runs no combat simulation and derives the winner from the party still holding
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

A *second* bonus was designed but never built. It used to wait on the same decision about which
unlocks we grant that **issue #98** had to make — **that decision has now been taken (2026-08-29), and
it separates the two.**

Colours are granted to everyone from a single list in the code, so they are a rule rather than
per-player data. The per-player record lives in a real `unlocks` table, which is now built and empty.
So the fast-win bonus no longer shares anything with #98 and can be designed on its own. What it needs
is already there: the second bonus is the original server's **BOOST** award — a flat five renown for
any non-friendly battle you did not surrender, paid to whoever holds the unlock id `bst_renown`. That
id is deliberately granted to **nobody** today, which is exactly the lever: rather than selling it as
the original did, we could award it for something, and a fast win is a candidate. Note it sits in the
same branch as the existing thirty-second bonus in the reference, so the two would stack.

_Technical: `src/services/battle/renownAwards.ts` → `EXPERT_TIMER_SEC` and `EXPERT_AWARD`;
`src/db/unlocks.ts` → `hasUnlock`; `src/const.ts` → `UNIVERSAL_UNLOCK_IDS` (which `bst_renown` is
deliberately not in). Reference: `tbs/srv/battle/BattleMonitor.java` → the BOOST branch._

---

### Finding the session key by shape instead of by position

**Considered on 2026-08-29 while fixing #188, and deliberately not done.** Worth writing down because
it will look obvious to the next person who meets this code.

The server finds a player's session key by taking the last part of the web address. Almost every
address ends with it, but not all — the unit-recolour route puts a room id after it, which is the
whole of #188. The fix that shipped matches that one route's exact address shape and reads the key
from its real position; everything else is untouched.

The tempting alternative is to stop caring about position and simply look at every part of the
address for one *shaped* like a session key — thirty-two characters of hex. It would fix every
route at once, including any future one, and it removes a per-route exception list that now has two
entries and will grow.

**Why it was not taken.** That code is the server's front door: every single request is admitted or
refused there, and the two ways to get it wrong are to sign a healthy player out and to let someone
in. Rewriting how *all* traffic is authenticated to fix *one* route is a poor trade of risk against
benefit, and the exception it replaces is three lines long. There is also a real, if unlikely, way
for the general version to pick the wrong part: a unit id is chosen by the game, not by us, and one
that happened to be thirty-two hex characters would sit in the address next to the real key.

**What would change the answer.** A third route whose key is not last. At that point the exception
list is a pattern rather than a special case, and the scan is worth the risk — with the rule being
"the first part that both looks like a key and names a session we know", not just the first that
looks like one.

_Technical: `src/app.ts` → `VARIATION_RE` and the `??` fallback beside `STEAM_OVERLAY_RE`;
[`client-contract.md`](./client-contract.md) → R5._

---

### Gaps in the tool that drives the game client

**Found while reviewing BSF-Client PR #38 on 2026-08-30, and deliberately left unbuilt** — that pull
request was about correcting what we had got wrong, not about growing the tool. Three gaps, small
separately, all of which the next person driving the client will walk into.

**It cannot press a key.** The clicking helper already knows how to send keystrokes — it taps ALT to
get the window to the front — but nothing exposes that as a command. So an automated run cannot press
Tab to raise the unit banners, or Ctrl+Shift+A to start a practice battle, even though our notes
describe both as working and the skill tells a *human* reader to press them. The practice battle has
another way in over the bridge, so what is really lost is every other keyboard-only control. Adding a
`key` command is a small job that nobody has yet needed. *Measured — the ability is there and unused.*

**The great hall is a one-way trip.** The driver can get from the town into the great hall, and nothing
records how to get out again. Whether the way back is a control on that screen, whether the town
re-announces `loc_strand` on return, and whether leaving takes a click at all are all unknown. This
blocks every journey that visits more than one building — the roster, then the mead house — so it is
the first thing to settle when a second town recipe is wanted. *Not measured.*

**The eight-second wait in the town recipe is an unexplained number.** The recipe waits eight seconds
after arriving before doing anything. We now know what it is *not* for: it is not what makes clicking
work, because a lone click still failed after fifteen seconds. The likeliest reading is that it waits
for the scene to finish drawing — the game reports arriving about six seconds before the screen is
actually drawn — but nobody has measured that for the town, so the margin is a guess. It matters
because it is the load-bearing constant in the only town recipe we have: too short and every run is
flaky, too long and every run is slow. *Not measured for the town.*

_Technical: `bsf-client/.claude/skills/run-bsf-client/input.ps1` already imports `keybd_event` and uses
`VK_MENU`; `driver.js` `COMMANDS` has no `key` entry; the town recipe is `RECIPES.camp`. Background on
all three is in `bsf-client/docs/driving-the-client.md`
([local](../../bsf-client/docs/driving-the-client.md) |
[GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/driving-the-client.md))
sections 4 and 8._

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
