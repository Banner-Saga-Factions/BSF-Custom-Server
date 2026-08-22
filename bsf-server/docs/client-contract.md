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

Read every document under `bsf-client/docs/` ([local](../../bsf-client/docs/) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/tree/master/docs/))
— fifteen of them, plus the index — wrote down every statement that constrains what this server must do, then checked each one against
`bsf-server/src/`. Where a client document made a claim about *runtime* behaviour, the claim was checked
rather than assumed — some of it by measurement, the rest by reading the client's own code. Each row's
evidence note says which. See [Measured evidence](#measured-evidence) for the one dated run.

**Which versions this describes.** Both sides move, so both are pinned: this server at commit
`c56d6be`, and the game client at `1d3a8fe`. The original sweep read the client documents at
`4d48d2d`; four of them have changed since, and the re-check on 2026-08-05 used `2eda546`. If you are
re-running this against a newer client, expect the "where the client says so" column to need following
before anything else.

Three reading rules that this sweep learned the hard way, worth repeating for whoever re-runs it:

- **Work out where the session key sits before copying any route.** The client appends it as
  `urlCred` right after the route group, which is usually — but **not always** — the end of the path.
  A path copied straight out of a client route table silently loses the key. This is requirement R5
  below, and it is why the unit-variation route returns "forbidden" rather than "not found".
- **Never cite a client document by section number alone** — the numbers move. Name the heading.
- **Never cite code by line number either — name the file and the function.** **Six** copies of this
  client exist between the working tree and the read-only references, and the same function sits at a
  different line in most of them.

## The requirements

Status meanings — **HOLDS**: we satisfy it. **BROKEN**: we do not, with the issue that tracks it.
**UNPROVEN**: we cannot yet tell.

**How to read a status.** A status describes what happens **today**, not what could happen. Where a row
carries a qualifier such as "latent risk", the **consequence** is not reachable today, and the qualifier
marks the condition that would make it reachable — always naming the issue that tracks it. So "HOLDS,
latent risk" means *working now, with a known way to break it later*, and "BROKEN, latent risk" means
*the rule is already being violated, but nothing can yet trip over it*. Neither is a softer way of
writing plain BROKEN.

**Every row also says what kind of proof it rests on**, on the second line of its status. There are six
kinds:

- **source** — someone opened the file and read the function named.
- **measured** — observed on a dated run.
- **test** — a named automated test asserts it.
- **copied** — carried over from an earlier review **and re-checked on a stated date**. A note that
  cannot name a re-check date is not a `copied` note; it is worse than reasoning, because nobody knows
  what the original reasoning even was.
- **disputed** — two kinds of evidence disagree, and the disagreement is recorded rather than resolved.
  Only ever on an UNPROVEN row.
- **reasoning** — worked out rather than observed.

**A note reading `reasoning` may not support a HOLDS or a BROKEN.** If reasoning is all you have, the
row is UNPROVEN. That rule exists because every mistake this document has made was a plausible chain of
reasoning written down as though it had been checked.

**One limit worth knowing about `source`.** It certifies that a file was opened, not that the conclusion
drawn from it is right — reading static code to predict *runtime* behaviour is still inference wearing a
strong label. R13 is the worked example: a genuine reading of the client produced a conclusion that a
measurement contradicts. As a rule of thumb, a claim about what the code *says* can rest on `source`; a
claim about what *happens* wants `measured` or `test` before it is trusted very far.

**And a limit on where these notes sit.** They are attached to rows. The paragraphs that explain a
*why* rather than restate a requirement now carry their own note too.

| # | What the client requires | Where the client says so | Our side | Status |
|---|---|---|---|---|
| R1 | The `user_id` we send at login must fit a **signed 32-bit whole number**, and must not be **zero** — the client checks for a missing number explicitly, at three separate login stages, so a `0` fails login outright. | `architecture.md` → "What this client expects from the server" | `accountId.ts` | **HOLDS**, latent risk — #166<br>`[source: accountId.ts → accountIdFromSnowflake]` |
| R2 | Both players must receive the **same** number for the same person. The client writes it into every unit's identity string and checksums it — reading it from the party's **`team`** field, not `user`. | `battle-engine.md` → "Entity ID format — the lockstep contract" | `Battle.ts` sends `team: String(session.account_id)` | **HOLDS** — see R2 note<br>`[source: Battle.ts → createBattlePartyData; BattleBoard → addPartyMember]` |
| R3 | Two different people must **never** share that number. | same | `accountIdFromSnowflake` keeps only the low 30 bits | **BROKEN** — #140<br>`[source: accountId.ts → accountIdFromSnowflake; queue.ts → findBestMatch]` |
| R4 | The number at the end of the login path is a **protocol version**, not a magic value. | `architecture.md` → "What this client expects from the server" | `"11"` is hardcoded as the no-session bypass | **BROKEN**, latent risk — #167<br>`[source: app.ts → the session gate]` |
| R5 | The session key sits **immediately after the route group**, which is not always the last path segment — two routes put path parts after it. | `wire-protocol.md` → "Anatomy of every request" | our check reads the **last** segment | **BROKEN** — #72 / #119 / #98<br>`[source: app.ts → the session gate; the client's route table]` |
| R6 | The session key is opaque to the client — any format is fine. | same | 32 hex characters | **HOLDS**<br>`[source: auth.ts → generateKey]` |
| R7 | The client **sleeps between polls** — 3 s by default, 1 s in battle, **0.7 s at every turn boundary**, 2 s on the matchmaking and lobby screens, 0.5 s around chat — and never lengthens the gap after an error. | `wire-protocol.md` → "Long-poll mechanics" (corrected by BSF-Client #18 — see R7 note) | `pollingActive` guard, `game.ts` | **HOLDS**<br>`[source: BaseBattleState → setPollTimeRequirement, and five other registrations]` |
| R8 | The server may hold a poll open; the client will wait. | same | 5-second hold, `game.ts` | **HOLDS**<br>`[measured 2026-07-28]` |
| R9 | A message pushed while no poll is waiting must survive until the next poll. | same | `session.data` buffer | **UNPROVEN** — #168<br>`[reasoning]` |
| R10 | The client **re-sends a failed request by itself** on response codes `0`, `404`, or `500`-and-above, with no attempt counter anywhere in the retry path. | `mod-bridge.md` → "The HTTP tap" | nothing accounts for this | **BROKEN** — #164<br>`[source: HttpAction → canRetry]` |
| R11 | Unit identity strings are built **on the client** from the party's `team` field; we must not invent our own. | `battle-engine.md` → "Entity ID format — the lockstep contract" | we never build them | **HOLDS**<br>`[source: BattleBoard → addPartyMember; SceneLoader → loadFromDef]` |
| R12 | End-of-battle rewards are read **by party position**, not winner-first. | `battle-engine.md` → "Endgame — what `BattleFinishedData` carries" | `Battle.ts`, asserted in tests | **HOLDS**<br>`[test: battle.test.ts → "a winner at party_index 1 gets their renown at rewards[1], not rewards[0]"]` |
| R13 | The per-unit stats we send with a battle are what **both** players fight with, so they must be the roster's own numbers. | `data-model.md` → "Your account and roster" | the battle party is built from the roster and sent unchanged | **HOLDS** — see R13 note<br>`[measured 2026-08-21 — see "Measured evidence"]` |
| R14 | An offline practice battle makes **zero battle** calls. It is not silent altogether — see the R14 note. | `offline-ai.md` → "What it is" | nothing expects battle traffic to exist | **HOLDS** — see R14 note<br>`[source: the isOnline gates in BattleFsm and the battle states; GameFsm → updateGameLocation; SceneStateBattleHandler → sceneFocusedBoardHandler]` |
| R15 | Each client sends a per-turn checksum; we must **relay it to the opponent unaltered**. The clients compare it themselves. | `battle-engine.md` → "Per-turn DJB hash" | `/battle/sync` builds the message and pushes it to the opponent | **HOLDS** — see R15 note<br>`[source: Battle.ts → the sync handler]` |
| R16 | Lobby requests arrive as plain text, not JSON. | `wire-protocol.md` → "Lobby" | `lobby.ts` wires a text body parser | **HOLDS**<br>`[source: lobby.ts → the text body parser]` |
| R17 | Location and chat request bodies are plain text. | `wire-protocol.md` → "Game (long-poll + misc)" and "Chat" | handled per-route | **HOLDS**<br>`[source: chat.ts → the text body parser]` |
| R18 | A stat purchase can carry a change **greater than one, and negative** — right-clicking moves points back out. | `wire-protocol.md` → "Roster" | `-20` to `20` accepted since #118 | **HOLDS**<br>`[source: roster.ts → the stat-purchase handler]` |
| R19 | Because the client re-sends by itself (R10), **every mutation it can retry must be safe to apply twice.** | consequence of `HttpAction.canRetry` | `/battle/killed` is; the roster routes are not | **BROKEN** — #164<br>`[source: roster.ts → the retire / promote / hire handlers]` |
| R20 | Every battle-scoped message we push must carry the **matching `battle_id`**, or the client will not consume it. | `BattleFsm.handleOneMessage` | all 13 push sites checked | **HOLDS** — see R20 note<br>`[source: Battle.ts → the thirteen push sites; BattleFsm → handleOneMessage]` |
| R21 | A refused (`429`) poll costs the client a **full poll gap**, not a retry. | `HttpCommunicator` re-arm path | `pollingActive` guard, `game.ts` | **HOLDS** — see R21 note<br>`[source: HttpErrorState → noticeError / noticeOk]` |
| R22 | Our `/account/info` answer must satisfy the schema the client validates it against. | `data-model.md` → "The three-part pattern, read once" | not verified field-by-field | **UNPROVEN** — see R22 note<br>`[reasoning: never checked field-by-field]` |
| R23 | A lobby id the client is still holding must never draw a reply the client re-sends. | consequence of R10 + `wire-protocol.md` → "Lobby" | joining answers `409` (room gone) / `403` (not invited); the other seven routes answer success | **HOLDS**<br>`[test: lobby.test.ts → "answers 409 … when the lobby does not exist" and "answers 403 … when the caller was not invited"; source: lobby.ts → the other seven handlers, which answer 200 on a missing lobby]` |

**Sixteen hold, five are broken, two cannot yet be decided.** Recounted from the table above rather
than adjusted by hand. R23 became HOLDS when the lobby join stopped answering a code the client
re-sends, and R13 became HOLDS when a measurement finally settled it — in favour of neither of the two
readings that had been argued over.

## The broken ones, in plain English

### R10 — the client retries by itself, and never gives up

This is the most consequential finding, and nothing on our side was written with it in mind.

When a request fails, the client waits one to two seconds and **sends it again** — automatically. It
does this when the response code is `0` (no answer at all), `404` ("not found"), or anything `500` and
above ("server error"). It does **not** retry `400`, `403`, or `409`.

**One exception is worth knowing, because it is the only way we can currently stop the loop from our
side.** A "server busy" reply whose body says the server is down for maintenance is excluded by the
retry test *itself* — the test asks "is this a maintenance answer?" before it looks at the code at all.
The game then separately abandons the request and shows the player a dialog. So the carve-out is
built into the decision to retry, not bolted on afterwards, which makes it a more reliable lever than
it first appears.

**There is no attempt counter** — no such field exists on the request class, nor in the resend path. A
retry ends only when something calls `abort()`, and the coverage is much thinner than it sounds:

- **Battle requests are only partly covered.** Ready, deploy and sync are abandoned when a battle stage
  is torn down, because each one *registers* itself with its stage; the turn query is abandoned by its
  own stage directly. **Move, action, kill and exit are never abandoned by battle-state cleanup, and
  nothing else reaches them** — with one exception, noted below: a "log in again" or maintenance reply
  abandons whichever request received it. That exception costs nothing in practice, because neither of
  those replies is retried anyway.
- **Menu requests are barely covered.** **Fourteen** of them — roster, lobby, leaderboard, tournament,
  location, colour variation, in-app purchase, Steam overlay — are never abandoned, so for those the
  loop really does last as long as the process. Only the match-start request can be abandoned outright;
  the party-arrange request is abandoned solely by the *next* party change on the same screen, so it too
  outlives leaving that screen.

On top of that, when the game is told to log in again or that the server is down for maintenance, it
abandons **the one request that received that reply** — not everything in flight. Anything else already
retrying carries on. (It does also stop asking for new messages, which limits the damage.)

**Three different numbers describe how much retries, and mixing them up is easy.** Twenty-three
**classes** set the flag. Because one of them is the shared battle base class, never used directly,
**twenty-five concrete classes** retry — `/battle/deploy`, `/battle/ready` and `/battle/sync` inherit the
flag without setting it. And because a single lobby class serves six different routes, **thirty distinct
routes** retry. The last figure is the one to reach for when asking "which of my routes can be
hammered?" An earlier version of this document gave the class count while naming routes in the same
breath, which reads as though only twenty-five routes were exposed.

The renown-spending roster routes are covered — hire, promote, retire, stat purchase, barracks row
unlock — though **not every renown route**: `/roster/unit/rename` charges 10 renown and does *not* opt
in.

Two things follow — one that bites us today, and one that turns out not to:

**A lost success reply becomes a permanent loop.** Say a player retires a unit. We remove it, refund
the renown, and reply "done" — but the reply never arrives. The client re-sends. This time the unit is
already gone, so we answer "not found", which is a code the client retries. It will keep asking every
two seconds for as long as the game is open. Our roster code alone answers "not found" seven times and
"server error" eight times, so there are plenty of doors into this.

**It changes what issue #144 actually is.** #144 (a unit's retirement refunding twice) was postponed on
the understanding that it needed an unlucky race between two clicks.

`[source: connection.ts → query / queryOne / queryUpdate; roster.ts → the retire handler]`

The hazard everyone reaches for is **two requests overlapping**: both read the roster, both find the
unit, both compute a refund, both add it. **That cannot happen today.** This is a **latent** risk rather
than a live one.

Both of the practical conclusions survive regardless. The planned #154 change (refunding nothing on
retire) **does** fully remove the double payment — with a refund of zero the replay is harmless either
way — and #144's entire remaining live substance is the retry loop itself, which is this requirement,
tracked by #164.

**The rule to work by**, in order:

1. **Make the mutation safe to repeat, and answer `200` on the repeat.** This is what the original
   2013 server did: `UnitRetireSvc.java` never checks that the unit exists — it deletes by id, which is
   a no-op if it is already gone, and returns success. The client's aggressive retry was designed
   against a server that behaved this way. It also leaves the player's screen *correct*, because the
   success path is what refreshes their roster and renown.
2. **Use `400`, `403`, or `409` for anything that will not change on a second attempt** — a bad stat
   delta, inviting yourself, editing someone else's lobby, joining a room that is gone or was never
   yours. Our lobby routes do this throughout.
3. **Keep `5xx` for genuinely transient failures**, where repeating really is the right move.

A `409` stops the loop but leaves the client's view stale, so it is the fallback, not the goal. And
beware the obvious-looking choice: **`501 Not Implemented` is retryable** (`>= 500`), so it is exactly
the wrong code for a route we have not built. This is recorded as a trap in
[`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

**Live instances.**

- **`/services/tourney/join` — unbounded.** The client knows the route, we have not built it, and its
  session key is the last path segment, so it passes our session check, matches no route, and receives
  the framework's default "not found". `/services/iap/info` is the same shape but unreachable on our
  server today.
- **Any battle request still retrying after the battle is cleaned up — unbounded.** A battle is removed
  thirty seconds after it ends, as soon as both players have left, or when a turn deadline expires
  against a player whose session has already gone. After that, our battle gate answers "not found" to
  everything battle-scoped. Ready, deploy, sync and the turn query are safe because they get abandoned.
  **Five are not: move, action, kill, exit and surrender** — and of those, kill, exit and surrender are
  the realistic window, because they are the ones in flight around the end of a battle. Any one of them
  still retrying when the battle disappears keeps asking for as long as the game is open.
- **`/services/lobby/join` — fixed.** Joining answered "not found" both when the room was gone and
  when the caller was not invited. The intent was right — the 2013 server silently corrupted state
  instead — but "not found" is precisely the one refusal the client retries. **All eight lobby routes
  retry** (six of them share a single request class, plus invite and options), none reports back to the
  player, and only a session-expiry or maintenance reply can abandon one — so any client that sent a
  join against a room that had already gone kept asking for as long as the game stayed open. It now
  answers `409` for a room that is gone and `403` for a caller who was not invited. See R23 for what
  actually makes a room disappear underneath a player, and for why nobody could reach it in ordinary
  play — neither of which is what this list used to say.
- **`Battle.ts`'s `/battle/query` — bounded.** It answers "not found" when a turn record is missing.
  The client's query fires when an opponent's turn times out, so a miss raises the query rate about
  **2.5×** at exactly the wrong moment — a five-second re-ask on success against a two-second retry on
  failure. Bounded by battle cleanup, so not endless.
- **`app.ts`'s session gate — fixed.** It answered `501` to any request carrying an unexchanged Discord
  token — in our own crossplay login path, reachable by any Discord player — until it was changed to
  `409` (see [`error-handling.md`](./error-handling.md)).
- **The unit-variation route escapes only by accident.** Its session key is not the last segment, so
  our check rejects it with "forbidden" first, and "forbidden" is not retried. See R5 for why that
  accident is load-bearing, and what happens if it is removed in the wrong order.

### R19 — anything the client can retry must survive being applied twice

R10 records *that* the client re-sends. This is the obligation that follows, and it is the one the
original server actually met: make the action safe to repeat.

We already have a good example. A kill report is explicitly replay-safe — a repeat of a fully-confirmed
kill is recognised and returns early as a no-op, so a resent `/battle/killed` changes nothing. That is
the shape every retryable mutation wants.

The renown-spending roster routes are not there yet, and it is worth being precise about *how* they
fail, because the obvious guess is wrong. They are not unsafe because two copies overlap — no second
copy can slip in between one request's read and its write. (Note the narrowness of that claim: it is a
fact about this one code path, **not** a general promise that our requests run one
at a time. Elsewhere they genuinely can interleave: the Discord login exchange waits on a real network
call before it writes the account row.) They are unsafe because **each one does its work again when it
is repeated one after another**, which is exactly what an automatic re-send produces:

- a repeated **promotion** promotes the unit a second time (rank 2 becomes rank 3) and charges 80
  renown again;
- a repeated **stat purchase** applies the same change on top of itself;
- a repeated **barracks row unlock** deducts another 60 renown;
- a repeated **hire** adds a second copy of the unit;
- a repeated **retire** finds the unit already gone and answers "not found" — which is a retryable
  code, so it loops.

The general fix is the same as R10's: make the repeat harmless and answer success, rather than trying
to detect and reject it.

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

So for whoever fixes #140 properly: **the pairing guard must keep using the derived number** for as
long as the number is still derived. It looks like a bug — it refuses to pair two people who really are
different — but that refusal is what stands between them and a battle that fails the moment it starts.
Server-assigned numbers make the guard *moot* rather than needing a replacement, since distinct numbers
cannot collide.

`[source: queue.ts → the duplicate check in the match-start handler, and findBestMatch; Battle.ts → the aliveUnits assignment]`

**A smaller fix is available now, without waiting for that — but only half of it.** The **queue-entry**
check can safely key on the exact account string the provider gave us rather than the derived number;
the session layer already de-duplicates on that string, and re-keying it removes the false "you are
already in the queue" today. The **pairing** guard must not follow. The account string is the *finer*
key: two people who collide on the derived number have different account strings, so a pairing guard
keyed on the string would happily pair them — and hand both players an instantly broken battle. Fix the
entry check now; leave the pairing guard alone until numbers are server-assigned.

### R5 — we look for the session key in the wrong place

The client appends the session key straight after the route group, then adds any extra path parts
*after* it. For almost every route that leaves the key at the end, which is where we look.

**Exactly two routes put something after it**, and we handle them inconsistently:

- **`services/roster/unit/variation/{key}/{unit}/{variation}/{lobby}`** — we read the last segment as
  the session key, find no such session, and answer "forbidden". This is the second half of the
  #72 / #119 / #98 cluster: the route is missing *and* the key would not be found even if it existed.
  That trailing segment used to be written as an unexplained `{x}`; it is the **lobby id**. The 2013
  server's own route names it that, and the client's request builds it from the same value, so the two
  agree.
- **`services/session/steam/overlay/{key}/{true|false}`** — the same shape, but it works, because the
  routing layer matches that exact path *before* the session check runs and answers it directly.

The overlay route is therefore the working precedent for fixing the variation one. (A note on counting:
the key is the **fifth** segment of the full path as the client sends it, and the fourth once the
`/services` prefix has been stripped — which is the form our own check sees. Both numbers are correct in
their own frame, so say which frame you mean.)

**Fix these two in the right order, or the fix makes things worse.** Right now the misplaced key is
what saves us: because we look in the wrong segment, the variation request is refused with "forbidden"
before it can reach a route that does not exist — and "forbidden" is not retried, so it stops there.
Correct the key position *without* shipping the missing route in the same change and the request would
sail through the session check, match nothing, and collect the framework's "not found" — turning a
harmless refusal into exactly the endless loop described under R10. Ship the route and the key fix
together.

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

Two corrections worth recording, because earlier versions of this document got them wrong in opposite
directions. We do **not** *store* the checksum — the sync handler creates an empty turn slot, builds the
message and pushes it; only move and action data are ever kept. But we do **write both players'
checksum to the log, every turn**, tagged so they can be found. An earlier version of this section said
"a desync leaves no trace in our logs", and that is simply false: the trace is there.

`[source: Battle.ts → the sync handler and its [BATTLE-SYNC] log line]`

What is missing is narrower than either version claimed. **Nothing compares the two numbers, and
nothing flags them when they differ** — so the evidence exists but only a person reading the log after
the fact will ever notice. And we record that a battle ended without recording *why*, so even that
reader has to infer the connection. Closing this needs less storage than previously
described: one checksum per turn — whichever side reports first, held until the other arrives — is
enough to compare against, and it can be discarded as soon as the pair matches. No per-turn history is
needed. That is #165, re-scoped from a safety gap to a detection-and-flagging one.

### R21 — a refused poll is cheap, but not free

When two polls from the same session overlap we answer the second with `429`. That is the right
outcome, and the client does **not** retry `429`, so there is no storm.

But it is not free either. The client treats the refusal as a normal response and re-arms its poll
behind the usual gap — so a refused poll costs that player **one full gap** of extra latency (up to
3 s, or 1 s in battle) before they can receive anything.

It also feeds the machinery behind the "reconnecting…" banner, and a refusal **does** count as an
error there. That machinery is not a running tally, though — it is a **two-stage machine**, and the
shape of it is what makes an occasional refusal harmless:

- The first error puts the client on **probation**. Nothing is shown.
- The banner appears only when another error arrives **more than five seconds after** probation began.
  A burst of errors inside that five-second window keeps the client on probation without escalating.
- **A single success clears probation immediately.** So an isolated refusal, followed by any successful
  poll, never reaches the banner at all.
- Leaving the banner state is stricter than entering it: it needs a success arriving more than five
  seconds after the *last* error, so a client that is genuinely struggling does not flicker in and out.

So the guidance is: `429` is correct when two polls genuinely overlap, but **never answer `429` to a
poll we could have answered**. A session stuck refusing every poll is not just noisy — that player
stops receiving pushes entirely, and now the five-second rule works against them: sustained refusals
are exactly the pattern that raises the banner.

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

There is a nuance behind that, and it sharpens what the requirement actually is. A game does **not**
build every unit's identity the same way. For its **own** units it uses the number it logged in with —
it never consults what we sent. For the **opponent's** units it uses the `team` field out of the party
we sent. Both clients have to end up with identical strings for the same unit, so the real contract is
narrower than "send the same value to both players": **the `team` field we send for a player must equal
the number that player logged in with.** We do satisfy it, because we send that player's own number in
both places — but a future change that started deriving `team` from anything else would break battles
even while both clients received the exact same payload.

It is worth pinning because the names invite a future mistake: `team` reads like it might become a side
index (0 or 1). If anyone ever "tidies" it that way, every unit identity string changes and every
battle desyncs at turn 0, while `user` would still look correct.

### R7 — three sources agreed, and all three were wrong

This is the clearest illustration of why this document exists.

The client's documentation described `DEFAULT_POLL_TIME = 3000` as "the **client request timeout** (not
a sleep)", with the next request firing "immediately. **No back-off.**" It is a sleep. The value is
handed to `HttpAction.send` as its **pre-send delay** argument — by the poll re-arm in
`HttpCommunicator` — and `send` starts a timer and returns *without sending*, the same argument slot a
failed request's retry delay uses. So the client waits, *then* polls. (Corrected on the client side in
BSF-Client #18.)

Our own documents said the client polls "every ~2 seconds". An internal review in May 2026 "corrected"
that to an "instant 0-backoff reconnect", which is wrong outright, and this audit repeated the review's
error before checking what the argument does.

**The twist: "~2 seconds" was right.** The gap is not one number. Subsystems register their own, and the
shortest wins: 3 s by default, **1 s** in battle, **0.7 s at every turn boundary**, **2 s** on the
matchmaking, matched and friend-lobby screens, and **0.5 s** while a chat message is outstanding. Two
seconds is exactly the matchmaking-screen figure — the likeliest place anyone measured it. The original
text was not wrong in magnitude; it was a correct observation of one screen, generalised.

The 0.7-second one was missed by the original sweep and is worth calling out, because it is the busiest
of them all: the turn-boundary state registers it *every single turn*, not once per battle. (The
end-of-battle state registers 1 s on top, redundantly, since the battle gap is already 1 s.) This
matters twice over — it is the shortest gap the client ever uses outside chat, and it is the reason the
"what causes the refusals" note further down had to be rewritten.

**Where this list comes from.** These numbers were read out of the client's own registrations, not
observed on the wire. The 2026-07-28 measurement recorded below covers how long polls were *held* and
how many were refused; it never established the gaps themselves. The row is source-backed, not
measured, and its evidence note says so.

**What is actually true:** the client sleeps between polls, and the gap never *lengthens* after an error.
It can be *shortened* by a subsystem, and it can also be deferred — any response the client does not
consume restarts the wait, so steady outbound traffic pushes the next poll further out. A message pushed
while a poll is already open still goes out immediately.

### R20 — a pushed message without the right `battle_id` would be silently lost

The client's battle machine inspects every pushed message before accepting it, and there are two ways
to fall out:

- **No `battle_id` at all** → the message is **not consumed**. It stays in the client's queue and is
  re-examined on every later pass, forever.
- **A `battle_id` that doesn't match the battle in progress** → consumed and **silently discarded**
  (the client's own log calls this "silently eat wrong battle").

Neither produces an error anybody sees. So a battle-scoped push that omitted the id wouldn't fail
loudly — it would quietly accumulate, and the effect a player notices is simply that something never
happened.

**This row used to be UNPROVEN, and is now HOLDS.** The requirement was never in doubt; what was
missing was a check of our side. All thirteen places we push a battle message live in one file, and
each has now been read: every message the battle machine consumes carries the battle id, either because
it is built by the shared helper that stamps it, or because the id is set where the message is created.

**One correction on how to read that, because the obvious summary is wrong.** It is tempting to say
"eleven sites carry the id and two don't". That is not the shape of the file. **Three message objects
carry no battle id** — two renown messages and a chat message — and they are pushed from **two sites
that also push messages which do carry it**, both at the end of a battle. So the rule is not "a push
site either stamps the id or is not a battle message"; it is **per message**, not per site. A single
call can send one of each, and that is correct: the renown and chat messages are not battle messages,
so the battle machine declines them and they pass through to their own handlers.

Worth keeping in mind when adding a fourteenth push site — and worth checking message by message rather
than site by site. The failure mode is invisible, so nothing will tell you if you get it wrong.

### R14 — "zero server calls" was one word too strong

`[source: the isOnline gates in BattleFsm and the battle states; GameFsm → updateGameLocation; SceneStateBattleHandler → sceneFocusedBoardHandler]`

An offline practice battle sends us **no battle traffic at all**. Loading an AI battle never sets an
opponent name, which leaves the battle running in offline mode. The AI's own turn sends nothing
whatsoever.

But the battle is **not** silent from our point of view, and an earlier version of this row said it was:

- Entering the battle screen sends a **screen-location update**. It does carry an offline check — but a
  different one: it asks whether the *session* is offline, not whether the *battle* is. A logged-in
  player starting a practice battle passes that test, so we do get the request — and it is one of the
  fourteen classes that retry forever and can never be abandoned (R10).
- The **long poll keeps running** for the whole battle. Nothing on the offline path disconnects it.

**The client's own documents said the stronger thing too** — `offline-ai.md` in two places and
`game-flow.md` in one; Wave 1b corrected all three (BSF-Client PR #20), so the two sides now agree. On our side the claim to make is *zero battle calls*,
not *zero calls*.

### R23 — a lobby the client still believes in

Lobbies live only in memory, and a lobby's id is its owner's player number. A room can therefore
disappear while a player is still holding an invitation to it — the owner leaves, or the owner's
session is closed by logout or by the idle timer, and the room is deleted. A player who accepts that
invitation is asking to join something that is no longer there.

**It is not a server restart, and an earlier version of this row said it was.** A restart does erase
every lobby — but it erases every login session in the same instant, because those live in memory too
and nothing reloads them. Every request then fails the session check in `app.ts` and is answered
"forbidden" *before* it reaches any lobby code, and "forbidden" is not a reply the client re-sends. So
a restart cannot produce this loop; only losing the room while the player's session is still alive can.
`[source: auth.ts → the sessions object; app.ts → the session gate]`

**Only one of the eight lobby routes ever turned that into a loop: joining.** The distinction matters,
because an earlier version of this row implied all of them did. Against an id that no longer resolves,
`uninvite`, `exit`, `decline`, `options`, `ready` and `unready` all answer success and quietly do
nothing, and `invite` simply recreates the room. Those are harmless. **Join used to answer "not
found"** — both when the room was gone and when the caller was not on its invite list — and "not found"
is the one refusal the client retries, with no attempt cap. So one accepted-too-late invitation left
that client asking forever.

It now answers **`409`** when the room is gone and **`403`** when the caller was not invited. Neither
is re-sent, so the loop is closed.

**How reachable was this?** Less than this row used to imply. A lobby only exists once somebody invites
a friend, and the only way to invite is to pick a name from the friends list — which is always empty,
because we have never sent one. So no lobby can be created in ordinary play today, and the loop was
waiting on the friends list rather than happening to players. The fix closes it before it becomes
reachable.
`[source: data/first.json ships an empty friends list and nothing in src/ fills it; FriendLobbyPage → the invite call, its only caller — tracked as #91]`

What that does **not** fix: the player is left looking at a lobby screen for a room the server does not
have, because the client switches screens before it asks and never undoes that on a refusal. R10's rule
already warns that these codes stop the asking without correcting the screen. This row is recorded
separately from R10 because keeping lobby state in memory was a deliberate decision, and this was the
consequence nobody had connected to it.
`[source: game/cfg/Lobby.as → Lobby.join, which sets joined and switches the current lobby before sending]`

### R13 — what the two clients fight with, settled by measurement

`[measured 2026-08-21; source: VersusFindMatchState → handleMessage; EntityListDefVars → fromJson → EntityDefVars → fromJson; EntityDef → applyClassStats / clampStats]`

**The per-unit stats we put in a battle payload — the party list we send when a battle starts — are
the numbers both players fight with.** Not one player: both. Each game reads the party list we send,
picks out the party belonging to the logged-in player and the one belonging to the opponent, and builds
*both* from what we sent.

**The player's roster supplies none of the stats their units fight with.** It still matters, and in
more ways than one: we build the payload from it, and it also fixes who is in the party and the order
they act in. The client keeps reading its own roster *during* the battle as well — to tally kills, and
to decide which units show the ready-to-promote effect — so "the roster is not consulted" would be
wrong. What it does not do is supply a single number any unit fights with.

Three things the client changes on the way in, so "what we send is what they get" is not quite exact: a
value outside the class's allowed range is pulled back inside it; a stat we leave out is filled in from
the class table; and the first-ability slot together with the injury fields are recomputed from the
unit's rank whatever we send.

This applies to matched and friend-lobby battles, which share one path through the client. Offline
practice against the computer is different: it builds both sides from the client's own roster.

**The practical guidance is stronger than it used to be, not weaker.** Editing the stats in a battle
payload does not do nothing; it silently rewrites the battle for both players. Anything meant to change
how a unit performs belongs in the roster. For short test battles, shrink the party with
`/debug/party-limit`.

How it was settled is in "Measured evidence" below, including the way the first run nearly fooled us.

## The unproven ones

### R9 — a message pushed into an abandoned poll

When a poll is answered we clear the buffer of pending messages. The check for "have we already
answered?" uses a flag that is not the right signal for a request the client abandoned mid-flight. If a
message were to arrive inside that window, the send would quietly do nothing and the buffer would still
be emptied — losing the message.

The measurement below suggests the window is narrow, and a full battle completed without visible loss,
so this is **low priority but not disproven.** Settling it needs a targeted test that simulates an
abandoned request rather than more log reading.

### R22 — the account answer is validated, and failing it looks like nothing happened

The client validates loaded data against a schema, and that validation is genuinely switched on — it is
wired at start-up, so a field that doesn't match throws rather than being quietly accepted.

The consequence for us is unusual: when the client can't parse our `/account/info` answer, **it does not
show an error.** The failure is caught, written to the client's log, and nothing is put on screen. The
copy already in the client's memory simply stays, so the player sees a **stale roster and stale renown**
and everything looks like it is working. This has already cost debugging time before — the symptom
points at the server having lost data, when in fact the server sent data the client refused.

Two details are worth being exact about, because an earlier version of this section overstated them.
The retained copy is the one **already in memory** from earlier in the same run; a claim that the client
restores a saved copy from the *last session* is not something the code shows — nothing it writes to
disk holds roster data. And a reply that parses cleanly but happens to contain **no units** is discarded
just as quietly, by the same silent path.

**UNPROVEN** because our answer has never been checked field-by-field against the client's schema. Until
it is, treat "player reports stale roster" as possibly a schema mismatch rather than a data-loss bug.

## Measured evidence

### The five-second hold — 2026-07-28

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

**What causes the refusals.** There are **two** mechanisms, and they coexist. An earlier version of this
note ruled the first one out with the argument that "the battle machine changes the gap at most twice
per battle, which cannot produce six events" — that argument was wrong and has been removed. The
turn-boundary state changes the gap twice per **turn**, not twice per battle, so a battle of any length
supplies plenty of changes.

Both mechanisms end the same way, because the client only ever cancels a poll it has **not yet sent**.
One already in flight is left alone:

- **A gap change while a poll is open.** The client re-arms on the new gap; the open poll is untouched;
  two are now outstanding.
- **A response the client does not consume.** It re-arms its poll for that reason too, with the same
  result. This can fire on any battle, lobby, matchmaking or chat response.

Our `pollingActive` guard is what turns the duplicate into a `429`, which is the correct outcome — and
the client does not retry `429`, so there is no storm. The cost is one poll gap of added latency for
that message. None of the conclusions about refusals change; only the explanation of where they come
from.

**What this does not settle.** The counter above missed the case where a poll is answered instantly
because messages were already waiting, so the "answered early" figure is **not** a count of messages
delivered and must not be read as one. That gap, plus the 3 unexplained polls, is why R9 is still open.

### What the two clients fight with — 2026-08-20 and 2026-08-21

Two runs, both on a battle between the two local test accounts, settling R13. The method was the same
each time: change the copy of the party that goes out on the wire, in one place on the server, and
change nothing else. The stored roster keeps its real values, the server's own record of the battle
keeps them too (the change makes a copy rather than editing in place), and the database was checked
before and after.

**The first run, and why it was not enough.** One unit — a warhawk whose roster says strength 16 — was
sent as strength 11. Both screens showed 11, including its owner's. That looked conclusive, and it was
nearly wrong: the *opponent's* party contained an untouched unit whose real strength is 11 and whose
real armour is 8 — exactly the pair on screen. The unit had been identified by the name on its banner,
and names are not what the numbers prove. The reading was probably right, but "probably" is what put
two wrong answers in this document already.

**The second run closed it.** Two stats were changed at once, to values **no other unit in either party
holds** — strength 16 → 13 and armour 8 → 12, both inside the bands the class allows so nothing could
clamp them. The screenshot was taken automatically at the instant the server logged that this unit was
the one now acting, which ties the panel to the unit by its identifier rather than by its name.

| What was looked at | Reading |
| --- | --- |
| The unit on **its owner's** screen | strength **13**, armour **12** |
| The same unit on the **opponent's** screen | strength **13**, armour **12** |
| Its stored roster, before and after | strength 16, armour 8 — untouched |
| Per-turn checksums, across both runs | **457 turn boundaries, every one matching, none divergent** |

**What this settles.** Both recorded answers were wrong. The payload is not ignored — the roster's 16
never appeared on either screen. And the two sides are not reading different sources: had they been,
the checksums cover strength and armour for every living unit, each client compares the other's against
its own, and the first turn would have ended the battle.

**What it does not settle.** Matching checksums prove the two clients agreed with each other, never
which value they agreed on — that part rests on the screen readings, which is why the second run used
values nothing else could produce. The clamp is also the likely reason the June 2026 experiment read as
"no effect": it sent strength 1 and armour 0, below every class minimum, so every unit simply fought at
its class floor.

**For whoever measures next.** Pick a value no other unit in the battle can show, change two stats at
once, and tie the frame to the unit by its identifier rather than by reading a name off the screen.

## Keeping this current

Re-check this list when any of these happen:

1. **A route is added, removed, or changes shape** — add or update its rows here in the same change.
2. **A client document changes** — the client repository is the authority for every "where the client
   says so" cell; if one moves, follow it.
3. **An issue in the Status column closes** — flip the row to HOLDS and say what proves it. **One row
   at a time.** Several rows can share an issue — #164 covers R10 and R19, and covered R23 until the
   lobby fix landed — and closing it does not prove them all. R23 is the worked example: it became
   HOLDS on its own evidence while #164 stayed open. Each row needs evidence for *that* row before it
   flips, and its evidence note has to be updated to match.

**These sibling documents move in the same change as any correction here.** None is optional; each has
gone stale against this document before.

- [`../.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) carries a short operational mirror of
  R10. It loads automatically into every AI session working in this repository, so a wrong count there
  outlives a wrong count here.
- [`../CLAUDE.md`](../CLAUDE.md) carries the lobby bullets.
- [`error-handling.md`](./error-handling.md) is where a developer goes to pick a status code. It
  restated the lobby `404` in four places and nothing on *this* list pointed at it, so the lobby fix had
  to find it by accident rather than by following the list.
- [`dataStructures.md`](./dataStructures.md), [`database-schema.md`](./database-schema.md) and
  [`FAQ.md`](./FAQ.md) each compress a row's conclusion into a single line. All three went on asserting
  R13's old answer as settled fact for as long as the row itself sat at UNPROVEN, because nothing
  pointed at them either. A one-line restatement is exactly the kind that gets missed — and so are the
  plan documents under [`../misc/`](../misc/), which restated it five more times between them.

**And keep the evidence notes honest.** A note is a claim that someone opened the thing it names. If you
change a row and cannot re-check its evidence, downgrade the note to `copied` rather than leaving a
`source` note standing behind new text — that mislabelling is the exact failure this column exists to
catch.

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
UNPROVEN rather than **HOLDS or BROKEN**.

The "or BROKEN" is not a formality. Every mistake this document has made was a gloomy guess written
down as fact: a race that could not happen, a desync that left no trace, a refusal that was called
false when it was protecting us. Pessimism reads as diligence, so it gets waved through where optimism
would be challenged — and a wrong BROKEN costs real work, because somebody goes and fixes it.
