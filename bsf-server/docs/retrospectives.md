# What past work taught us

## Co-Authored-By: Claude <noreply@anthropic.com>

This page keeps lessons that have no other home. What to *do* belongs in the guide that owns the
subject — the deployment guide, the traps file, `CLAUDE.md` — and what shipped belongs in
[`../CHANGELOG.md`](../CHANGELOG.md). Only the part left over, the lesson about how we work that
no single guide owns, is written here — plus the cases behind the rules in
[`../CLAUDE.md`](../CLAUDE.md), which are too long for a guide that every server session reads.

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

The rules are in the [review skill](../../.claude/skills/bsf-review/SKILL.md), and where a review's
other findings go is in [`../CLAUDE.md`](../CLAUDE.md) under *Code Review*. These are the cases
that produced them.

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

### Where the errors in the client contract were (2026-08-11)

In [`client-contract.md`](client-contract.md) the table is 11% of the words and has carried about
10% of the errors.
The table's *counts* have been exact, so re-deriving them is cheap and rarely
finds anything. But **checking the counts is not checking the table**: R7's cell shipped missing a
poll gap, R14's said "zero server calls" where the truth was "zero battle calls", and R13 and R20
both carried the wrong status. "25 classes" and "30 routes" described the same thing in that
document.

### What only the refuter caught (#181)

Measured on the 2026-08-18 lobby-`404` wave (PR #181): source-verify found 1 error, consistency
found 19, and the adversarial pass found the one that mattered — that the whole "a server restart
makes clients hammer `/lobby/join`" premise was false, in six places, after surviving four earlier
review rounds. (A restart kills the
session and `app.ts`'s gate turns the request away before `LobbyRouter` is ever reached —
`403` when that review ran, `401` today, because #192 split the two by whether the last path segment
is shaped like a session key. See
[*The session gate*](error-handling.md#the-session-gate-where-most-4xx-responses-come-from) for the
rule.)

### The refuter can be wrong too

On the 2026-08-18 lobby-`404` wave (pull request #181), the pass briefed to disprove confidently
claimed the client's friends list "is never sent", reasoning from an unused constant — while
`data/first.json` shipped a hardcoded empty `FriendsData` entry at the time. Acting on it would have
put a fresh error into the docs. It happened again on #91 (2026-08-27): the two reviewers split over
whether a friend row with a non-positive id can be invited, and only reading `GuiFriendListEntry`
settled it — the row is greyed but still clickable, and `online` alone blocks the invite.

It happened twice more in #279's second round (2026-09-15 and 16). One refuter judged "a fresh clone may
have none" false by reading the hook setting in `package.json`, and the session checking it agreed
and drafted a replacement. But that setting installs its copy into a folder git never reads, so the
replacement would have put back the claim the first round had removed. The next refuter tested the
client's hook install with the server's older copy of the hook library, and reported a failure the
client's own version does not have. Both checked a stand-in for the thing that runs.

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

## Moving text between documents

The rules are in [`../CLAUDE.md`](../CLAUDE.md) under *Documentation conventions*. These are the
cases behind two of them.

### Hiding a file name the reader needed (2026-09-08)

The link check cannot tell a sentence that records where a removed file went from a broken link,
because it searches bare file names. A sentence explaining where something went reads better as
*"three recordings — one complete match plus two longer sessions"* with a link to where they now
live, than as a list of file names a reader cannot open. That was the first fix when this same clash
came up for the recorded traffic in 2026-09. A review of that very change found the opposite failure:
having removed all three recording names, the instructions could no longer say
*which* recording our message numbers refer to, and following them as written would have corrupted
a file the tests depend on.

### Sentences that were precise only where they stood (2026-09-09)

On 2026-09-09, trimming [`../CLAUDE.md`](../CLAUDE.md) moved four of its sections into other
documents. Measured on the same 2026-09-09 change: a code comment reading *"the client re-sends
**a** 404"* arrived in a general lobby section, read as underspecified, and was sharpened into
*"`404` is **the one refusal** the game client retries forever"* — false, and contradicted by two
other documents in this very suite. A second one turned *"creating the battle takes both players out of the
queue"* — a fair
summary standing next to the call — into a numbered step crediting the `Battle` constructor with
something it cannot do, since it cannot reach the queue at all. Neither is a typo, and neither
survives being read against **the code** at the destination.

## Replacing a unit is a fresh measurement (2026-09-09)

The rule is in [`../CLAUDE.md`](../CLAUDE.md) under *Changelog Entries*. A change measured a saving
of about 5,800 **tokens**; the changelog entry obeyed "no library terms in the body", wrote *"about
6,000 words"*, and doubled the claim — the figure
needed to change when the unit did. That entry also quoted a finished size taken two commits before
the end, and the last commit put 912 bytes back.

## The wiki review (2026-09-19): one wrong date bought three wrong paragraphs

The seven community wiki pages went into a five-way review before their first push. It found ten
things that had to change before publication, and two patterns are worth keeping.

**Half the refutations were one defect shape.** Of four claims the adversarial reviewer broke, two
were the same error: a true observation about a sample, written up as a universal. The old forum
software was said to keep a single flat page for *every* thread — true of all 26 threads in the
batch that was checked, false for thread 59, which runs to eight pages and would have been
silently truncated by any converter built on the claim. GitHub's wiki search was said not to look
across repositories — true of the search box inside one wiki, false of the product, which
documents global and `org:`-scoped wiki search. This project's notes have recorded that shape
repeatedly; it still beat four reviewers here, and was only caught by the one briefed to hunt for
it by name. **Name the shape in the brief.** It is cheap and it works.

**Errors cluster around a single wrong fact, not evenly across the prose.** Believing the service
closed in 2022 rather than February 2021 produced three separate defects: the year itself on four
pages, a claim that the reference recordings were made "while the official servers were still up",
and an arithmetic claim that the 2013 source was "nine years older than the build that was finally
switched off" — when the last build was also from 2013. Correcting the year alone would have left
two pages internally consistent and still wrong. So when a date or a version is found wrong, **go
and look at what was calculated from it** rather than fixing it in place.

**Where the reviewers disagreed, the disagreement was the finding, twice.** Two reviewers split
over the download size (816 MB decimal against 778 MiB — both right, different units, the page
correct) and over thread 1664 (one confirmed it was linked twice under two titles; the other
fetched the thread and found it legitimately covers two builds, so the page's conclusion that a
label was wrong was itself the error). Neither resolved without going to the source.

**Consent was the finding no reviewer was asked for.** All five checked whether the quotations were
*accurate*. None asked whether the nine named people had agreed to be quoted publicly at all — they
had not, and the conversation was a private Discord channel. The page was pulled and the quotations
were removed from the repository copy as well, which had been publicly readable on github.com the
whole time. **A review brief that asks only "is this true?" will not ask "should this be published?"**

## Trimming a guide does not keep it trimmed (2026-09-20)

On 2026-09-09 more than half of this folder's guide was deleted, because it described the server in
words the documents beside it already carried. The file went from 43,262 bytes to 20,176. Eleven
days later it was **32,140** — grown back by 59%. The cut itself had held perfectly: the six lines
left in place of the architecture section were still there, untouched, at 1,519 bytes.

Every byte of the regrowth was process prose.

| Section | after the cut | eleven days later |
|---|---:|---:|
| Code Review | 7,382 | 10,012 |
| Documentation conventions | 4,960 | 7,126 |
| The backlog, and how work moves | — | 3,538 |
| Working Style | 1,087 | 2,748 |
| everything else, together | 6,747 | 8,716 |

**The routing table caused it, and the routing table is not wrong.** It says *how we work → this
file*, which is correct, and every entry above obeyed it. What it has never said is **how much** may
go there. So the guide is the default home for anything we learn about working, it only ever grows,
and a section cut in half grows back from a direction nobody was watching. One piece is not even
relocation: the work list left `Plan-Master-Roadmap.md` for the public board, taking that file from
67,791 bytes to 7,264 — a real saving — and a new backlog section was then written straight into
the guide that every server session reads, now 3,538 bytes.

**The lesson.** A one-off trim bought eleven days. Deciding *where* knowledge goes is not the same
as deciding *how much* to keep, and only the second one holds on its own. That is why the repository
now has a size the build check enforces rather than a rule about tidiness — see
[`../../.github/workflows/context-budget.yml`](../../.github/workflows/context-budget.yml). Its
first budget for this file was 33,000 bytes — just above the regrown size, so it stopped the next
rise without undoing this one. That 860 bytes of slack was deliberate and it was also small: at the
rate measured here, about 1,100 bytes a day, it was under a day of ordinary working. The check is a
backstop, not a licence. Bringing the file back down was
[#296](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/296), on 2026-09-23: the
cases behind five of its rules moved to this page, the routing table's row became *how we work, the
instruction only → this file, which has a size limit*, and the budget came down to match.

**One measurement worth not re-deriving.** Which guides a session is actually handed was counted the
same day, over 82 recorded sessions: the numbers and what they corrected are in
[`README.md`](README.md), under *What it costs now*.

## No saved report is not the same as no run (2026-09-20)

While moving the reference-mirror tables out of the repository's own guide, the move checked them
against the copies on disk. Two saved comparison reports covered 259 files and 72 files; a third
group of 50 — the ones carrying the shape of every message between the game and the server — had no
saved report at all. The change concluded that those 50 **had never been compared**, wrote that into
the reference page as *"the protocol layer was never checked"*, deleted the existing sentence saying
they were unchanged, and filed an issue to go and find out.

The review ran the comparison. **All 50 match.** The deleted sentence was true, and the figure it
rested on reproduces exactly. The correction was the error.

**The step that went wrong is one word wide.** *We cannot show this was checked* became *this was
never checked* became *this is unverified*. Only the first was true, and each restatement sounded
more certain than the one before it. This is the same shape as compression turning a proposal into a
fact by dropping the word *would* — a hedge disappears, and nothing downstream can tell it ever
existed.

**What makes it expensive is that it inverts the usual risk.** A review is built to catch a claim
that overstates what we know. Nobody staffs a reviewer to catch a claim that *understates* it — a
retraction reads as caution, and caution reads as correct. It survived a four-agent split, and only
the reviewer briefed to disprove went at it, because the brief named it as a claim built on an
absence.

**The lesson, and it is cheap.** *An absence of evidence is a reason to run the check, not a finding
to publish.* Repointing the script and running it took about twenty seconds. The plan that shipped
the retraction had already written down that this claim was "built from an absence, and an absence
is weak evidence" — the weak claim was correctly identified and then not tested. **Identifying the
claim that needs a command, and then not spending the command, is the failure.** If a sentence
rests on something not being there, either go and look or write what you actually know: *no saved
report covers these files.*

One thing the re-run did establish that nobody had noticed: **36 of the 381 files match only because
neither side declares anything the comparison recognises.** An empty signature equalling an empty
signature is not evidence of sameness, so the headline figure is not 369 substantive matches. The
honest doubt was real; it was just about a different thing than the retraction claimed.

