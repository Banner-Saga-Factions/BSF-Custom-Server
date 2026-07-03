# Plan — Re-engagement Sprint 1 (low-recompile player-experience wins)

> **Status:** planned, not yet implemented. Captured from a planning chat on 2026-06-18.
> **Scope decided with the user (interview answers below):** re-engage the *original*
> Factions community; current concurrent players ≈ "just me / a few testers"; all change
> mechanisms in-scope (data/config, server code, external overlay, recompile if payoff is
> high); first round = **quick config wins (days)**; bots embraced as the liquidity backstop.
> **This doc covers Sprint 1 (server-only, no-recompile, days) plus the framing for the larger
> bot-backstop track.** No files have been changed yet.

## The game-theoretic frame (why this order)

The binding constraint is **matchmaking liquidity**, not features. With ≈0 concurrent
players, re-engagement is a **one-shot game**: a lapsed player who accepts an invitation,
returns, queues, and finds an empty lobby doesn't just leave — they re-confirm "still dead"
and the cheap shot at them is spent. So every re-engagement idea must be paired with a
**liquidity guarantee**.

There are only two liquidity guarantees available:

1. **A bot backstop** — the queue can always offer an AI opponent (this is the *durable*
   fix, but it is recompile-gated client work; see "Track B" below).
2. **A scheduled Battle Hour** — a Schelling point that concentrates the few humans into the
   same minute (this is the *days-scale* substitute, and the spine of Sprint 1).

Audience reality from the interview: the target is the **original 2013–2018 community**, who
are **not in the client** today — so the *acquisition* message must travel on **Discord /
Reddit** (an in-client message-of-the-day only reaches people who already launched, making it
a **retention** tool, not an acquisition one). The strongest trust signal is that **Stoic
OK'd redistribution** — lead every external announcement with it.

### Interview answers (verbatim choices)

| Question | Answer |
|----------|--------|
| Priority segment | **Re-engage lapsed players** |
| Active players now | **Just me / a few testers** (effectively pre-launch) |
| In-scope mechanisms | Data/config edits · server code · external overlay · will recompile if payoff is high |
| Effort budget (round 1) | **Quick config wins (days)** |
| Who "lapsed" means | **Original Factions community** (never used this server) |
| Reach channels | **Discord + Reddit/forums** |
| Bot backstop | **Embrace bots** so the queue is never empty |

## What the code verification found (two corrections to the first draft)

Two ideas from the initial brainstorm were wrong on inspection and are corrected here:

- **The "bot backstop" is NOT a config win — it is the biggest item.** The player-vs-AI
  feature has **zero server commits** (`feature/player-vs-ai` is empty vs `main`); it lives
  entirely in the **client** submodule (branch `feat/player-vs-ai`). It is an *offline* mode
  (`startAiBattle(false)`, `isOnline == false`, **no server round-trip**), gated behind the
  **Ctrl+Shift+A** hotkey, **not wired into matchmaking**, currently **hangs in init**
  (BSF-Client issue #12 — fix needs an **SWF recompile**), and because it is offline it awards
  **no renown and no Elo**. Treated as **Track B** below, not a Sprint-1 item.

- **The "News of the Banner" popup is NOT a server message channel.** It is client-side; the
  server cannot drive it; the only available action is *suppression* via a per-machine SOL
  byte-patch (`fix-news-popup.ps1`, issue #28). See
  `bsf-server/.claude/rules/gotchas.md` ("The server cannot suppress it"). The real
  server-driven in-client channel is **global chat**: `src/services/chat.ts` already
  broadcasts `room:"global"` to every session, and the client buffers it in
  `Chat.globalMsgs` (`%USERPROFILE%\Code\bsf-refs\client-2013-as3\...\engine\session\Chat.as`).

- **Bonus discovery — `display_name` is fully server-controlled** (`Session.display_name` in
  `src/services/auth/auth.ts`, sent as `party.display_name`, the leaderboard name, and the
  chat username). A server-computed **title suffix** therefore appears on the nameplate,
  leaderboard, and chat **with no recompile**. This makes player titles a genuine quick win.

## Sprint 1 — server-only, no recompile, days (ordered cheapest-first)

Strategic spine: **until the bot ships, the liquidity guarantee is the scheduled Battle Hour**
(S3), announced externally (S4) and echoed in-client (S1).

### S1 · Message-of-the-day via global-chat broadcast + login injection `[server]`

- **What:** a small broadcast helper in `src/services/chat.ts` (push a `CHAT_MESSAGE`,
  `room:"global"`, to all sessions) **plus** appending a current MOTD line in
  `getInitialData()` (`src/services/auth/auth.ts:48`) so every client receives it at login.
  MOTD text comes from a new `data/motd.json` (or an env var) so it can be changed without a
  code edit — note `first.json`/static data is **cached at module load**, so a change needs a
  server restart (`gotchas.md`).
- **Why:** gives one server-controlled line *inside* the client to announce "we're back /
  Battle Hour Sat 8pm / AI practice anytime."
- **Tradeoff / risk:** only reaches people who already launched, so this is **retention**, not
  acquisition (S4 does acquisition). **Blocked on the menu-visibility test** (see
  "Verification needed"); if chat renders only in lobby/battle, S1 drops to a once-back nicety.

### S2 · Player titles as a `display_name` suffix `[server]`

- **What:** compute a title from the DB (`ranking`: wins / `win_streak` / Elo; roster: top-unit
  `RANK`, total `KILLS`) via a small new `src/services/titles.ts` lookup table, then append it
  on login in `auth.ts` — **or** scope it to the `/game/leaderboards` builder
  (`src/services/game.ts`) if it should stay on one screen.
- **Why:** a cheap status / progression hook. Lore titles (*Hraun-born, Shieldbanger,
  Menders' Bane*) plus fun ones (*Undefeated, Comeback Kid, First Blood*). Renders everywhere
  the name renders.
- **Tradeoff / risk:** suffixing `display_name` changes it on **all** surfaces (chat, battle,
  leaderboard) — scope to leaderboard-only if that is too loud. Needs a title taxonomy and
  thresholds (a design task, not code).

### S3 · Battle Hour — the liquidity guarantee `[external + light server]`

- **What:** a fixed weekly time. Optionally a server "window flag" that decorates it: a
  countdown via the S1 channel, or flipping on the spec'd-but-deferred **BOOST** renown award
  (`src/services/battle/renownAwards.ts`) during the hour.
- **Why:** with ≈0 concurrent players this is what makes humans actually meet — the Schelling
  point that substitutes for the bot until Track B lands.
- **Tradeoff / risk:** depends on rallying the channel; weak without reach (but Discord +
  Reddit exist).

### S4 · External announcement + bundled installer `[external, no code]`

- **What:** an "It's back — with Stoic's blessing" post on Discord + r/bannersaga, plus a
  one-click bundled GitHub release (redistribution permission already granted — see
  memory `project_stoic_distribution_permission`).
- **Why:** the actual **acquisition** lever — lapsed players are not in the client, so the
  message must travel outside it. Stoic permission is the trust signal that flips "sketchy fan
  server" to "legit revival."
- **Tradeoff / risk:** none code-wise; **fire it after S1/S3** so the first returning click
  hits a known Battle Hour, not a dead queue.

### S5 · Login / session instrumentation `[server]`

- **What:** count logins + concurrent sessions + queue entries over time (a structured log
  line, or a tiny `/admin/stats`). Touch points: `auth.ts` (login), `queue.ts` (already logs
  queue entries).
- **Why:** closes the loop — did re-engagement move the needle? Without it the effort is blind.
- **Tradeoff / risk:** trivial.

## Track B (parallel, weeks, recompile-gated) — the durable bot backstop

Worth doing because it permanently removes the "everyone show up at the same minute"
dependency — but it is a track, not a Sprint-1 item. Prerequisite chain:

1. **Fix BSF-Client #12 init-hang** — the `BattleStateInit.as` overlay, already planned in
   `bsf-client/misc/Plan-Fix-Issue-12-ai-battle-init-hang.md` (on a client feature branch) →
   requires an **SWF recompile**. Issue: https://github.com/Banner-Saga-Factions/BSF-Client/issues/12
2. **Wire the offline AI to an empty-queue path** — the queue UI offers "practice vs AI" after
   N seconds with no human → additional client work.
3. **Decide server economy participation** — the offline AI awards nothing today; making bot
   wins count toward renown / progression is a server design choice.

Until Track B lands, **S3 Battle Hour is the backstop.**

## Verification needed before S1 ships

A ~2-minute local test: with the server running, broadcast a `global` chat line and observe
**where** it appears in the client (camp / main menu vs only lobby / battle). The in-game chat
UI that renders `Chat.globalMsgs` is **not** in the 2013 source snapshot (it is post-2013 /
in the decompile), so menu visibility cannot be confirmed from source alone. That single
observation decides whether S1's in-client MOTD is a headline feature or a secondary nicety.
The external channel (S4) carries the real announcement regardless, so this does not block the
sprint — only S1's weighting.

## Suggested implementation order

1. **S5** (instrumentation) — smallest, and it measures everything that follows.
2. **S1 MOTD** — after the menu-visibility test.
3. **S2 titles** — once the taxonomy is agreed.
4. **S3 + S4** — Battle Hour scheduled and announced together.
5. **Track B** — start the #12 client recompile fix in parallel; it is the long pole.

## Key source references (for whoever implements)

- Matchmaking / queue: `src/services/queue.ts` (the 5-second `processMatches()` pump,
  `findBestMatch`, `tryCreateBattle`).
- First-poll data injection: `src/services/auth/auth.ts` — `getInitialData()` (concats queue
  state + `data/first.json`).
- Global chat broadcast: `src/services/chat.ts` (`room:"global"` → all sessions).
- Static data files: `data/first.json` (currency/friends), `data/acc.json`
  (`purchasable_units`), `data/lboard.json` (leaderboard baseline). All cached at load.
- Renown awards (BOOST etc.): `src/services/battle/renownAwards.ts`.
- Leaderboards builder: `src/services/game.ts` (`/game/leaderboards`, DB-driven since #84/PR #138).
- Client chat buffer (read-only reference):
  `%USERPROFILE%\Code\bsf-refs\client-2013-as3\game\code\client\lib.engine.core\src\engine\session\Chat.as`.
- News-popup suppression (NOT a server channel): `bsf-server/fix-news-popup.ps1`, issue #28,
  `bsf-server/.claude/rules/gotchas.md`.
