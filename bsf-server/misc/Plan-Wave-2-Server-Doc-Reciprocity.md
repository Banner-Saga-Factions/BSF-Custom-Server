# Plan — Wave 2: make the server↔client doc boundary work in both directions

Parent plan: [`Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md`](./Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md) → "Wave 2".
Wave 1 (roadmap sharpening) is on branch `docs/reconcile-roadmap-wave1`, PR #162, **open**.

**Status: ready to implement.** Docs-only, one pull request, thirteen files.

---

## Why we're doing this

The game client now has its own documentation. Over three merged pull requests (BSF-Client #15, #16,
#17) it gained eight lasting documents that, for the first time, describe the *client* side of the
line where the two halves of this project meet: `client-overview`, `game-flow`, `patch-inventory`,
`asset-loading`, `ui-system`, `data-model`, `offline-ai`, `mod-bridge`.

**The problem: the links only run one way.** The client's documents point into the server's roughly
thirty times. The server's documents point back at **none** of the eight new ones. (The only
server→client links that exist — to `battle-engine.md` and `wire-protocol.md` — were written before
the client track landed.) So someone reading `bsf-server/docs/` has no way to find out that the client
side is now documented at all, and the same facts risk being written down twice, in two places, that
then drift apart.

**What "done" looks like:** every server document whose subject has a client-side counterpart names
that counterpart, written so the link works both when clicked in a local editor and when read on
github.com.

## Four accuracy problems we're fixing along the way

Found while reading the target files. Each one sits on a line this wave already edits, so folding them
in costs almost nothing and leaves no loose ends.

1. **`docs/serverEndpoints.md` describes stat purchases the way the server used to work, not the way
   it works now.** It says a stat change "must be an integer in `[0, 20]`" and that negative values are
   rejected. The server has accepted **−20 to 20** since issue #118 (`src/services/roster.ts:255-269`).
   Negative values are not an error: the client's stat panel *subtracts* a point on right-click, so
   moving points out of a stat legitimately sends a negative number. Rejecting them was the #118 bug —
   it threw away the player's whole batch of changes, and units quietly reverted to their default stats
   in the next battle. This is the same paragraph the wave was already going to annotate.
2. **Three links in `docs/doc-gaps.md` are broken for anyone reading on github.com** (lines 11, 31,
   35). They are written as plain relative paths into the client repo, which only resolve when both
   repos sit side by side on one disk.
3. **`docs/serverEndpoints.md` cites four file paths under `c:\decompile\bsf\…`** (lines 128, 469,
   522, 532) — a folder that no longer exists (reference code moved to `%USERPROFILE%\Code\bsf-refs\`),
   and which breaks the project rule against hardcoding one person's user folder into documentation.
4. **A rule that has bitten us before is written down nowhere on the server side.** In battle, a unit
   fights with **its own roster numbers**. The class definition sets the allowed minimum and maximum
   once, when the roster loads, and is never consulted again during combat. So editing the per-unit
   stats inside a battle party the *server* sends changes nothing at all — which is why the "weak
   units" experiment was a silent no-op and was removed. The client documents this clearly
   (`data-model.md` §5); the server documents don't mention it.

---

## Branch and delivery

- **Branch:** `docs/reconcile-server-links-wave2`, cut from the tip of `docs/reconcile-roadmap-wave1`
  (`f1732b0`) — stacked, per the usual workflow. Wave 2 touches entirely different files from Wave 1,
  so once PR #162 merges this pull request's changes stay clean.
- **Documentation only.** No `src/`, no database schema, no tests.
- Follow the explain-then-`y` approval cycle in [`../CLAUDE.md`](../CLAUDE.md) → *Working Style*:
  present every change with What / Why / Tradeoff in one message containing no file edits, then wait
  for approval.

## How to write the links (matches Wave 1 — don't deviate)

Link to the **whole document** and name the section in **prose**, never as a `#anchor`:

```markdown
`offline-ai.md` §3 ([local](../../bsf-client/docs/offline-ai.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/offline-ai.md))
```

Why not anchors: several target headings don't survive being turned into a URL fragment — one starts
with an emoji (`## 8. ⚠ Known security gap`), and others use long dashes that github.com rewrites
unpredictably. Wave 1 already used the document-level-plus-prose form throughout
[`Plan-Master-Roadmap.md`](./Plan-Master-Roadmap.md); stay consistent with it.

The branch name in a client URL is `master` (BSF-Client's default); for this repo it's `main`. Links
between two server documents stay plain and relative (`./X.md`).

---

## The changes

### A. The reciprocal links (the core of the wave)

| File | Change |
|---|---|
| `docs/battle-simulation.md` | Add `offline-ai.md` §3 to the pointer list at `:8`, plus one closing sentence in *Why the server doesn't simulate*: the plainest evidence the server never simulates is that the client can play an entire battle with **no server at all** — identical turn machine, same seeded dice, and the only step it skips is the per-turn checksum exchange (there's no second client to compare against). The AI turn-state that drives it is dormant original Stoic code, not something our fork added. |
| `docs/dataStructures.md` | A short note under the intro (`:4`) pointing at `data-model.md` — how the client turns these wire shapes into its in-memory account. `data-model.md:118` links here today and gets nothing back. |
| `docs/database-schema.md` | In the `accounts` section, note that `roster_json` and `party_ids_json` arrive client-side as `legend.roster` and `legend.party` (`data-model.md` §5) — and that those two columns, not any battle-time stat block, decide how strong a unit actually is. |
| `docs/serverEndpoints.md` | Extend the cross-reference block at `:13` with the two client counterparts: `wire-protocol.md` (the same routes, with request bodies read from the client side) and `game-flow.md` → *The actions* (which client class fires each route). This file already names `PurchaseStatsTxn`, `ResetStatsTxn` and `BattleTxnSurrenderSend` inline but never links the index they live in. |
| `docs/gameFlow.md` | A header line pointing at `game-flow.md`, saying plainly that the two complement rather than duplicate each other: this file is the message lifecycle, that one is the client state machine that produces it. Two documents with nearly the same name and no link between them is a trap. |
| `docs/protocol-cross-reference.md` | Two changes: **(a)** the header block at `:5` gains `wire-protocol.md` and `game-flow.md` — `wire-protocol.md` openly calls itself "the opposite-direction mirror of `protocol-cross-reference.md`" and links here, with nothing coming back; **(b)** the unit-variation row at `:40` gains its client caller, `UnitVariationTxn`, which calls `services/roster/unit/variation/{id}/{x}/{y}`. That's the exact route shape the missing endpoint behind issues #98 / #72 / #119 has to answer. |
| `docs/security.md` | New entry under *What is NOT protected today* — the mod-bridge credential leak. Wording brief below. |
| `docs/FAQ.md` | The matchmaking entry (`:36`) gains a `data-model.md` §5 link explaining the client-side reason a short or unresolved party understates a player's power. Plus one title-only line in the *Deep traps* index (paired with change D). |
| `docs/observability.md` | The same `data-model.md` §5 link in the stuck-queue runbook (`:68`). Keep the explanation where it already lives (in the FAQ) and link to it rather than repeating it. |
| `docs/doc-gaps.md` | Rewrite the companion note at `:11`: the client suite is now **complete** — name the eight documents and point at `client-overview.md` as the way in. Convert all three plain client links (`:11`, `:31`, `:35`) to the dual-link form so they stop 404-ing on github.com. |

**Wording brief — the `security.md` entry.** Match the register of the entries beside it (colluding
clients, in-memory rate limit): state the fact, bound it honestly, link rather than restate.

- **What:** our fork's client mod bridge copies HTTP traffic **word for word** to an external program
  at `mods/host.exe` — including the login request and the session key in the reply.
- **Why this server cares:** a stolen session key is indistinguishable from the real player for the
  rest of that session, and there is nothing on the server able to detect or cancel it.
- **The bound — say it, it keeps the entry honest:** the bridge does nothing unless the player
  installs a host program. None ships with the game, and with no host every bridge call is ignored.
- Cite `mod-bridge.md` §8 for the finding and its fix. Do **not** copy that plan's remediation steps
  into this repo.

### B. Correct the stat-purchase description (`docs/serverEndpoints.md` `:112`, `:118`, `:120`)

Bring the text in line with what the code actually does (`src/services/roster.ts:255-269`):

- The bound is **−20 to 20**, not `[0, 20]`.
- **Negative values are legitimate, not an error** — right-clicking a stat subtracts a point, so
  moving points out of a stat sends a negative number. Rejecting them is what caused issue #118.
- Zero stays a tolerated do-nothing value; the "resulting value can't go below zero" floor stays.
- Remove `delta < 0` from the list of things that return a `400` error.
- Fold in the cross-link this wave calls for: the real per-stat minimum and maximum live **client-side**
  on the class definition (`data-model.md` §3) and haven't been ported to the server, which is the same
  gap Wave 1 recorded on the #62 roadmap row.

Ground truth for the rewrite is [`../.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) →
"Stat-purchase deltas can be > 1 *and* negative", which is already correct. Don't invent new bounds —
mirror the rule and the code.

### C. Fix the dead file paths (`docs/serverEndpoints.md` `:128`, `:469`, `:522`, `:532`)

Replace `c:\decompile\bsf\scripts\scripts\<path>` with the class path in the style already used at
`:104` — for example `game/session/actions/ResetStatsTxn.as`. Where a full location genuinely helps,
write it as `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\`.

### D. Write down the roster-numbers rule

The FAQ's own maintenance rule decides where this goes: deep code and protocol traps live in full in
the rules file, with a one-line title indexed in the FAQ.

- **`.claude/rules/gotchas.md`** — new trap, in the file's existing voice: in battle a unit fights with
  its **roster** numbers. The class definition sets the allowed minimum and maximum and clamps the
  values once when the roster loads; it is never consulted again during combat. Editing the per-unit
  stats inside a battle party the server sends therefore changes nothing — which is why the "weak
  units" experiment was a silent no-op and was removed. To force short battles, use
  `/debug/party-limit` instead. Cite `data-model.md` §5.
- **`docs/FAQ.md`** — one line under *Deep protocol & correctness traps*. Title only, no copied prose.

This is the only file outside `docs/` the wave touches. It's prose, no rule logic changes — and it's
where the rule actually gets read, because that file loads automatically for anyone editing `src/`,
which is exactly the person who would try to tune battle-party stats.

### E. Close out the parent plan

In [`Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md`](./Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md),
mark the Wave 2 section **DONE** with the date, the same way the Spike section is marked. Record that
changes B, C and D were absorbed beyond the wave's original scope, add a pointer to this file, and note
that the plan then has no open waves left.

**Not doing:** no `CHANGELOG.md` entry. Wave 1 set the precedent that a documentation-only
reconciliation wave doesn't get one. Worth raising at pull-request time if that judgement changes.

---

## Files this touches (16)

```
bsf-server/docs/ARCHITECTURE.md               bsf-server/docs/security.md
bsf-server/docs/battle-simulation.md          bsf-server/docs/FAQ.md
bsf-server/docs/dataStructures.md             bsf-server/docs/observability.md
bsf-server/docs/database-schema.md            bsf-server/docs/doc-gaps.md
bsf-server/docs/serverEndpoints.md            bsf-server/README.md
bsf-server/docs/gameFlow.md                   bsf-server/.claude/rules/gotchas.md
bsf-server/docs/protocol-cross-reference.md   bsf-server/misc/Plan-Master-Roadmap.md
bsf-server/misc/Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md
bsf-server/misc/Plan-Wave-2-Server-Doc-Reciprocity.md  (this file)
```

Also bump the `*Last updated:*` footer on each edited document that has one.

`ARCHITECTURE.md` and `README.md` were added after review (see below). `Plan-Master-Roadmap.md` is a
Wave 1 file, touched only to repair two citations this wave invalidated.

## Review findings applied (2026-07-27)

Two reviewers checked the wave before push. Every claim below was re-verified against source before
being acted on.

**One factual error, caught and corrected.** The unit-variation row in `protocol-cross-reference.md`
originally gave the route as `…/variation/{id}/{x}/{y}` and said "the session key is no longer the
fourth". Both wrong. `UnitVariationTxn.as:22` builds the path as
`"services/roster/unit/variation" + urlCred + "/" + id + "/" + variation + "/" + lobby_id`, where
`urlCred` *is* `/{sessionKey}` — so the real shape is
`…/variation/{session_key}/{unit_id}/{variation}/{lobby_id}`, matching the Java original's
`@Path("/{sessionKey}/{unit_id}/{variation}/{lobby_id}")`. The session key sits where it always sits;
the unusual part is that three segments follow it. The first draft had also invented a hazard in place
of the real one: our session gate reads the key from the **last** path segment (`app.ts:90`), which
here is `lobby_id`, so the route is refused with `403` before any handler runs. That is what the port
must handle, and it is now what the row says.

**Root cause worth remembering:** the shape was lifted from the client's route table, where a header
line ("all under `…{urlCred}`") supplies the session key for every row. Lifted out of that table, the
truncated path reads as complete. Check `urlCred` before copying any route out of `wire-protocol.md`.

**Other corrections applied:**

- `FAQ.md` attributed the power total to the game client. It is computed entirely server-side —
  `calculateLevel` sums `RANK − 1` over `buildOrderedPartyDefs` (`src/services/queue.ts:183-197`). In
  the one entry meant to stop people debugging in the wrong repo, that pointed at the wrong repo.
- `battle-simulation.md` restated four claims from the client doc when the argument needs one. Trimmed
  to the load-bearing claim; the rest is linked.
- **`ARCHITECTURE.md` was the hole this wave left.** Three client docs point at it; it pointed back at
  none, and the `README.md` "where do I go" table named no client doc — so the wave's own goal failed
  at the two most likely entry points. Both now carry a pointer.
- **Bare `§N` citations rot exactly like line numbers.** The plan rejected `#anchor` links as fragile
  and then used section numbers, which drift just as silently when a section is inserted. All
  citations now carry the heading title as well (`§5 "Your account and roster"`), here and in Wave 1's
  roadmap links.
- `wire-protocol.md`, not `game-flow.md`, is the route-by-route index of which client class calls what;
  the two attributions were swapped.
- Smaller: the roster-numbers clause moved onto the `defs` field it concerns; `database-schema.md`
  links the canonical rule and its footer was bumped; `security.md`'s section header now admits its one
  cross-repo entry, cites §4 for the "inert without a host" bound, and says to revise the entry when
  the client fix lands.

## How to check the work

1. **Every `[local]` link points at a file that exists.** From `bsf-server/`:
   ```powershell
   Select-String -Path docs\*.md,.claude\rules\gotchas.md -Pattern '\]\((\.\./)+bsf-client/[^)]+\)' -AllMatches |
     ForEach-Object { $_.Matches.Value } | ForEach-Object { $_ -replace '^\]\(|\)$','' } |
     ForEach-Object { if (-not (Test-Path (Join-Path 'docs' $_))) { "MISSING: $_" } }
   ```
   Quicker by hand: Ctrl+click each new `[local]` link in VS Code — every one should open.
2. **No plain client link survives.**
   `grep -rn "\.\./\.\./bsf-client" docs/ .claude/rules/ | grep -v GitHub` must return **nothing**.
   Today it returns the three `doc-gaps.md` lines.
3. **Every `[GitHub]` address is well formed** — `BSF-Client/blob/master/docs/<file>.md`, and `<file>`
   exists in `bsf-client/docs/`. All eight targets were confirmed present on disk while planning.
4. **The stat-purchase correction matches the code.** Read `src/services/roster.ts:255-269` beside the
   rewritten paragraph: the text must say −20 to 20, negatives legitimate, zero a do-nothing value.
5. **Nothing is now written down twice.** Each new link should replace or shorten a repeated
   explanation, not add a second copy. Compare `observability.md` and `FAQ.md` against each other.
6. **Build and tests.** Nothing under `src/` changes, so `yarn build && yarn test` passes trivially —
   run it once locally before committing (the pre-commit hook runs it anyway). `SKIP_SIMPLE_GIT_HOOKS=1`
   is available for the documentation-only commit if the known Windows test-runner flake bites.
7. **Reviewer:** run `pre-push-reviewer` only if explicitly asked — never automatically.

## Follow-ups to file, not fix here

- `bsf-client/docs/data-model.md:125` ends with "see the matchmaking gotchas in `bsf-server`" — a
  mention with no link. Fixing it is a **BSF-Client** change, so it belongs in a client-side pull
  request, not this one.
- `docs/serverEndpoints.md` and `docs/gameFlow.md` still carry `*Last updated: 2026-05-07*` footers
  over content that has moved on since. Out of scope for a cross-link wave; worth an issue.

---

## Kickoff prompt (paste into a fresh chat)

```
Implement Wave 2 of the server/client documentation reconciliation.
Repo: bsf-server. Documentation only, one PR, 13 files.

The full plan is bsf-server/misc/Plan-Wave-2-Server-Doc-Reciprocity.md — read it first; it has
the exact per-file changes, line numbers, the link convention, and the verification steps.

Branch docs/reconcile-server-links-wave2 already exists (stacked on docs/reconcile-roadmap-wave1,
Wave 1 / PR #162 still open) and already contains this plan file as its first commit. Stay on it —
no new branch, no pull needed.

Scope note: besides the reciprocal cross-links, the wave deliberately absorbs four accuracy fixes
(sections B, C, D of the plan) — the stat-purchase paragraph that contradicts roster.ts:255-269,
three client links in doc-gaps.md that 404 on github.com, four dead c:\decompile paths in
serverEndpoints.md, and the missing "a unit fights with its roster numbers" rule. All four were
approved; don't re-litigate them.

Follow the explain-then-y approval cycle in bsf-server/CLAUDE.md — present every edit with
What / Why / Tradeoff in one message with no tool calls, then wait for y.
```
