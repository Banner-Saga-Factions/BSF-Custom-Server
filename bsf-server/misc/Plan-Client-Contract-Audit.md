# Plan — check the server against the game client's documentation

Companion to [`Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md`](./Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md)
and [`Plan-Wave-2-Server-Doc-Reciprocity.md`](./Plan-Wave-2-Server-Doc-Reciprocity.md), which covered the
same client documentation from the *linking* angle. This plan covers the *correctness* angle.

**Status: Wave 3 complete. Wave 3b next; Wave 4 is a separate chat.**

---

## Why this exists

The game client gained its own documentation in July 2026 (BSF-Client pull requests #15, #16, #17).
Two server pull requests absorbed it — **#162** (roadmap) and **#163** (reciprocal links) — but both
were documentation-only and link-focused. They corrected four accuracy problems that happened to sit on
lines they were already editing, and deliberately stopped there.

Nobody had checked our **code** against it. Every server change up to and including **#156** was made
when there was no written account of how the client behaves, so those changes encoded assumptions
about it — how often it polls, how long it waits, what it does with the player number we send, what it
does when a request fails — that could not be checked at the time.

They can be checked now. The client's fifteen documents work as a test sheet for this server.

## What "done" looks like

A permanent document — [`../docs/client-contract.md`](../docs/client-contract.md) — that lists every
requirement the client places on us, with a pass/fail status and the evidence for it, so the next
session inherits the answers instead of re-deriving them.

## Method

1. Read all fifteen files under `bsf-client/docs/` at client commit `4d48d2d`; write down every
   statement that constrains what this server must do.
2. Check each one against `bsf-server/src/`. Mark **HOLDS**, **BROKEN**, or **UNPROVEN**.
3. **Measure anything about runtime behaviour rather than inferring it** (see "What measurement
   changed" below — this step overturned a finding).
4. Record the result in `docs/client-contract.md`; open one issue per broken requirement.
5. Fix documentation-only errors in the same pull request; leave code fixes to their own.

Two traps worth carrying forward, both of which have already cost us a wrong answer:

- **Work out where the session key sits before copying a route** out of a client route table. The
  client appends it right after the route group, which is usually the end of the path but not always.
  This is requirement R5 and it caused a wrong route in Wave 2.
- **Never cite a client document by section number alone** — name the heading text instead.

## Result

Eighteen requirements found. **Thirteen hold, four are broken, one is unproven** — after two review
passes withdrew one false finding (R15) and corrected several others; see "What review changed" below.
Details and the
per-requirement evidence are in [`../docs/client-contract.md`](../docs/client-contract.md); the short
version:

| Requirement | Problem | Tracked as |
|---|---|---|
| **R10** | The client re-sends failed requests forever on `0` / `404` / `5xx`, with no attempt cap, on all 23 opted-in request types. Nothing on our side accounted for it. A permanent condition answered `404` loops at 1–2 s indefinitely. | **#164** |
| ~~R15~~ | **Withdrawn — this was a false finding.** The clients compare the checksums *themselves* and end the battle on a mismatch; we relay, which is all that is required, and we do not store the checksum at all. What remains is only that a desync leaves no trace in *our* logs. | **#165**, re-scoped to observability |
| **R3** | Two Discord accounts can share one player number. Beyond the known shared-row residual, matchmaking treats the number as a person, so one player is told they are "already in the queue" when the *other* is queued, and the two can never be matched. | folds into #140 |
| **R5** | We read the session key from the last path segment; the unit-variation route puts it fourth. | #72 / #119 / #98 |
| **R4** | We use the client's protocol version `11` as the "no session required" signal. It works only because `11` is the sole version the shipped game sends. | **#167**, latent |
| **R1** | Nothing asserts the player number we send fits the signed 32-bit variable the client stores it in. Holds in practice; unguarded. | **#166** |
| **R9** | A message pushed into a poll the client abandoned mid-flight may be dropped. Low priority, narrow window, not disproven. | **#168** |

**R10 also changes what issue #144 is.** #144 (a retirement refunding twice) was postponed on the
understanding that it needed an unlucky race between two clicks. The client's automatic re-send gives
that race a second, non-human way in — but *the mechanism matters, and the first version of this plan
got it wrong.* `saveRosterAndAddRenown` is a **single synchronous `UPDATE`**, so there is no
"half-written then throws" state; if it fails, nothing was written and replaying is correct. The real
hazard is **two requests overlapping**: both read the roster, both find the unit, both add the refund —
which a `0`-code retry can cause while the first request is still in flight.

Consequently **#154 (refund = 0) fully removes the double payment**, and #144's remaining substance is
the loop itself — i.e. it is #164. Fold it in rather than un-postponing it as a separate item. Worth
closing the read-then-write window on general principle too, with a `WHERE`-guarded conditional update;
`expandBarracks` already has that pattern.

## What measurement changed

Reading the client's documentation suggested our five-second long-poll hold was wrong, because the
client's request timeout is documented as three seconds — one second during a battle. A captured
two-player battle disproved it: **85% of polls waited the full five seconds.** The log line that proves
this is only written from inside the five-second timer, and an abandoned request would have cancelled
that timer first. So the hold is correct as it stands, and what is actually wrong is the client
document's description of that three-second value — a Wave 3b correction, not a server bug.

**Then chasing *why* the measurement disagreed produced the sharpest finding of the whole sweep.** The
client's three-second value is not a request timeout at all — it is a **sleep between polls.** It is
handed to `HttpAction.send` as that function's pre-send delay argument (`HttpCommunicator.as:135`), and
`send` starts a timer and returns without sending (`HttpAction.as:106-114`) — the same argument slot a
failed request's retry delay uses.

So the client waits three seconds, *then* polls; one second during a battle. Our documents said "every
~2 seconds", which was right in kind and wrong in magnitude. An internal review in **May 2026**
"corrected" that to an "instant 0-backoff reconnect", which is wrong outright — and **this audit's own
first pass repeated the review's error** before checking what the argument does.

The lesson is stronger than "prefer a measurement". The client's documentation, the May 2026 review, and
this audit's first pass **all agreed with each other and were all wrong**, because each inherited the
same misreading rather than reading the function. Three consistent sources are not evidence. When a
measurement contradicts a document, **find out why before recording either** — the disagreement is the
finding.

## What review changed

After the audit landed, two independent reviews went over it — one fact-checking every citation against
the source on both sides, one weighing the reasoning. Between them they withdrew **one finding
entirely** and corrected several more. The corrections are worth reading as a set, because they share
one shape.

- **R15 was false.** Claimed we store both checksums and never compare them. We store neither and the
  clients compare them themselves, ending the battle on a mismatch.
- **The #144 mechanism was wrong** — a read-then-write race, not a partial write (above).
- **The retry rule was backwards.** "Answer `4xx` instead of `404`" stops the loop but leaves the
  player's screen stale, because the success path is what refreshes it. The original server was
  idempotent and answered `200` on a replay; that is the target, with `4xx` as the fallback.
- **"~2 seconds" was right after all.** The poll gap is not one number — subsystems register their own
  and the shortest wins (3 s default, 1 s battle, 2 s matchmaking/lobby, 0.5 s chat). The original
  observation was correct for one screen and over-generalised, not wrong.
- **The 429 explanation was wrong**, several counts were off, and the measured numbers do not fully
  close (3 of 86 polls unaccounted for), so "proves" was too strong.
- **The audit missed a live instance more reachable than the one it named** — the session gate answered
  `501` to any unexchanged Discord token, in our own login path.

**Every one of these is on the client side of the line.** The audit verified our code and *inferred*
the client's. So the rule from "What measurement changed" needs a second half:

> Measure rather than infer — **and when a claim spans both sides of the boundary, read both sides.**
> Checking only the half you own reproduces exactly the error you set out to find.

## Waves

| Wave | Scope | State |
|---|---|---|
| **3** | The sweep, `docs/client-contract.md`, the documentation-only fixes, the issues. Branch `docs/client-contract-audit`. | done |
| **3b** | Correct the claims about **our** server in the client's own documentation — the "10 s" hold and the checksum cross-check. Pull request against BSF-Client off `master`, then a parent pull request bumping the submodule pointer. | next |
| **4** | Fix the broken requirements. One branch and one pull request per fix, in severity order, starting with R10. | separate chat |

Wave 4 is deliberately not scoped here — it is scoped from the issue list once Wave 3b lands.
