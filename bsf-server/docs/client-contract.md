# What the game client requires of this server

## Co-Authored-By: Claude <noreply@anthropic.com>

The game client was written years before this server existed, and it cannot be changed easily — every
change means rebuilding the game file. So where the two disagree, **the client wins and we adapt.**

This document lists every requirement the client places on us, taken from the client's own
documentation and checked against our code, one at a time. Each row says what the client needs, where
the client's documents say so, where we satisfy it, and whether we actually do.

Companion documents: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (how our side is built),
[`serverEndpoints.md`](./serverEndpoints.md) (request and response shapes), and on the client side
`bsf-client/docs/wire-protocol.md` ([local](../../bsf-client/docs/wire-protocol.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/wire-protocol.md)),
which is the mirror of this list written from the other direction.

## How this list was generated

Read all fifteen documents under `bsf-client/docs/` ([local](../../bsf-client/docs/) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/tree/master/docs/))
at client commit `4d48d2d`, wrote down every statement that constrains what this server must do, then
checked each one against `bsf-server/src/`. Where a client document made a claim about *runtime*
behaviour, the claim was measured rather than assumed — see [Measured evidence](#measured-evidence).

Two reading rules that this sweep learned the hard way, worth repeating for whoever re-runs it:

- **Work out where the session key sits before copying any route.** The client appends it as
  `urlCred` right after the route group, which is usually — but **not always** — the end of the path.
  A path copied straight out of a client route table silently loses the key. This is requirement R5
  below, and it is why the unit-variation route returns "forbidden" rather than "not found".
- **Never cite a client document by section number alone** — the numbers move. Name the heading.

## The requirements

Status meanings — **HOLDS**: we satisfy it. **BROKEN**: we do not, with the issue that tracks it.
**UNPROVEN**: we cannot yet tell.

| # | What the client requires | Where the client says so | Our side | Status |
|---|---|---|---|---|
| R1 | The `user_id` we send at login must fit a **signed 32-bit whole number**. The client stores it in a variable that cannot hold more. | `architecture.md` → "What this client expects from the server" | `accountId.ts` | **HOLDS**, but unguarded — #166 |
| R2 | Both players must receive the **same** number for the same person. The client writes it into every unit's identity string and checksums it. | `battle-engine.md` → "Entity ID format — the lockstep contract" | one derived value sent to both | **HOLDS** |
| R3 | Two different people must **never** share that number. | same | `accountIdFromSnowflake` keeps only the low 30 bits | **BROKEN** — #140 |
| R4 | The number at the end of the login path is a **protocol version**, not a magic value. | `architecture.md` → "What this client expects from the server" | `"11"` is hardcoded as the no-session bypass | **BROKEN**, latent — #167 |
| R5 | The session key sits **immediately after the route group**, which is not always the last path segment. | `wire-protocol.md` → "Anatomy of every request" | our check reads the **last** segment | **BROKEN** — #72 / #119 / #98 |
| R6 | The session key is opaque to the client — any format is fine. | same | 32 hex characters | **HOLDS** |
| R7 | The client waits a **fixed gap** between polls — 3 s normally, 1 s in battle — and never lengthens it after an error. | `wire-protocol.md` → "Long-poll mechanics" (**states the opposite** — see R7 note) | `pollingActive` guard, `game.ts` | **HOLDS** — measured |
| R8 | The server may hold a poll open; the client will wait. | same | 5-second hold, `game.ts` | **HOLDS** — measured |
| R9 | A message pushed while no poll is waiting must survive until the next poll. | same | `session.data` buffer | **UNPROVEN** — #168 |
| R10 | The client **re-sends a failed request by itself**, with no limit, on response codes `0`, `404`, or `500`-and-above. | `mod-bridge.md` → "The HTTP tap"; confirmed in `HttpAction.as:346` | nothing accounts for this | **BROKEN** — #164 |
| R11 | Unit identity strings are built **on the client**; we must not invent our own. | `battle-engine.md` → "Entity ID format — the lockstep contract" | we never build them | **HOLDS** |
| R12 | End-of-battle rewards are read **by party position**, not winner-first. | `battle-engine.md` → "Endgame — what `BattleFinishedData` carries" | `Battle.ts`, asserted in tests | **HOLDS** |
| R13 | In battle a unit fights with its **roster** numbers; per-unit stats inside a battle payload are ignored. | `data-model.md` → "Your account and roster" | documented; no code depends on the wrong belief | **HOLDS** |
| R14 | An offline practice battle makes **zero** server calls. | `offline-ai.md` → "What it is" | nothing expects battle traffic to exist | **HOLDS** |
| R15 | Each client sends a per-turn checksum so the two sides can prove they stayed in step. | `battle-engine.md` → "Per-turn DJB hash" | `Battle.ts` stores and logs each one | **BROKEN** — #165 |
| R16 | Lobby requests arrive as plain text, not JSON. | `wire-protocol.md` → "Lobby" | `lobby.ts` wires a text body parser | **HOLDS** |
| R17 | Location and chat request bodies are plain text. | `wire-protocol.md` → "Game (long-poll + misc)" and "Chat" | handled per-route | **HOLDS** |
| R18 | A stat purchase can carry a change **greater than one, and negative** — right-clicking moves points back out. | `wire-protocol.md` → "Roster" | `-20` to `20` accepted since #118 | **HOLDS** |

**Twelve hold, five are broken, one cannot yet be decided.**

## The broken ones, in plain English

### R10 — the client retries by itself, and never gives up

This is the most consequential finding, and nothing on our side was written with it in mind.

When a request fails, the client waits one to two seconds and **sends it again** — automatically, with
**no limit on how many times.** It does this when the response code is `0` (no answer at all), `404`
("not found"), or anything `500` and above ("server error"). It does **not** retry `400`, `403`, or
`409`. Twenty-three kinds of request opt in, including **every request that spends or refunds
renown** — hire, promote, retire, stat purchase, barracks row unlock — plus every battle and lobby
request.

Two things follow, and both bite us today:

**A lost success reply becomes a permanent loop.** Say a player retires a unit. We remove it, refund
the renown, and reply "done" — but the reply never arrives. The client re-sends. This time the unit is
already gone, so we answer "not found", which is a code the client retries. It will keep asking every
two seconds for as long as the game is open. Our roster code alone answers "not found" seven times and
"server error" nine times, so there are plenty of doors into this.

**It gives issue #144 a second, likelier trigger.** #144 (a unit's retirement refunding twice) was
postponed on the understanding that it needed an unlucky race between two clicks. It does not: we
update the in-memory roster *after* the database write, so a write that partly succeeds and then fails
returns "server error", the client re-sends, and the refund can be paid twice. The planned #154 change
(refunding nothing on retire) still removes the double *payment*, but it does nothing about the loop.

**The rule to work by:** never answer a request the client retries with `404` or a `5xx` when the
answer will not change. "This route does not exist yet" and "that unit is not here" are permanent
answers and should use `400`, `403`, or `409`. This is now recorded as a trap in
[`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

A concrete instance already exists: **`/services/tourney/join`**. The client knows that route, we have
not built it, and its session key is the last path segment — so it passes our session check, matches no
route, and receives the framework's default "not found". Any player who reaches a Join Tournament
button starts a permanent retry loop. The unit-variation route escapes the same fate only by accident:
its session key is the **fourth** segment, so our check rejects it with "forbidden" first, and
"forbidden" is not retried.

### R15 — we never compare the two players' checksums

At the top of every turn each client works out a checksum of the whole board and sends it to us,
specifically so that the two sides can be proven to be still playing the same game. We **store and log
both numbers and never compare them.**

That is a safeguard available for free — we already hold both values for the same turn — and the
client's documentation states we perform it, so anyone reading that document would reasonably assume a
desynchronised battle gets noticed. Today it does not.

### R3 — two people can share one player number, and it blocks them from playing

A Discord account's identifier is far larger than the number the client can hold, so we keep only its
low 30 bits. Two different Discord accounts can land on the same result. Issue #140 records the
consequence as "the same saved-stats row and the same identity inside a battle." There is a third,
player-visible consequence it does not record: our matchmaking treats that number as the identity of a
person, so while one of the two is waiting for a match, **the other is told they are already in the
queue**, and the two can never be matched with each other.

Worth writing down for whoever fixes #140 properly: that same check is currently the *only* thing
preventing a genuine battle failure between two colliding players, because both sides' units would be
built with the same identity prefix. A fix that hands out server-assigned numbers must keep an
equivalent guard until it is in place.

### R5 — we look for the session key in the wrong place

The client appends the session key straight after the route group, then adds any extra path parts
*after* it. For almost every route that leaves the key at the end, which is where we look. The
unit-variation route does not: it sends
`services/roster/unit/variation/{key}/{unit}/{variation}/{x}`, so we read `{x}` as the session key,
find no such session, and answer "forbidden". This is the second half of the #72 / #119 / #98 cluster —
the route is missing *and* the key would not be found even if it existed.

### R4 — we treat a version number as a password

The `11` at the end of the login path is the client's protocol version. We use it as the signal that
"this request is allowed to arrive without a session." It works because `11` is the only version the
shipped game sends. It is worth knowing that this is a coincidence and not a design: a client built
with a different protocol version could not log in at all.

### R7 — the client's own documentation has this inverted, and so did ours

Both sides had this wrong, in opposite directions, and it is the clearest illustration of why this
document exists.

The client's `wire-protocol.md` → "Long-poll mechanics" says its `DEFAULT_POLL_TIME = 3000` is "the
**client request timeout** (not a sleep)" and that "on any response … the next request fires
immediately. **No back-off.**" It is a sleep. That value is handed to `HttpAction.send` as its
**pre-send delay** argument (`HttpCommunicator.as:135`), and `send` starts a timer and returns without
sending (`HttpAction.as:106-114`) — the same argument slot a failed request's retry delay uses. So the
client waits 3 seconds, *then* polls; 1 second during a battle, via the poll-time requirement the
battle machine registers.

Our own documents said the client polls "every ~2 seconds", which was right in kind and wrong in
magnitude. An internal review in May 2026 then "corrected" this to an "instant 0-backoff reconnect",
which is wrong outright — and this audit initially repeated that error before checking the argument
semantics.

**What is actually true:** there is a fixed gap between polls (3 s, or 1 s in battle) that never grows;
a message pushed while a poll is already open is delivered immediately; a message pushed during the gap
waits up to the gap. Worst-case delivery latency is therefore the gap, not the server's 5-second hold.

## The unproven one

### R9 — a message pushed into an abandoned poll

When a poll is answered we clear the buffer of pending messages. The check for "have we already
answered?" uses a flag that is not the right signal for a request the client abandoned mid-flight. If a
message were to arrive inside that window, the send would quietly do nothing and the buffer would still
be emptied — losing the message.

The measurement below suggests the window is narrow, and a full battle completed without visible loss,
so this is **low priority but not disproven.** Settling it needs a targeted test that simulates an
abandoned request rather than more log reading.

## Measured evidence

One complete two-player battle on 2026-07-28, server output captured, two clients on one machine:

| Measurement | Count |
|---|---|
| Polls that began waiting | 86 |
| Polls that waited the full 5 seconds | 73 (85%) |
| Polls answered early because a message arrived | 10 |
| Polls refused because an earlier one was still open | 6 (7%) |

**What this settles.** The "waited the full 5 seconds" line is only recorded from inside the
five-second timer, and an abandoned request would have cancelled that timer before it could fire. That
it fired 73 times proves the connection really did stay open the whole five seconds — so **the client
does not abandon its request early, and our five-second hold is correct as it stands.** An earlier
reading of the client's documentation suggested the opposite; the measurement overrules it, and chasing
*why* the measurement disagreed is what uncovered the inverted poll-gap reading in the R7 note above.

The 7% refusal rate is consistent with overlap around a gap change — the battle machine drops the poll
gap from 3 s to 1 s on entry and restores it on exit — rather than a stuck session. That is within what
[`observability.md`](./observability.md) already describes as tolerable occasional double-polling.

**What this does not settle.** The counter above missed the case where a poll is answered instantly
because messages were already waiting, so the "answered early" figure is **not** a count of messages
delivered and must not be read as one. That gap is why R9 is still open.

## Keeping this current

Re-check this list when any of these happen:

1. **A route is added, removed, or changes shape** — add or update its rows here in the same change.
2. **A client document changes** — the client repository is the authority for every "where the client
   says so" cell; if one moves, follow it.
3. **An issue in the Status column closes** — flip the row to HOLDS and say what proves it.

Filling a row in by reasoning alone is how this drifted in the first place. Requirement R7 is the
cautionary case: the client's documentation, an internal review from May 2026, and this audit's own
first pass **all agreed with each other and were all wrong**, because each inherited the same
misreading of one function argument instead of checking what that argument does. Three consistent
sources are not evidence.

**Prefer a measurement to an inference. When a measurement contradicts a document, find out why before
recording either** — the disagreement is the finding. When only an inference is available, mark the row
UNPROVEN rather than HOLDS.
