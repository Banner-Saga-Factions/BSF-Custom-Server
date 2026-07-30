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

Eighteen requirements found. **Twelve hold, five are broken, one is unproven.** Details and the
per-requirement evidence are in [`../docs/client-contract.md`](../docs/client-contract.md); the short
version:

| Requirement | Problem | Tracked as |
|---|---|---|
| **R10** | The client re-sends failed requests forever on `0` / `404` / `5xx`, with no attempt cap, on all 23 opted-in request types. Nothing on our side accounted for it. A permanent condition answered `404` loops at 1–2 s indefinitely. | **#164** |
| **R15** | We store both players' per-turn checksums and never compare them, though the client's documentation says we cross-check. A free safeguard is going unused. | **#165** |
| **R3** | Two Discord accounts can share one player number. Beyond the known shared-row residual, matchmaking treats the number as a person, so one player is told they are "already in the queue" when the *other* is queued, and the two can never be matched. | folds into #140 |
| **R5** | We read the session key from the last path segment; the unit-variation route puts it fourth. | #72 / #119 / #98 |
| **R4** | We use the client's protocol version `11` as the "no session required" signal. It works only because `11` is the sole version the shipped game sends. | **#167**, latent |
| **R1** | Nothing asserts the player number we send fits the signed 32-bit variable the client stores it in. Holds in practice; unguarded. | **#166** |
| **R9** | A message pushed into a poll the client abandoned mid-flight may be dropped. Low priority, narrow window, not disproven. | **#168** |

**R10 also changes an existing decision.** Issue **#144** (a retirement refunding twice) was postponed
on the understanding that it needed an unlucky race between two clicks. It does not — the client's own
automatic re-send is a likelier trigger, because `roster.ts:141-145` updates in-memory state only after
the database write, so a write that partly succeeds then fails returns `500` and gets replayed. The
planned **#154** change (refunding nothing on retire) still removes the double payment; it does nothing
about the retry loop.

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

## Waves

| Wave | Scope | State |
|---|---|---|
| **3** | The sweep, `docs/client-contract.md`, the documentation-only fixes, the issues. Branch `docs/client-contract-audit`. | done |
| **3b** | Correct the claims about **our** server in the client's own documentation — the "10 s" hold and the checksum cross-check. Pull request against BSF-Client off `master`, then a parent pull request bumping the submodule pointer. | next |
| **4** | Fix the broken requirements. One branch and one pull request per fix, in severity order, starting with R10. | separate chat |

Wave 4 is deliberately not scoped here — it is scoped from the issue list once Wave 3b lands.
