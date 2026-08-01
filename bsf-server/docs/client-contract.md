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
| R1 | The `user_id` we send at login must fit a **signed 32-bit whole number**, and must not be **zero** — the client's credentials only become valid when it is truthy, so a `0` fails login outright. | `architecture.md` → "What this client expects from the server" | `accountId.ts` | **HOLDS**, but unguarded — #166 |
| R2 | Both players must receive the **same** number for the same person. The client writes it into every unit's identity string and checksums it — reading it from the party's **`team`** field, not `user`. | `battle-engine.md` → "Entity ID format — the lockstep contract" | `Battle.ts` sends `team: String(session.account_id)` | **HOLDS** — see R2 note |
| R3 | Two different people must **never** share that number. | same | `accountIdFromSnowflake` keeps only the low 30 bits | **BROKEN** — #140 |
| R4 | The number at the end of the login path is a **protocol version**, not a magic value. | `architecture.md` → "What this client expects from the server" | `"11"` is hardcoded as the no-session bypass | **BROKEN**, latent — #167 |
| R5 | The session key sits **immediately after the route group**, which is not always the last path segment — two routes put path parts after it. | `wire-protocol.md` → "Anatomy of every request" | our check reads the **last** segment | **BROKEN** — #72 / #119 / #98 |
| R6 | The session key is opaque to the client — any format is fine. | same | 32 hex characters | **HOLDS** |
| R7 | The client **sleeps between polls** — 3 s by default, 1 s in battle, 2 s on the matchmaking and lobby screens, 0.5 s around chat — and never lengthens the gap after an error. | `wire-protocol.md` → "Long-poll mechanics" (corrected by BSF-Client #18 — see R7 note) | `pollingActive` guard, `game.ts` | **HOLDS** — measured |
| R8 | The server may hold a poll open; the client will wait. | same | 5-second hold, `game.ts` | **HOLDS** — measured |
| R9 | A message pushed while no poll is waiting must survive until the next poll. | same | `session.data` buffer | **UNPROVEN** — #168 |
| R10 | The client **re-sends a failed request by itself** on response codes `0`, `404`, or `500`-and-above, with no attempt counter anywhere in the retry path. | `mod-bridge.md` → "The HTTP tap"; confirmed in `HttpAction.as:346` | nothing accounts for this | **BROKEN** — #164 |
| R11 | Unit identity strings are built **on the client** from the party's `team` field; we must not invent our own. | `battle-engine.md` → "Entity ID format — the lockstep contract" | we never build them | **HOLDS** |
| R12 | End-of-battle rewards are read **by party position**, not winner-first. | `battle-engine.md` → "Endgame — what `BattleFinishedData` carries" | `Battle.ts`, asserted in tests | **HOLDS** |
| R13 | In battle a unit fights with its **roster** numbers; per-unit stats inside a battle payload are ignored. | `data-model.md` → "Your account and roster" | documented; no code depends on the wrong belief | **HOLDS** |
| R14 | An offline practice battle makes **zero** server calls. | `offline-ai.md` → "What it is" | nothing expects battle traffic to exist | **HOLDS** |
| R15 | Each client sends a per-turn checksum; we must **relay it to the opponent unaltered**. The clients compare it themselves. | `battle-engine.md` → "Per-turn DJB hash" | `/battle/sync` builds the message and pushes it to the opponent | **HOLDS** — see R15 note |
| R16 | Lobby requests arrive as plain text, not JSON. | `wire-protocol.md` → "Lobby" | `lobby.ts` wires a text body parser | **HOLDS** |
| R17 | Location and chat request bodies are plain text. | `wire-protocol.md` → "Game (long-poll + misc)" and "Chat" | handled per-route | **HOLDS** |
| R18 | A stat purchase can carry a change **greater than one, and negative** — right-clicking moves points back out. | `wire-protocol.md` → "Roster" | `-20` to `20` accepted since #118 | **HOLDS** |
| R19 | Because the client re-sends by itself (R10), **every mutation it can retry must be safe to apply twice.** | consequence of `HttpAction.canRetry` | `/battle/killed` is; the roster routes are not | **BROKEN** — #164 |
| R20 | Every battle-scoped message we push must carry the **matching `battle_id`**, or the client will not consume it. | `BattleFsm.handleOneMessage` | 13 push sites, not individually checked | **UNPROVEN** — see R20 note |
| R21 | A refused (`429`) poll costs the client a **full poll gap**, not a retry. | `HttpCommunicator` re-arm path | `pollingActive` guard, `game.ts` | **HOLDS** — see R21 note |
| R22 | Our `/account/info` answer must satisfy the schema the client validates it against. | `data-model.md` → "The three-part pattern, read once" | not verified field-by-field | **UNPROVEN** — see R22 note |
| R23 | A lobby id the client is holding must stay resolvable, or the request loops. | consequence of R10 + `wire-protocol.md` → "Lobby" | lobbies are in memory only | **BROKEN** — #164 |

**Fourteen hold, six are broken, three cannot yet be decided.**

## The broken ones, in plain English

### R10 — the client retries by itself, and never gives up

This is the most consequential finding, and nothing on our side was written with it in mind.

When a request fails, the client waits one to two seconds and **sends it again** — automatically. It
does this when the response code is `0` (no answer at all), `404` ("not found"), or anything `500` and
above ("server error"). It does **not** retry `400`, `403`, or `409`.

**There is no attempt counter** — no such field exists on the request class, nor in the resend path. A
retry ends only when something calls `abort()`, and that matters more than it sounds: battle requests
are aborted by battle-state cleanup, but the eleven requests driven straight from menu screens —
roster, lobby, leaderboard, tournament, location — are **never aborted by anything**, so for those the
loop really does last as long as the process.

Twenty-three classes set the flag; because one of them is the shared battle base class, **twenty-five
concrete kinds of request** actually retry (`/battle/deploy`, `/battle/ready` and `/battle/sync`
inherit it without setting it). The renown-spending roster routes are covered — hire, promote, retire,
stat purchase, barracks row unlock — though **not every renown route**: `/roster/unit/rename` charges
10 renown and does *not* opt in.

Two things follow, and both bite us today:

**A lost success reply becomes a permanent loop.** Say a player retires a unit. We remove it, refund
the renown, and reply "done" — but the reply never arrives. The client re-sends. This time the unit is
already gone, so we answer "not found", which is a code the client retries. It will keep asking every
two seconds for as long as the game is open. Our roster code alone answers "not found" seven times and
"server error" eight times, so there are plenty of doors into this.

**It changes what issue #144 actually is.** #144 (a unit's retirement refunding twice) was postponed on
the understanding that it needed an unlucky race between two clicks. The retry supplies a second,
non-human way into that same race — but note the mechanism carefully, because an earlier version of
this document got it wrong. `saveRosterAndAddRenown` is a **single `UPDATE`**, run synchronously, so
there is no "half-written" state to recover from; if it throws, nothing was written and replaying is
correct. The real hazard is **two requests overlapping**: both read the roster, both find the unit,
both compute a refund, both add it. That comes from a `0`-code retry firing while the first request is
still in flight. Consequently the planned #154 change (refunding nothing on retire) **does** fully
remove the double payment — with a refund of zero the replay is harmless — and #144's entire remaining
substance is the retry loop itself, which is this requirement.

**The rule to work by**, in order:

1. **Make the mutation safe to repeat, and answer `200` on the repeat.** This is what the original
   2013 server did: `UnitRetireSvc.java` never checks that the unit exists — it deletes by id, which is
   a no-op if it is already gone, and returns success. The client's aggressive retry was designed
   against a server that behaved this way. It also leaves the player's screen *correct*, because the
   success path is what refreshes their roster and renown.
2. **Use `400`, `403`, or `409` for genuinely invalid input** — a bad stat delta, inviting yourself,
   editing someone else's lobby. Our lobby routes already do this.
3. **Keep `5xx` for genuinely transient failures**, where repeating really is the right move.

A `409` stops the loop but leaves the client's view stale, so it is the fallback, not the goal. And
beware the obvious-looking choice: **`501 Not Implemented` is retryable** (`>= 500`), so it is exactly
the wrong code for a route we have not built. This is recorded as a trap in
[`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

**Live instances.** `app.ts`'s session gate answered `501` to any request carrying an unexchanged
Discord token — in our own crossplay login path, reachable by any Discord player — until it was changed
to `409` (see [`error-handling.md`](./error-handling.md)). `Battle.ts`'s `/battle/query` answers `404`
when a turn record is missing; the client's query fires when an opponent's turn times out, so a miss
triples the query rate at exactly the wrong moment (bounded by battle cleanup, so not endless).
**`/services/tourney/join`** is the unbounded one: the client knows the route, we have not built it,
and its session key is the last path segment, so it passes our session check, matches no route, and
receives the framework's default "not found". `/services/iap/info` is the same shape but unreachable on
our server today. The unit-variation route escapes only by accident — its session key is not the last
segment, so our check rejects it with "forbidden" first, and "forbidden" is not retried.

### R19 — anything the client can retry must survive being applied twice

R10 records *that* the client re-sends. This is the obligation that follows, and it is the one the
original server actually met: make the action safe to repeat.

We already have a good example. A kill report is explicitly replay-safe — a repeat of a fully-confirmed
kill is recognised and returns early as a no-op, so a resent `/battle/killed` changes nothing. That is
the shape every retryable mutation wants.

The renown-spending roster routes are not there yet. They read the roster, decide, and write; a second
copy of the same request arriving before the first has finished sees the same starting state and
decides the same thing again. This is what #144 turned out to be, and the general fix is the same as
R10's: make the repeat harmless and answer success, rather than trying to detect and reject it.

### R23 — a lobby the client still believes in

Lobbies live only in memory, and a lobby's id is its owner's player number. When the server restarts,
every lobby vanishes but the clients don't know that. The next lobby request a client sends against the
id it is holding finds nothing and gets "not found" — which is a code the client retries, with no
attempt cap. So a restart can leave clients quietly hammering a lobby that no longer exists.

This is an instance of R10 rather than a separate defect: the fix is the same one — answer a permanent
condition with something the client won't retry, or make the request harmless to repeat. Recorded
separately because "lobby state is in-memory only, which is fine for now" was a deliberate decision, and
this is the consequence nobody had connected to it.

### R3 — two people can share one player number, and it blocks them from playing

A Discord account's identifier is far larger than the number the client can hold, so we keep only its
low 30 bits. Two different Discord accounts can land on the same result. Issue #140 records the
consequence as "the same saved-stats row and the same identity inside a battle." There is a third,
player-visible consequence it does not record: our matchmaking treats that number as the identity of a
person, so while one of the two is waiting for a match, **the other is told they are already in the
queue**, and the two can never be matched with each other.

There are really **two** guards, and they do different jobs. One refuses to add a second person to the
queue while a matching number is already in it — that is what produces the "already in the queue"
message. The other refuses to *pair* two entries with the same number. The second one is the important
one: if two colliding players were ever paired, both sides' units would be built with the same identity
prefix and their alive-unit lists would collapse into one, so the battle would fail immediately.

So for whoever fixes #140 properly: the pairing guard is what must not be relaxed to a coarser key
while the number is still derived. Server-assigned numbers make it *moot* rather than needing a
replacement, since distinct numbers cannot collide.

**A smaller fix is available now, without waiting for that.** Both checks could key on the exact
provider id string rather than the derived number — the session layer already de-duplicates on it. That
removes the false "already in the queue" and the false refusal-to-pair today.

### R5 — we look for the session key in the wrong place

The client appends the session key straight after the route group, then adds any extra path parts
*after* it. For almost every route that leaves the key at the end, which is where we look.

**Exactly two routes put something after it**, and we handle them inconsistently:

- **`services/roster/unit/variation/{key}/{unit}/{variation}/{x}`** — we read `{x}` as the session key,
  find no such session, and answer "forbidden". This is the second half of the #72 / #119 / #98
  cluster: the route is missing *and* the key would not be found even if it existed.
- **`services/session/steam/overlay/{key}/{true|false}`** — the same shape, but it works, because the
  routing layer matches that exact path *before* the session check runs and answers it directly.

The overlay route is therefore the working precedent for fixing the variation one. (A note on counting:
the key is the **fifth** segment of the full path as the client sends it, and the fourth once the
`/services` prefix has been stripped — which is the form our own check sees. Both numbers are correct in
their own frame, so say which frame you mean.)

### R4 — we treat a version number as a password

The `11` at the end of the login path is the client's protocol version. We use it as the signal that
"this request is allowed to arrive without a session." It works because `11` is the only version the
shipped game sends. It is worth knowing that this is a coincidence and not a design: a client built
with a different protocol version could not log in at all.

## Ones that hold, where the story is worth knowing

### R15 — the clients check each other; we are the postman

At the top of every turn each client works out a checksum of the whole board and sends it to us. It is
tempting to assume we are meant to compare the two. **We are not, and we do not need to.**

We **relay** the message to the opponent, and the receiving client compares it against its own. On a
mismatch it logs a divergence and **ends the battle** — it does not merely notice. So the requirement
on us is *relay fidelity*: pass `turn` and the checksum along unaltered. We do.

Two corrections worth recording, because an earlier version of this document got both wrong. We do
**not** store the checksum — `/battle/sync` creates an empty turn slot, builds the message and pushes
it; only move and action data are ever kept. And a desync is therefore **not** going unnoticed.

What *is* missing is much smaller: we see a battle end but not why, so a desync leaves no trace in our
logs. Adding a server-side comparison would fix that — but it would need new per-turn storage first, so
it is not the free win it was described as. That is #165, re-scoped from a safety gap to a logging one.

### R21 — a refused poll is cheap, but not free

When two polls from the same session overlap we answer the second with `429`. That is the right
outcome, and the client does **not** retry `429`, so there is no storm.

But it is not free either. The client treats the refusal as a normal response and re-arms its poll
behind the usual gap — so a refused poll costs that player **one full gap** of extra latency (up to
3 s, or 1 s in battle) before they can receive anything. It also counts toward the client's internal
error tally, which drives the "reconnecting…" banner; interleaved successful polls reset it, which is
why an occasional refusal is harmless.

So the guidance is: `429` is correct when two polls genuinely overlap, but **never answer `429` to a
poll we could have answered**. A session stuck refusing every poll is not just noisy — that player
stops receiving pushes entirely.

### R8 — the client has no request timeout at all, and a 5000 waiting to bite

R8 holds — the client will wait as long as we hold the connection — but *why* it holds is worth
knowing, because the code looks like it says otherwise.

`HttpRequest` declares a timer of **5000 ms**, an `INTERNAL_TIMEOUT_STATUS = 999`, a handler that fails
the request when it fires, and a `stop()` call in the completion path. Everything a request timeout
needs — except **`start()` is never called anywhere.** The timer is dead code, so the client has no
request timeout, which is what makes our 5-second hold safe.

Two reasons this is worth writing down. It is almost certainly the origin of the "3000 is a request
timeout" myth that R7 unpicks — the codebase really does contain a dormant request-timeout mechanism.
And its dormant value is **exactly our hold**: if anyone ever "fixes" that timer by starting it, the
client's timeout and our hold land on precisely the same boundary, which is the worst possible place
for them to be. If that ever changes, our hold must drop well below 5 s.

### R2 — the field is `team`, not `user`

The client builds each unit's identity string from the **`team`** field of the battle party, not from
`user`. The party is *keyed* by `user`, which makes `user` the natural-looking one to reach for. We
send the player number in both, so this works today.

It is worth pinning because the names invite a future mistake: `team` reads like it might become a side
index (0 or 1). If anyone ever "tidies" it that way, every unit identity string changes and every
battle desyncs at turn 0, while `user` would still look correct.

### R7 — three sources agreed, and all three were wrong

This is the clearest illustration of why this document exists.

The client's documentation described `DEFAULT_POLL_TIME = 3000` as "the **client request timeout** (not
a sleep)", with the next request firing "immediately. **No back-off.**" It is a sleep. The value is
handed to `HttpAction.send` as its **pre-send delay** argument (`HttpCommunicator.as:135`), and `send`
starts a timer and returns *without sending* (`HttpAction.as:106-114`) — the same argument slot a failed
request's retry delay uses. So the client waits, *then* polls. (Corrected on the client side in
BSF-Client #18.)

Our own documents said the client polls "every ~2 seconds". An internal review in May 2026 "corrected"
that to an "instant 0-backoff reconnect", which is wrong outright, and this audit repeated the review's
error before checking what the argument does.

**The twist: "~2 seconds" was right.** The gap is not one number. Subsystems register their own, and the
shortest wins: 3 s by default, **1 s** in battle, **2 s** on the matchmaking, matched and friend-lobby
screens, and **0.5 s** while a chat message is outstanding. Two seconds is exactly the matchmaking-screen
figure — the likeliest place anyone measured it. The original text was not wrong in magnitude; it was a
correct observation of one screen, generalised.

**What is actually true:** the client sleeps between polls, and the gap never *lengthens* after an error.
It can be *shortened* by a subsystem, and it can also be deferred — any response the client does not
consume restarts the wait, so steady outbound traffic pushes the next poll further out. A message pushed
while a poll is already open still goes out immediately.

## The unproven ones

### R9 — a message pushed into an abandoned poll

When a poll is answered we clear the buffer of pending messages. The check for "have we already
answered?" uses a flag that is not the right signal for a request the client abandoned mid-flight. If a
message were to arrive inside that window, the send would quietly do nothing and the buffer would still
be emptied — losing the message.

The measurement below suggests the window is narrow, and a full battle completed without visible loss,
so this is **low priority but not disproven.** Settling it needs a targeted test that simulates an
abandoned request rather than more log reading.

### R20 — a pushed message without the right `battle_id` is silently lost

The client's battle machine inspects every pushed message before accepting it, and there are two ways
to fall out:

- **No `battle_id` at all** → the message is **not consumed**. It stays in the client's queue and is
  re-examined on every later pass, forever.
- **A `battle_id` that doesn't match the battle in progress** → consumed and **silently discarded**
  (the client's own log calls this "silently eat wrong battle").

Neither produces an error anybody sees. So a battle-scoped push that omits the id doesn't fail loudly —
it quietly accumulates, and the effect a player notices is simply that something never happened.

**Why this is UNPROVEN rather than HOLDS:** the client's requirement is confirmed, but we push battle
messages from thirteen places and they have not been checked one by one. That check is worth doing
precisely because the failure mode is invisible.

### R22 — the account answer is validated, and failing it looks like nothing happened

The client validates loaded data against a schema, and that validation is genuinely switched on — it is
wired at start-up, so a field that doesn't match throws rather than being quietly accepted.

The consequence for us is unusual: when the client can't parse our `/account/info` answer, it does not
show an error. It falls back to its own cached copy from the last successful session, so the player sees
a **stale roster and stale renown** and everything looks like it is working. This has already cost
debugging time before — the symptom points at the server having lost data, when in fact the server sent
data the client refused.

**UNPROVEN** because our answer has never been checked field-by-field against the client's schema. Until
it is, treat "player reports stale roster" as possibly a schema mismatch rather than a data-loss bug.

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
it fired 73 times is strong evidence the connection really did stay open the whole five seconds — so
**the client does not abandon its request early, and our five-second hold is correct as it stands.** An
earlier reading of the client's documentation suggested the opposite; the measurement overruled it, and
chasing *why* the measurement disagreed is what uncovered the poll-gap reading in the R7 note above.

**Read the numbers carefully, though.** 73 + 10 = 83 of the 86 that began waiting; the remaining **3
are unaccounted for** — the only other way out is the client closing the connection, which logs
nothing. That is precisely the abandoned-request case, so this run narrows it rather than eliminating
it. The 6 refusals also never entered the 86, so the "7%" uses a different denominator from the other
rows. Treat this as strong support, not proof.

**What causes the refusals.** Not a poll-gap change, as first assumed — the battle machine changes the
gap at most twice per battle, which cannot produce six events. The real mechanism: when the client
receives a response it does not consume, it re-arms its poll; if the previous poll is still in flight
it is not cancelled, and a second one goes out alongside it. That can fire on any battle, lobby,
matchmaking or chat response. Our `pollingActive` guard is what turns the duplicate into a `429`, which
is the correct outcome — and the client does not retry `429`, so there is no storm. The cost is one
poll gap of added latency for that message.

**What this does not settle.** The counter above missed the case where a poll is answered instantly
because messages were already waiting, so the "answered early" figure is **not** a count of messages
delivered and must not be read as one. That gap, plus the 3 unexplained polls, is why R9 is still open.

## Keeping this current

Re-check this list when any of these happen:

1. **A route is added, removed, or changes shape** — add or update its rows here in the same change.
2. **A client document changes** — the client repository is the authority for every "where the client
   says so" cell; if one moves, follow it.
3. **An issue in the Status column closes** — flip the row to HOLDS and say what proves it.

**One check worth running mechanically, rather than by eye.** Both routes that loop (R10) were found by
noticing them individually, which is exactly the method that misses the third one. The client declares
each route as a constant on its transaction class, and our routers are mounted in one file — so
comparing the two lists is a mechanical sweep, not a reading exercise. Run it whenever a route is added
on either side. That is how `/services/iap/info` turned up after `/services/tourney/join` had already
been found and treated as the only case.

Filling a row in by reasoning alone is how this drifted in the first place. Requirement R7 is the
cautionary case: the client's documentation, an internal review from May 2026, and this audit's own
first pass **all agreed with each other and were all wrong**, because each inherited the same
misreading of one function argument instead of checking what that argument does. Three consistent
sources are not evidence.

**Prefer a measurement to an inference. When a measurement contradicts a document, find out why before
recording either** — the disagreement is the finding. When only an inference is available, mark the row
UNPROVEN rather than HOLDS.
