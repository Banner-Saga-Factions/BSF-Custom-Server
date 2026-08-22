# Plan — Reconcile the server roadmap & docs with the new client documentation (BSF-Client PRs 15–17)

> **One finding here was overturned on 2026-08-21.** Where this plan records that a unit fights with
> its roster numbers in battle, measurement showed the opposite: the stats sent with a battle are what
> *both* players fight with. Those passages are kept as the record of what this effort believed. The
> settled answer is [`../docs/client-contract.md`](../docs/client-contract.md) → R13.

> **Follow-on:** this plan reconciled the *documents*. Checking the server **code** against the same
> client documentation is a separate effort with its own plan —
> [`Plan-Client-Contract-Audit.md`](./Plan-Client-Contract-Audit.md) — which found five requirements we
> do not meet. Its results live in [`../docs/client-contract.md`](../docs/client-contract.md).

## Context — why this change

BSF-Client's **client documentation track** (P1/P2/P3 = PRs #15/#16/#17) is 100% merged. It added
eight durable client docs that are, for the first time, the **cross-repo boundary** documents:
`client-overview`, `game-flow`, `patch-inventory`, `asset-loading`, `ui-system`, `data-model`,
`offline-ai`, `mod-bridge`. Several of them **link into the server docs** (e.g. `data-model.md` →
`bsf-server/docs/dataStructures.md`; `data-model.md` §5 → the server matchmaking gotchas).

Two problems follow, and this plan fixes both:

1. **The server roadmap (`bsf-server/misc/Plan-Master-Roadmap.md`) hasn't absorbed what the client docs
   now establish.** One row is arguably mischaracterized (the AI-bot backstop), and four rows can be
   sharpened with named client-side surfaces that de-risk their "verify first / manual check" steps.
2. **The link is one-way.** The client docs point at the server; the server docs (`dataStructures.md`,
   `serverEndpoints.md`, `gameFlow.md`, `database-schema.md`, `security.md`, `battle-simulation.md`,
   `protocol-cross-reference.md`) point back at almost none of the new client docs. The boundary should
   be navigable from both sides.

Intended outcome: the roadmap reflects reality, and a developer standing in either repo can hop to the
matching doc across the boundary.

**Scope:** documentation only. No code, no schema, no tests. Two delivery waves against `bsf-server`,
preceded by one small client-side verification spike that de-risks the roadmap's most substantive edit.

---

## What the client docs actually establish (the evidence base)

| Client doc | Fact that matters to the server side |
|---|---|
| `offline-ai.md` §1, §3 | The offline player-vs-AI battle (#12) makes **zero server calls** and fields a **mirror of your own party** flagged `friendly=true`. It is *local practice*, launched by `Ctrl+Shift+A` or the `start_ai_battle` mod command — **not** a matchmaking participant. |
| `offline-ai.md` §5 | The AI brain (`AiModuleDredge`) **never uses specials and never focus-fires** — too weak to feel like a real opponent without the separate AI-strength track. |
| `mod-bridge.md` §6, §8 | The ModBridge HTTP tap only observes **server traffic** (and forwards the login body + `session_key` verbatim — a CRITICAL, unfixed client-side leak). Offline battles emit no traffic, so the tap is silent during them. |
| `game-flow.md` (actions) | The client already ships `UnitVariationTxn`, `LobbyInviteTxn`/`LobbyOptionsTxn`, `LeaderboardsTxn`, etc. — the client-side mirror of the server route map. |
| `data-model.md` §3–§5 | Unit appearances (`v0/v1/v2`) are gated by `unlock_id`/`acquire_id` **client-side**; per-stat min/max lives in the class `StatRange` **client-side**; and, as recorded at the time, "in battle a unit fights with its roster numbers, not the server-sent battle-def stats" — overturned 2026-08-21, see the note at the top. |
| `ui-system.md` (screens/HUD) | Named surfaces: `FriendLobbyPage` (`friend_lobby.swf`) for #91; `GuiMatchResolution`/`MatchResolutionPage` (`match_resolution.swf`) — the end-of-battle overlay for #137. |

---

## Delivery structure

**Spike → Wave 1 → Wave 2.** Two doc-delivery waves (each = one chat = one bsf-server PR), plus a
client-side spike that feeds Wave 1's AI-backstop rewrite. The spike is a de-risking investigation, not
a delivery wave.

### Spike — "Is the AI-bot backstop actually client-recompile-gated?" (bsf-client, investigation)

**Status: DONE — verified 2026-07-22 (read-only). Result embedded in the Wave 1 kickoff prompt below; companion note added to the client's `Plan-Improve-Battle-AI.md`.**

**Why:** the roadmap calls the AI backstop "the durable liquidity fix … client recompile-gated." The
mod bridge (launch/steer hooks) already ships, which *looks* like it could weaken the "recompile-gated"
label — but `offline-ai.md` (offline = zero server calls) and `mod-bridge.md` (the tap only sees server
traffic) suggest the opposite. Resolve it against the decompiled code before rewriting the row.

**Question to answer definitively (read-only, against `bsf-refs/client-decompiled-as3/` + client docs):**
- During an **offline** AI battle, does *any* ModBridge channel carry live battle state to `mods/host.exe`?
  (The HTTP tap is silent — is there any other hook, or only `start_ai_battle`/`set_spectator`?)
- Therefore: can a *smarter* offline AI be delivered as an external mod-host "brain" with **no new client
  build**, or does it require either (a) improving in-client `aimodule/*` AS3, or (b) adding a new
  in-client state-streaming hook — both of which are recompiles?

**Finding (VERIFIED):** still recompile-gated for a genuinely smarter
*offline* AI, because the mod bridge's only battle-observation channel is the HTTP tap, which offline
play never feeds. If so, the roadmap keeps the "recompile-gated" label but corrects *why*.

**Deliverable:** a one-paragraph verified answer (optionally a note in the client's
`Plan-Improve-Battle-AI.md`), handed to Wave 1.

### Wave 1 — Roadmap sharpening (bsf-server, 1 PR, docs-only)

Single file: **`bsf-server/misc/Plan-Master-Roadmap.md`**.

1. **AI-bot backstop row + parallel-track bullet** (≈ lines 51 & 85). Re-characterize: separate the
   reusable AI *brain* (#12, largely shipped) from an *empty-queue, server-mediated backstop* (unbuilt —
   offline ≠ liquidity, `offline-ai.md` §1/§3) from the *AI-strength track* (`offline-ai.md` §5). Fold in
   the spike's verified recompile-gating answer. Cross-link `offline-ai.md` §3/§5 and `mod-bridge.md`.
2. **Color variants #98/#72/#119 row + Phase 2b bullet** (≈ lines 33 & 71). Add the client corroboration:
   client already sends `UnitVariationTxn` (`game-flow.md`); appearances gated by `unlock_id`/`acquire_id`
   client-side (`data-model.md` §3) → the server's job is to *grant the unlock ids*, which directly informs
   the unlocks-table-vs-`acc.json` decision already noted in 2b.
3. **#91 friends row + Phase 2a bullet** (≈ lines 32 & 70). Name the client surfaces the "verify client
   `URLLoader` shape first" step must trace: `FriendLobbyState` + `LobbyInviteTxn`/`LobbyOptionsTxn`
   (`game-flow.md`), `FriendLobbyPage`/`friend_lobby.swf` (`ui-system.md`).
4. **#137 Elo chat line row + Phase 2d bullet** (≈ lines 35 & 73). Name the overlay the "manual
   result-overlay visibility check" targets: `GuiMatchResolution`/`MatchResolutionPage`
   (`match_resolution.swf`) per `ui-system.md`.
5. **#62 shop / stat-purchase row** (≈ line 34). Note the `StatRange` client-side parity gap
   (`data-model.md` §3), already mirrored server-side at `serverEndpoints.md:120` — the server can't fully
   validate stat purchases until those tables port.
6. **Footer note.** One line recording that the client documentation track (P1–P3) is complete — eight
   durable boundary docs now exist; entry point `client-overview.md`.

All new links use the dual-link form (`[local](../../bsf-client/docs/X.md) | [GitHub](.../BSF-Client/blob/master/docs/X.md)`).

### Wave 2 — Server-doc reciprocity (bsf-server, 1 PR, docs-only)

**Status: DONE — 2026-07-25, branch `docs/reconcile-server-links-wave2` (stacked on Wave 1). Execution
detail lives in its own plan: [`Plan-Wave-2-Server-Doc-Reciprocity.md`](./Plan-Wave-2-Server-Doc-Reciprocity.md).**

Wave 2 shipped the table below **plus four accuracy fixes** that were found while reading the target
files and absorbed because each sat on a line the wave already edited:

1. **`serverEndpoints.md` described stat purchases the way the server used to work.** It said a stat
   change must be an integer in `[0, 20]` and that negative values are rejected; the server has
   accepted **−20 to 20** since #118 (`src/services/roster.ts:255-269`). Negative values are not an
   error — the client's stat panel subtracts a point on right-click. Rejecting them *was* the #118 bug.
2. **Three links in `doc-gaps.md` were broken for anyone reading on github.com** — plain relative
   paths into the client repo, now dual-linked.
3. **Four file paths in `serverEndpoints.md` pointed at `c:\decompile\bsf\…`**, a folder that no longer
   exists, and hardcoded one person's user directory. Rewritten as class paths, with a note saying what
   they are relative to.
4. **The "a unit fights with its roster numbers" rule was written down nowhere server-side.** It now
   lives in full in `.claude/rules/gotchas.md` (which auto-loads for anyone editing `src/`) with a
   title-only line indexed in `docs/FAQ.md`, per that file's maintenance rule.

The reciprocal links as delivered:

| File | Edit |
|---|---|
| `docs/battle-simulation.md` | Add `offline-ai.md` §3 to the "Client-side engine" pointer list — the strongest corroboration of #79's "server never simulates" (identical engine, server fully removed). |
| `docs/dataStructures.md` + `docs/database-schema.md` | Add a "client-side view" cross-link to `data-model.md` (Def/Vars/Wrangler load path; roster-not-battle-def rule; `StatRange`). Currently `data-model.md` links here but not vice-versa. |
| `docs/serverEndpoints.md` + `docs/gameFlow.md` | Add a pointer to `game-flow.md` (the client `*Txn` action index). `serverEndpoints.md` already names individual `*Txn` classes — add the index link. |
| `docs/protocol-cross-reference.md` | Add the client `*Txn` reference (link `game-flow.md` actions); annotate the variation row (`:40`) with its client caller `UnitVariationTxn`. |
| `docs/security.md` | New entry: the ModBridge credential-leak (`mod-bridge.md` §8) as a known **cross-repo, client-side** threat surface (login body + `session_key` forwarded to `mods/host.exe`). Not in any server doc today. |
| `docs/FAQ.md` / `docs/observability.md` / `docs/serverEndpoints.md` | The roster-stats-in-battle + power-mismatch notes gain a cross-link to `data-model.md` §5; shorten any restated *mechanism* to the link. |
| `docs/doc-gaps.md` | Update the "companion to the client suite" note (`:11`): the client suite is now **complete** — enumerate the eight docs / point at `client-overview.md`. |

Two links landed slightly wider than planned, both worth noting: `serverEndpoints.md` and
`protocol-cross-reference.md` also gained a pointer to the client's `wire-protocol.md`, which openly
calls itself the opposite-direction mirror of `protocol-cross-reference.md` and links here — with
nothing coming back. And the variation row picked up the client's exact route shape
(`services/roster/unit/variation/{id}/{x}/{y}`), which is what the missing endpoint behind
#98 / #72 / #119 has to answer.

**With Wave 2 shipped, this plan has no open waves.**

---

## Sequencing & branching

- **Spike** runs first (bsf-client, read-only against the decompile). Blocks only the AI-backstop row of
  Wave 1; if deferred, Wave 1 writes that row as "recompile-gating under verification — see spike" and the
  rest of Wave 1 proceeds.
- **Wave 1 is unblocked — PR #161 merged (2026-07-22).** The #145 close-out is now in `main`, so branch
  Wave 1 off **updated `main`** — `git pull` first (local `main` was behind `origin/main` at session start).
  No stacking / conflict concern remains.
- **Wave 2** branches off `main` (or off Wave 1 if Wave 1 hasn't merged) — it touches different files from
  Wave 1, so no conflict either way.
- One branch per wave, off an updated `main`, following the explain-then-`y` approval cycle
  (`bsf-server/CLAUDE.md` working style). Each wave leaves both repos shippable.

## Verification (docs-only)

1. **Link integrity** — every new dual-link resolves locally (Ctrl+click in VS Code) and the GitHub URL is
   well-formed (`BSF-Client/blob/master/docs/…`; server-internal links `./X.md`). Spot-check the section
   anchors referenced (`offline-ai.md` §3/§5, `data-model.md` §3/§5).
2. **Roadmap consistency** — the AI-backstop row no longer asserts "#12 = durable liquidity fix" without
   the offline/liquidity distinction; cross-refs point at real sections.
3. **Build/tests unaffected** — no `src/` touched, so `yarn build && yarn test` (pre-commit hook) passes
   trivially; a docs-only commit may use `SKIP_SIMPLE_GIT_HOOKS=1` after a green build if desired.
4. **Reviewer** — run `pre-push-reviewer` only if explicitly requested (per standing preference; not
   auto-triggered).

---

## Kickoff prompts (paste into a fresh chat per wave)

### Spike (bsf-client)
```
Verification spike feeding Wave 1 of bsf-server/misc/Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md.
Repo: bsf-client (read-only; decompile at %USERPROFILE%\Code\bsf-refs\client-decompiled-as3\).
Question: Is the "AI-bot backstop" genuinely client-recompile-gated? Specifically —
during an OFFLINE AI battle (which makes zero server calls, per docs/offline-ai.md §1/§3),
does any ModBridge channel carry live battle state to mods/host.exe, or is the HTTP tap
(docs/mod-bridge.md §6) the only battle-observation path (and thus silent offline)?
Conclude whether a *smarter* offline AI can ship as an external mod-host brain with NO new
client build, or requires improving in-client aimodule/* AS3 or adding a state-streaming hook.
Deliverable: one verified paragraph (+ optional note in misc/Plan-Improve-Battle-AI.md). Read-only.
```

### Wave 1 — Roadmap sharpening (bsf-server)
```
Wave 1 of bsf-server/misc/Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md. Repo: bsf-server. Docs-only.
Continue on the existing docs/reconcile-roadmap-wave1 branch (already based on updated origin/main @969459f, this plan doc is its first commit — no new branch or git pull needed).
Edit ONLY misc/Plan-Master-Roadmap.md: (1) re-characterize the AI-bot-backstop row + parallel-track
bullet using the spike's verified answer + offline-ai.md §3/§5 + mod-bridge.md (offline ≠ liquidity;
brain vs backstop vs AI-strength); (2) color-variants row/Phase 2b — client sends UnitVariationTxn,
unlock_id gating (data-model.md §3); (3) #91 row/Phase 2a — name FriendLobbyState/LobbyInviteTxn +
FriendLobbyPage; (4) #137 row/Phase 2d — name GuiMatchResolution/MatchResolutionPage; (5) #62 row —
StatRange client-side gap (data-model.md §3, mirrors serverEndpoints.md:120); (6) footer: client doc
track P1–P3 complete. Dual-link form for all client links (BSF-Client/blob/master). Follow the
explain-then-y approval cycle; present all edits before touching the file.

--- SPIKE RESULT (verified 2026-07-22, read-only against the decompile) ---
VERIFIED ANSWER: During an offline player-vs-AI battle, NO ModBridge channel carries live battle state
to mods/host.exe. The bridge's only automatic battle-observation path is the HTTP tap (server traffic
copied to the host — HttpAction.as:141/:253); an offline battle makes zero server calls, so the tap is
silent the whole battle. The generic emit(...) fires only for BRIDGE_READY/SHUTDOWN lifecycle events
(ModBridge.as:235/:466) — no aimodule/* or battle-engine code calls it. Host→game commands
(start_ai_battle → returns "ok"; set_spectator) only launch/flag a battle, never read the board. The
planner (AiModuleDredge/AiModuleBase/AiPlan) is Stoic's in-SWF code with no outward channel. Verified vs
ModBridge.as + whole-tree grep + the pristine shipped-SWF decompile (zero ModBridge references).
CONCLUSION: a smarter offline AI CANNOT ship as a pure external mod-host brain on the current build — an
external brain would be blind. It is client-recompile-gated by one of two roads (both a rebuild):
(a) improve the in-client aimodule/* AS3 (Tiers 0/1 of Plan-Improve-Battle-AI.md), a rebuild per
iteration; or (b) add an in-client battle-state serializer + a streaming/command hook to ModBridge
(Tier 2 groundwork), a single rebuild after which the external brain evolves with no further reships.

FRAMING — "correct the why, not the label": the mod bridge already shipping does NOT weaken the
"recompile-gated" label; it needs a sharper why. Write two distinctions into the row: (1) launch/steer ≠
observe/play — shipped hooks START an offline battle with no build but give no way to SEE or DRIVE one;
(2) the one-time cost lives in the client — even the external-brain road is recompile-gated once (to add
the serializer + hook), after which it's free to evolve. So "recompile-gated" holds; the corrected reason
is "no battle-state channel exists offline," not "the AI can't be externalized in principle." (Separately:
offline practice = mirror-of-your-own-party, friendly=true, zero-server-call local mode → not a
matchmaking-liquidity participant; that's the row's "offline ≠ liquidity" edit.)
```

### Wave 2 — Server-doc reciprocity (bsf-server)
```
Wave 2 of bsf-server/misc/Plan-Reconcile-Server-Docs-With-Client-Doc-Track.md. Repo: bsf-server. Docs-only.
Branch off main (or off Wave 1 if unmerged). Add reciprocal cross-links so the boundary is navigable both ways:
battle-simulation.md → offline-ai.md §3; dataStructures.md + database-schema.md → data-model.md;
serverEndpoints.md + gameFlow.md → game-flow.md (client *Txn index); protocol-cross-reference.md →
game-flow.md actions + annotate the variation row (:40) with client caller UnitVariationTxn;
security.md → NEW entry for the ModBridge credential leak (mod-bridge.md §8); FAQ.md/observability.md/
serverEndpoints.md roster-stats + power-mismatch notes → data-model.md §5 (shorten restated mechanism to
the link); doc-gaps.md (:11) → note the client suite is now complete, enumerate the 8 docs. Dual-link
form for all client links (BSF-Client/blob/master). Follow the explain-then-y approval cycle.
```
