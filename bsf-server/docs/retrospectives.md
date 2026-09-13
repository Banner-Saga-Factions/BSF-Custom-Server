# What past work taught us

## Co-Authored-By: Claude <noreply@anthropic.com>

This page keeps lessons that have no other home. What to *do* belongs in the guide that owns the
subject — the deployment guide, the traps file, `CLAUDE.md` — and what shipped belongs in
[`../CHANGELOG.md`](../CHANGELOG.md). Only the part left over, the lesson about how we work that
no single guide owns, is written here.

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
