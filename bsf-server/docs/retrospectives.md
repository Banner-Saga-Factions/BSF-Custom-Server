# What past work taught us

## Co-Authored-By: Claude <noreply@anthropic.com>

This page keeps lessons that have no other home. What to *do* belongs in the guide that owns the
subject — the deployment guide, the traps file, `CLAUDE.md` — and what shipped belongs in
[`../CHANGELOG.md`](../CHANGELOG.md). Only the part left over, the lesson about how we work that
no single guide owns, is written here — plus the cases behind the review rules, which are too long
for a guide that every session reads before it starts.

## The disaster-recovery drill (2026-09-02): finding faults does not make an exercise right

Until that day nobody had restored one of our backups, or followed the deployment guide on a
machine other than the one it was written on. So a second server was built from nothing on a
separate account, a stored backup was restored into it, and a game client signed in as a restored
player. It worked, and running the guide rather than reading it found fifteen faults. Twelve were
mistakes in the guide itself, corrected in [`Deployment.md`](Deployment.md) (pull request #238).

**One of the drill's own findings was wrong.** It concluded that two bytes near the front of a
database file say whether a copy is complete. They only record which of two ways the database
keeps its recent changes. The server switches every database it opens to the second way, so a
healthy copy of the live database reads exactly like a damaged one. The wrong rule reached a merged
pull request and a saved note within a day. Nothing caught it until somebody ran the check on a
*healthy* copy as well as a broken one.

**The lesson.** An exercise that finds fifteen faults is not thereby right about its own findings,
and a wrong rule can spread faster than the check that would catch it. Before
writing down a rule from a test, run the test in both directions — on the case that should fail
and on the case that should pass.

## Reviews: the cases behind the rules

The rules are in [`../CLAUDE.md`](../CLAUDE.md) under *Code Review*. These are the cases that
produced them, kept here so that file stays short.

### What review rounds cost (2026-09-14)

Claude Code keeps a log of every conversation on the computer it runs on, including how many
tokens (the pieces of text a model reads and writes) each step used. We added up 63 conversations
from 2026-08-15 to 2026-09-14, weighting each kind of token by its price. That is close to, but not
the same as, how a paid plan's usage limit counts them.

- About two thirds of the cost was re-reading the conversation so far, which happens at every step.
  What the model wrote back was about an eighth.
- The 86 reviewer agents cost about a fifth of everything. In the 26 conversations that ran
  reviews, just over half of the main conversation's cost came after the first reviewer started.
- When that first reviewer started, the conversation held a median of 265,000 tokens. A new
  conversation starts at about 61,000.

So the reviewers, plus everything the same conversation did after they started, came to about half
of all usage — and that later work ran in a conversation typically four times the size of a new
one. Not all of it was fixing: it also covers the changelog and the pull request, and about a fifth
of it came more than three hours after the last reviewer started, which is more likely resumed or
unrelated work. That is why reviews now run in a new chat, and why a
second round sees only the fixes. Issue #278 checks whether that worked, and says how to repeat
the measurement.

### The refuter can be wrong too

On the 2026-08-18 lobby-`404` wave (pull request #181), the pass briefed to disprove confidently
claimed the client's friends list "is never sent", reasoning from an unused constant — while
`data/first.json` shipped a hardcoded empty `FriendsData` entry at the time. Acting on it would have
put a fresh error into the docs. It happened again on #91 (2026-08-27): the two reviewers split over
whether a friend row with a non-positive id can be invited, and only reading `GuiFriendListEntry`
settled it — the row is greyed but still clickable, and `online` alone blocks the invite.

### Ideas keep their reasoning only when they have an issue (#149)

Measured on the #149 community review (2026-08-26): every idea that left that session **with an
issue** kept its design advice — the "use a visible rotation instead of a random pick" option sits
in issue #200's body *and* in its kickoff prompt — and every idea that left **without** one lost
it. The shape of a league, the reason per-tournament balancing is impossible, and the fact that
anti-turtling shares a decision with #98 appeared nowhere in this repo until 2026-08-27, surviving
only in a plan file outside it.

### Narrowing the traps file (#258)

Measured on the traps file as it stood before that narrowing: its four sharpest traps came to 2.3%
of it, its three largest entries to 40%. The rule "keep what a session must *do*; move why we know
it" has a sharper form — "if the sentence needs a because, the because goes to `docs/`" — which
settled the one entry it was written for, but it is not a general test: only three of the remaining
entries contain the word, and most have no `docs/` page to send reasoning to.
