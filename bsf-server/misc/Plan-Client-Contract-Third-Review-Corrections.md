# Plan — corrections from the third review of the client contract

Follow-on to [`Plan-Client-Contract-Audit.md`](./Plan-Client-Contract-Audit.md), which produced
[`../docs/client-contract.md`](../docs/client-contract.md). That plan covered *writing* the list of
things the game client requires of this server. This one covers *correcting* it after a third review
found the explanations had drifted again.

**Status: Wave 1 applied on 2026-08-10 (branch `docs/client-contract-third-review`). Wave 1b, 2 and 3
still to do.**

Three things were settled at the start of that session and are recorded here so they do not get
re-litigated:

- **The citation rule applies in both repositories, not just to client code.** Checking it before
  applying it found that the contract document cited the retry test at line 346, while the function
  actually sits at line 359 in two copies of the client and 352 in the third — the cited line was
  correct in none of them. Names only, everywhere.
- **This plan's four extra findings are the ones that shipped**, in preference to the older kickoff
  prompt where the two differed: five never-cancelled battle routes rather than four, the maintenance
  exemption living in the retry test itself, the corrected client pin, and the extra detail on the
  account answer and the reconnecting banner.
- **The versions now pinned in the document are** server `76aed4f`, client `2eda546`.

One row is worth knowing about before the next round: **R14 is the only row whose evidence note is not
source-backed.** Every other note names something that was opened and read. R14 ("an offline practice
battle makes zero server calls") rests on the client's own document plus the absence of anything on our
side expecting battle traffic, so it carries the `copied` label. If a future pass wants a clean sweep,
that is the one row left to prove.

---

## Why this exists

The contract document has been corrected twice already (pull requests #171 and #172). Each round fixed
the summary table but left mistakes in the paragraphs underneath, always the same way: somebody wrote
down a believable explanation of *why* something happens without following it into the code.

A five-part re-check on 2026-08-01 found the pattern had repeated. **Every status, issue link and count
in the table is exact.** But the prose carries four serious errors — including one explanation that has
now been wrong twice about the same issue (#144) — plus eighteen smaller ones.

The point of this wave is not only to fix the eighteen. It is to add the one structural change that
makes a fourth round visible: a short evidence note on every row saying what kind of proof it rests on.

Nothing in Wave 1 changes how the server behaves. The two behaviour changes the review implied are
Waves 2 and 3, and Wave 1 deliberately leaves markers for both so neither blocks.

---

## Everything was re-checked before this plan was written

The whole failure mode of the last two rounds was trusting a report instead of the code, so every
correction below was traced into current source on 2026-08-05. All twenty-two hold. What that pass
confirmed, and the four places it went further than the review:

| Claim | What the code shows |
|---|---|
| Issue #144's overlap race | **Unreachable today.** Our database helpers are "asynchronous" in shape only — the work inside them runs straight through with no pause, so one request's read-decide-write finishes before the next request is even picked up. |
| Thirteen places push battle messages | Exactly thirteen. Every message the battle machine consumes carries its battle id; the two that don't aren't battle messages and reach their own handlers. **The row can move to HOLDS.** |
| Roster route failure codes | Seven "not found", eight "server error". The document is right — **issue #164's "nine" is wrong.** |
| The poll gap | Six subsystems register one, and **a 0.7-second gap at every turn boundary is missing from the list.** |
| Duplicate polls | A new poll cancels the previous one **only if it hasn't been sent yet**. One already in flight is left alone, so every gap change while a poll is open creates a second one. |
| Which requests can be cancelled | Ready, deploy and sync are cancelled when a battle stage ends; the turn query is cancelled directly. **Move, action, kill, exit and surrender are never cancelled by anything.** |
| Menu requests that retry forever | **Fourteen**, not eleven. Only the match-start request can be cancelled; the party-arrange one is cancelled solely by the next party change on the same screen. |
| Lobby routes | Only **join** answers "not found" on a stale id. The other six quietly succeed, and invite recreates the room. |
| The "reconnecting" banner | Not a running count of errors — a two-stage machine, and a refused poll does feed it. |
| A rejected account answer | Caught, logged, **nothing replaces it** — the previous in-memory copy simply stays. Nothing on disk holds roster data. |
| The unexplained path segment | It is the **lobby id** — the 2013 server's route and the client's own request agree. |
| The turn-query cost | **2.5×**, not "triples" (a 5-second re-ask on success against a 2-second retry on failure). |
| The two matchmaking guards | Genuinely separate, and pairing two players who share a number would collapse both sides into one identity. **The review's reversal is correct.** |

**Four things came out different from the review's write-up, and are folded in below:**

1. The loop that starts after a battle is cleaned up affects **five** routes, not two.
2. The maintenance exemption lives in the client's retry test **itself**, not only in the separate
   abort path — a stronger and simpler statement.
3. **The document's client line numbers come from a copy of the client it never names.** The same
   function sits at a different line in the client repository the document says it used. Rather than
   renumber, we stop citing lines at all (see C3).
4. **Four client documents have changed** since the sweep, and the new text repeats two of the errors
   we are fixing here. That is a different repository, so it becomes Wave 1b.

---

## Decisions already taken

- **An evidence note goes on all twenty-three rows**, and a note reading "worked out by reasoning"
  may not support a HOLDS or a BROKEN.
- **Name the file and the function, never the line number.** The document already refuses to cite
  client documents by section number because the numbers move; the same is true of code, and more so
  here, because three copies of the client exist with three different numberings.
- **Issue #144 gets a new title and a rewritten body**, because its current title advertises something
  that cannot happen.
- The four extra findings above are carried, and one wrong note in the assistant's own memory is fixed.

---

## Wave 1 — the corrections (one documentation pull request)

Branch `docs/client-contract-third-review` off `main`. Local `main` was **two commits behind**
`origin/main` on 2026-08-05 — offer to fast-forward it first, never automatically.

### A. The four serious ones

**A1 — the "smaller fix" in the shared-player-number section is backwards.**
Only the **queue-entry check** (the one that says "you are already in the queue") should be re-keyed on
the exact account string from Discord or Steam. The **pairing guard** must keep using the derived
number until we assign numbers ourselves: two players sharing a number would be built into a battle
with the same identity, their surviving-unit lists would merge into one, and the battle would fail
immediately. Delete the claim that the pairing refusal is false — it is protective. The neighbouring
warning also has its direction word backwards: the provider string is the *finer* key, not a coarser
one.

*Technical:* the entry check is the duplicate-account guard in `src/services/queue.ts`'s `/vs/start`
handler; the pairing guard is the same-account skip inside `findBestMatch`. The collapse happens at
`Battle.ts`'s `aliveUnits` assignment, which is keyed by account id.

**A2 — the #144 explanation is wrong for the second time.**
Say plainly that the two-requests-overlapping hazard **cannot happen today**, and why: our database
helpers look asynchronous but do all their work in one go, so a request finishes before the next one
starts. Record it as a risk that returns only if the data layer ever becomes genuinely asynchronous.
Both conclusions survive: refunding nothing on retire removes the double payment, and the retry loop
is all that is left of #144. Add a line saying this paragraph has now been wrong twice, so the next
person checks the helpers before rewriting it a third time.

*Technical:* `query` / `queryOne` / `queryUpdate` in `src/db/connection.ts` wrap a synchronous
`node:sqlite` call.

**A3 — the sentence about which requests can be cancelled is wrong in both halves.**
Battle side: ready, deploy and sync are cancelled when a battle stage is torn down, and the turn query
is cancelled on its own. **Move, action, kill, exit and surrender are built outside any stage and are
never cancelled by anything.** Menu side: **fourteen** menu requests are never cancelled, not eleven —
add the colour-variation, in-app-purchase and Steam-overlay ones. The match-start request is the one
that *can* be cancelled; the party-arrange request is cancelled only by the next party change on the
same screen, so it also outlives leaving that screen. Keep the note that the game abandons any request
when it is told to log in again or that the server is down for maintenance.

**A4 — add the loop that starts after a battle is cleaned up, and qualify the lobby claim.**
Once a battle is removed — thirty seconds after it ends, or as soon as both players leave — any of
those five never-cancelled battle requests still retrying gets "not found" from the battle gate and
keeps asking for as long as the game is open. Kill, exit and surrender are the realistic window.

Separately, "our lobby routes already do this" is true only of the examples it names. **Joining a
lobby deliberately answers "not found"** both when the room is gone and when the caller was not
invited — and that is precisely the one refusal the client retries. All three lobby requests retry,
none reports back, none can be cancelled. Record it as a live instance marked **fix planned (Wave 2)**,
and note that it currently contradicts the lobby bullet in [`../CLAUDE.md`](../CLAUDE.md), which Wave 2
resolves.

### B. The fourteen smaller ones

| # | Where | Change |
|---|---|---|
| B1 | R7 | Add the **0.7-second** turn-boundary gap. Relabel the evidence: the gap list was read out of the source, not measured — the measurement covered how long polls were held and how many were refused. |
| B2 | Measured evidence | Delete the argument that the battle machine "changes the gap at most twice per battle, which cannot produce six events". It changes twice per **turn**, and each change while a poll is open creates a duplicate. Both causes are real; the conclusions about refused polls are unchanged. |
| B3 | R19 | The roster routes are unsafe to repeat **one after another**, not by overlapping: a repeated promotion promotes again and charges again, a repeated stat purchase applies the change twice, a repeated row unlock deducts again, a repeated hire duplicates the unit, and a repeated retire loops on "not found". |
| B4 | R15 | "a desync leaves no trace in our logs" is **false** — we write both players' checksums every turn. The real gap is that nothing compares or flags them, and we never record why a battle ended. Soften the storage-cost sentence: remembering one checksum per turn is enough. |
| B5 | R13 | **HOLDS → UNPROVEN**, with the disagreement recorded: reading the code suggests each player's copy of the *opponent's* party is built from what we send, while their own units come from their roster — which conflicts with the June measurement. Retest is Wave 3. The practical advice is unchanged: never edit the stats we send with a battle. |
| B6 | R20 | **UNPROVEN → HOLDS.** All thirteen push sites checked. |
| B7 | R23 | Narrow to joining only, and point at Wave 2. |
| B8 | R5 | Name the unexplained path segment: it is the **lobby id**. Add the ordering warning — moving where we look for the session key *without* shipping the missing route in the same change turns a harmless refusal into an endless "not found" loop. |
| B9 | R1 | A zero player number fails login because of an **explicit check for it**, repeated in three login stages — not because the credentials are considered invalid. |
| B10 | R2 | Add the nuance: each game builds its **own** units' identity from the number it logged in with, and the **opponent's** from the field we send, so the real requirement is that the field must equal that player's login number. We send the same value in both. |
| B11 | R10 | Note the maintenance exemption: a "server busy" reply whose text says the server is down for maintenance is excluded by the retry test **itself**, and the game separately abandons the request and shows a dialog. |
| B12 | R10 | "triples the query rate" → **2.5×**. |
| B13 | R22 | Replace "falls back to its own cached copy from the last successful session" with what actually happens: the failure is caught, written to the log, nothing is shown, and the copy already in memory stays. Nothing saved on disk holds roster data. **Also**: an answer that parses but contains no units is discarded just as quietly. |
| B14 | R21 | "internal error tally" → a **two-stage machine**. A refused poll does count; the banner needs a second error more than five seconds after the first; one success clears the first stage at once, but leaving the error stage needs five quiet seconds. That is what makes "an occasional refusal is harmless" true. |

### C. Changes to how the document works

**C1 — add a calibration rule to the status key.** A status describes what happens **today**. A
qualifier such as "broken, latent" means a risk that is not live yet, and always names its issue.
Relabel R1 and R4 to match.

**C2 — widen the closing rule.** "mark the row UNPROVEN rather than HOLDS" becomes "**rather than
HOLDS or BROKEN**". Every mistake this document has made was a gloomy guess recorded as BROKEN.

**C3 — extend "Keeping this current".** Add two sibling documents that must move in the same change
as any correction here — the short operational note in `.claude/rules/gotchas.md`, and the lobby
bullets in [`../CLAUDE.md`](../CLAUDE.md). Tighten the third rule: a row that shares its issue with
other rows (#164 covers three of them) needs proof for **that row** before it flips. And add the new
citation rule: **name the file and the function, never the line.** Three copies of the client exist
with three different numberings, and this document has been silently mixing them.

**C4 — an evidence note on all twenty-three rows.** The status, then the note on a second line:

```
| R10 | … | … | … | **BROKEN** — #164<br>`[source: HttpAction.canRetry]` |
| R8  | … | … | … | **HOLDS**<br>`[measured 2026-07-28]` |
| R12 | … | … | … | **HOLDS**<br>`[test: rewards indexed by party position]` |
| R13 | … | … | … | **UNPROVEN**<br>`[disputed: source reading vs measurement 2026-06-12]` |
```

Five kinds of note: read from the source, measured on a date, proved by a named test, copied from a
review and re-checked on a date, or worked out by reasoning. **The last one may not support a HOLDS or
a BROKEN** — state that in a line under the existing status key. Every note comes from the
verification table at the top of this plan, so no row is labelled from memory; anything that could not
be re-derived is marked as copied-and-re-checked rather than source-backed.

**C5 — pin both sides.** Record which version of this server the list describes alongside the client
version, and correct the client pin: the sweep read the client documents at `4d48d2d`, four of them
have since changed, and this pass re-checked against `2eda546`.

**C6 — recompute the tally on purpose.** The two status flips cancel out, so the line stays *fourteen
hold, six are broken, three cannot yet be decided* — but say so deliberately rather than leaving it
untouched by luck.

### D. Sync the short operational note

Bring the retry entry in `.claude/rules/gotchas.md` into line with A2, A3, A4, B11 and B12 — the
corrected counts and route list, the maintenance exemption, 2.5×, the after-cleanup battle loop, the
lobby join, and #144 reframed as a risk rather than a live bug. It stays the short version; the
reasoning lives in the contract document. Its two line-number citations become function names under C3.

### E. Refresh three issues (each shown before it is applied)

- **#144** — new title (it currently advertises something that cannot happen) and a rewritten body: the
  overlap cannot occur while our data layer runs straight through, it returns only if that changes,
  removing the refund settles the money either way, and the live remainder is the retry loop tracked by
  #164. Keep the original wording as a dated correction so the history stays readable.
- **#164** — eight "server error" replies, not nine; add the rename opt-out and the in-app-purchase
  request; state twenty-three classes but twenty-five actual request kinds; add the after-cleanup
  battle loop and the lobby join; name the unexplained segment and say which way the segments are being
  counted; drop the line-number citation.
- **#165** — the checksums **are** written to the log, both players', every turn. The gap is that
  nothing compares them and nothing records why a battle ended; a fix needs to remember one checksum
  per turn. Also drop the closing request to correct the client's wording — **that already happened**
  in BSF-Client pull request #19, and the passage the issue quotes no longer exists.

### F. Fix one wrong note in the assistant's memory

The note claiming the game falls back to a saved file when it rejects our account answer is wrong —
the only thing the game saves locally is its preferences, and nothing there holds a roster. The useful
half stays: an unrecognised unit class really does make units disappear, through a pruning step that
runs before the answer is accepted.

### How Wave 1 is checked

Documentation only, so the gate is review rather than behaviour:

1. **Every evidence note resolves** — each named file and function exists. This is the check that
   catches a note copied out of the old prose.
2. **The numbers agree in all three places they appear** (this document, the short operational note,
   and issue #164): seven and eight roster failure codes, twenty-three classes and twenty-five request
   kinds, fourteen never-cancelled menu requests, thirteen push sites, 2.5×.
3. **The tally matches the table** after the two flips — fourteen, six, three.
4. **No "worked out by reasoning" note sits on a HOLDS or a BROKEN** — the rule C4 introduces, applied
   to itself.
5. **`yarn build` run locally** and the tail pasted back. `SKIP_SIMPLE_GIT_HOOKS=1` is then acceptable
   for documentation-only commits, given the known Windows test-runner flake.
6. **One pull request against `main`**, plain-language title and body, noting that it applies the
   2026-08-01 corrections and naming the two status flips.

---

## Wave 1b — the same errors on the client side (new)

Four client documents changed between the swept commit and the current one, and the new text repeats
mistakes this wave is fixing:

- the retry list omits the in-app-purchase request, exactly like issue #164's stale copy;
- the "reconnecting" banner is described as a count of consecutive errors;
- the colour-variation route's trailing segment is still unnamed, and the segment count does not say
  which way it is counted;
- two documents cite a line number that belongs to a copy of the client that is not that repository.

Fixing these means a pull request against `BSF-Client` and then a submodule bump here — a different
repository and a different pull request, so it does not belong in Wave 1. Affected:
`bsf-client/docs/mod-bridge.md` ([local](../../bsf-client/docs/mod-bridge.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/mod-bridge.md))
and `bsf-client/docs/wire-protocol.md` ([local](../../bsf-client/docs/wire-protocol.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/wire-protocol.md)).

A kickoff prompt for this wave goes in `%USERPROFILE%\.claude\plans\` alongside the existing ones.

---

## Waves 2 and 3 — unchanged

**Wave 2 — stop the lobby join from answering the one refusal the game retries forever.** Change the
two replies in `src/services/lobby.ts`, flip the two tests that currently assert them (in
`test/routes/lobby.test.ts`, the "lobby does not exist" and "caller was not invited" cases), and update
the lobby bullet in [`../CLAUDE.md`](../CLAUDE.md), the two rows in the contract document that Wave 1
marks "fix planned", and the short operational note — all in the same change.

**Wave 3 — settle whether the stats we send affect the opponent's battle.** Needs the user at the
keyboard with two game windows. Wave 1 parks the row as undecided so nothing waits on it.

Both already have ready-to-paste kickoff prompts in
`%USERPROFILE%\.claude\plans\client-contract-audit-corrections-waves.md`.
