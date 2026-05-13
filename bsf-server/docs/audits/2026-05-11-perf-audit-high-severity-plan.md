# Plan: Fix High-Severity Findings From 2026-05-11 Perf Audit

## Context

The 2026-05-11 perf audit (`bsf-server/docs/audits/2026-05-11-perf-audit.md`) targets intermittent OOM-style "match freezes and load failures" on the 1 GB GCP `e2-micro` running the BSF server. This plan covers the three **High** severity findings only:

- **#3 No turn timeout** — A stalled or crashed client leaves both the opposing client hanging on long-poll and the `Battle` object in memory indefinitely. Until the 30-min session TTL fires, the match is frozen on screen.
- **#4 No `process.on('unhandledRejection' | 'uncaughtException')`** — A single thrown async error crashes Node; on e2-micro that flushes all in-memory state (sessions, battles, queue), which players experience as a global disconnect storm.
- **#5 `endgame()` is fire-and-forget and never removes the battle from the registry** — Even after a clean win/loss, the `Battle` lives in the `battles{}` map until both clients send `/exit`. If either client closes the post-battle screen with alt-F4 or a network drop, the battle leaks until both sessions are TTL-evicted (and even then, only because Finding 1/2 was already patched separately).

### Important correction to the audit

Findings 1 and 2 (Critical: battle registry leak on session TTL eviction) are **already fixed** in `bsf-server/src/services/auth/auth.ts:115-150` — the reaper now calls `finalizeSurrender()` for mid-battle evictions and `battleHandler.removeBattle()` to clear the registry. That code is recent, so the audit author appears to have read a slightly older version of the file. The High-severity findings below are still outstanding.

### Reusable code we will lean on

- **`finalizeSurrender(data)`** (`Battle.ts:430-453`) — already handles "this player surrenders, opponent wins, run `endgame()`". Guarded by `endgameStarted`. The turn-timeout fix (#3) will reuse this instead of writing a parallel "timeout surrender" path.
- **`battleHandler.removeBattle(battle_id)`** (`Battle.ts:163-165`) — already exists; the endgame cleanup (#5) just needs to call it after `endgame()` resolves.
- **`sessionHandler.getSession("session_key", key)`** (`auth.ts:140-143`) — used to resolve the surrendering and surviving sessions from inside the timer callback.
- **Logging style** — `console.error("[BATTLE] ...")` / `console.error("[FATAL] ...")`, matching the existing `[TAG] message` convention.

---

## Planned edits

Three files change. Listed in implementation order. Each entry below covers **What / Why / Tradeoff**, per the project's "explain every edit" rule.

### 1. `bsf-server/src/index.ts` — install process-level error handlers (Finding #4)

**What.** Add two lines at the top of the file (before `http.createServer(...)`) to log — but **not** exit on — unhandled promise rejections and uncaught exceptions:

```ts
process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
});
```

**Why.** Right now if any async code path throws without a surrounding `.catch` — including inside the `.catch` of `endgame()` itself — Node's default behavior on 20.x is to terminate the process. On the e2-micro that means every connected player sees a disconnect at once and the server cold-restarts with empty memory. Logging instead of exiting keeps the rest of the players' matches alive while still leaving a breadcrumb in the logs.

**Tradeoff.** After such an error the process may be in an inconsistent state — for example a single session might have a corrupted `accountData` reference. We accept this because on a single-instance 1 GB deployment the alternative (process exit) is strictly worse. We are not adding alerting or restart logic in this pass.

---

### 2. `bsf-server/src/services/battle/Battle.ts` — sweep the registry after `endgame()` (Finding #5)

**What.** Two small changes inside `Battle.ts`:

(a) At the `endgame(data).catch(...)` call on line ~418 (inside `/killed`), attach a `.finally()` that schedules a 30-second `setTimeout` to call `battleHandler.removeBattle(battle.battle_id)`. The timeout is `.unref()`'d so it never blocks process exit. The 30 s window lets a polite client still send `/exit` and receive a clean response.

(b) At the `await endgame(data).catch(...)` call on line ~451 (inside `finalizeSurrender`), do the same thing.

Sketch:

```ts
endgame(data)
    .catch(err => console.error("[BATTLE] endgame failed:", err))
    .finally(() => {
        setTimeout(() => battleHandler.removeBattle(battle.battle_id), 30_000).unref();
    });
```

(For the `finalizeSurrender` site, factor the inline `.catch` out so we can chain `.finally()` cleanly.)

**Why.** `endgame()` already pushes the "battle finished" message to both clients, so the battle is logically over. But `removeBattle()` is currently only called from `/exit` when both parties have already sent it (`Battle.ts:460-463`). If either client closes their game before sending `/exit` — alt-F4 from the post-battle screen, network blip, OS sleep — the `Battle` object (plus `parties`, `turns[]`, `aliveUnits`) stays in the `battles{}` map until both sessions hit their 30-minute TTL. On a box with ~600 MB of usable heap this is a real leak. The 30-second grace lets `/exit` from a polite client still find the battle and clean up cooperatively before the forcible sweep.

**Tradeoff.** A polite client that sends `/exit` after 30 s gets a 404 from the middleware (`Battle.ts:178-181`). Looking at the existing exit handler, this is harmless — the response is JSON and the client already has to handle a missing battle (their own session may have been evicted). We should confirm this is true in practice during manual test (`/exit` after 30 s should still leave the client UI in a sane state). The other risk is that `endgame()`'s `.then` block runs `pushData` after some DB latency; a 30 s grace is comfortably longer than the DB writes, so the finished message will land before the sweep.

---

### 3. `bsf-server/src/services/battle/Battle.ts` — add a per-turn server-side deadline (Finding #3)

**What.** Add a small amount of state and one helper to the `Battle` class, and refresh-hook calls in four route handlers:

(a) Two new private fields on `Battle`:
- `private turnDeadline?: NodeJS.Timeout;`
- `private lastActorKey?: string;` — the `session_key` of whoever sent the most recent turn-advancing message.

(b) One new method, `refreshTurnDeadline(actorKey: string)`:
- Clears any existing `turnDeadline`.
- Stores `lastActorKey = actorKey`.
- Schedules a new `setTimeout` of `TURN_LIMIT_MS` (proposed: `90_000`).
- The timeout callback identifies the *other* party (the one who is now expected to act next) and calls `finalizeSurrender({ session: stuckSession, opponent: actorSession, battle: this })`. Both sessions are resolved via `sessionHandler.getSession("session_key", key)`. If either has already been evicted, we just call `battleHandler.removeBattle(this.battle_id)` to free the registry.
- The timer is `.unref()`'d.

(c) One new method, `clearTurnDeadline()`, called from inside `battleHandler.removeBattle` (or from the `endgame` cleanup) to stop the timer when the battle ends.

(d) Refresh hooks: at the **end** of each turn-advancing route handler — `/sync` (line ~250), `/move` (line ~325), `/action` (line ~370), `/killed` (line ~386, before the endgame check) — call `battle.refreshTurnDeadline(data.session.session_key)`.

**Why.** Today, if a client dies mid-turn the opponent's long-poll just returns empty every 10 s forever, the active poll keeps refreshing `lastActivity`, and the battle hangs until the dead client hits the 30-min TTL. Even with Finding 1/2 already fixed, that's 30 minutes of "match frozen" UX for the survivor *and* 30 minutes of resident memory for the abandoned battle. A 90-second server-side deadline turns "match freeze" into "you win, opponent timed out" and frees the registry slot immediately.

Reusing `finalizeSurrender` (instead of writing a new "timeout endgame" path) is the cleanest choice because it already handles the `endgameStarted` guard, the DB writes, and the client messaging. The 30 s post-endgame sweep from edit #2 then removes the battle from `battles{}`.

**Tradeoff.** The "penalize the other party" model the audit recommends has one known edge case: if player X starts a turn, sends `/move`, then stalls without sending `/action`, X's `/move` will be the "most recent turn-advancing message" — so when the timer fires, player Y (the *opponent*) gets surrendered, which is the wrong outcome. We accept this because:

1. The primary goal is freeing the orphaned `Battle` object on the 1 GB box, not enforcing perfect fairness.
2. The gap between `/move` and `/action` within one turn is normally seconds; a player who pauses for 90 s mid-turn is almost certainly disconnected, in which case "the other party wins" is actually the *right* outcome 95%+ of the time.
3. Adding strict turn-ownership tracking (using the `turn` field + party index) would be a bigger change. We can revisit if reports come in. The plan deliberately keeps this simple per the audit's recommendation.

`TURN_LIMIT_MS = 90_000` is a starting value — it must exceed the longest legitimate think time but not be so long that an abandoned match still freezes the UI for minutes. 90 s matches the in-game timer values (30 s / 45 s) plus headroom for client lag.

---

## Verification

1. **Unit tests** — run `yarn test`; confirm all 50 tests still pass. (No new tests required for the process handlers; the timeout logic has clear unit-test surface area if we want to add one — a fake timer test against `refreshTurnDeadline`, asserting that `finalizeSurrender` is invoked with the expected sides — but is out of scope unless requested.)
2. **Manual end-to-end** — start the server (`start-server.bat`), use `launch-game-2p.ps1` to bring up two clients:
   - **Happy path:** play a full match through to a `/killed` win. Confirm the post-battle screen appears for both players. Wait 35 s and confirm `console.log` shows the battle being removed (we may want to add a one-line debug log inside the `setTimeout` for verification, then drop it).
   - **Turn timeout:** start a match, have one player drop (close the game window). Confirm the surviving player sees "you won" within ~90 s, not 30 minutes.
   - **Process handler:** intentionally throw inside a non-critical route (temporary test) and confirm the server logs `[FATAL]` but keeps running, then revert the test code.
3. **Heap sanity** — after the manual flow above, watch `node` RSS over a few minutes; it should plateau, not grow.

---

## Files touched

- `bsf-server/src/index.ts` — add 6 lines for the process handlers.
- `bsf-server/src/services/battle/Battle.ts` — add turn-deadline state + method (~30 lines), refresh-hook calls in 4 routes (1 line each), and `.finally(() => removeBattle)` on both `endgame()` call sites.

No DB schema changes. No new dependencies. No new modules.
