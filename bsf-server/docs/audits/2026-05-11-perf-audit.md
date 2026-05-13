# BSF Server Performance & Memory Audit — 2026-05-11

Target: Node 20 / Express / `node:sqlite` on a GCP `e2-micro` (1 GB RAM, low CPU).
Scope: in-process fixes only — no Redis, no clustering, no new dependencies.
Reporter: backend audit, read-only (no code changes in this pass).

## Executive summary

1. **Battle registry leak (Critical)** — orphan `Battle` instances persist forever when one party is TTL-evicted mid-match. `Battle.ts:152, 163, 463` only delete the battle when *every* `parties` entry has been removed via `/exit`, and `auth.ts:103-122` does not call `removeBattle` on eviction. Single biggest candidate for the OOM restarts on a 1 GB box.
2. **No turn timeout (High)** — `Battle.ts` has no per-turn deadline. A stalled or crashed client leaves both the opposing client hanging on long-poll and the `Battle` object in memory indefinitely. Combined with finding 1 this is how the registry accumulates.
3. **Missing `process.on('unhandledRejection' | 'uncaughtException')` (High)** — `index.ts` and `app.ts` register neither. A single thrown async error crashes Node; on e2-micro that means the *entire* in-memory state (sessions, battles, queue) is flushed, which players experience as a global disconnect storm.
4. **`endgame()` is fire-and-forget but `endgameStarted` is set *before* DB success (High)** — `Battle.ts:415-419, 528-589`. If the `Promise.all` rejects after `endgameStarted = true`, the battle is forever unresolvable through `/killed` (guarded by the flag) and only `/exit` from both sides can free the registry entry. The error branch sends `BattleFinishedData` to clients but never calls `removeBattle`.
5. **`node:sqlite` statements re-prepared per call (Medium)** — `connection.ts:64, 74, 78` call `db.prepare(sql)` on every `query`/`queryOne`/`queryUpdate`. None of the hot game paths hit this per turn (writes are confined to login, endgame, and `/account/update`), so it is a Medium for current load but a latent landmine if any per-turn write is ever added.
6. **`Session` is an `EventEmitter` with `data` listeners attached per-poll (Medium)** — `game.ts:80` uses `session.once("data", onData)`. The `once` + paired `removeListener` on the timeout/close paths is correct, but if `pushData` is invoked from inside another listener and *throws*, the listener may not be removed. Lower-likelihood but worth flagging on a 1 GB box. Session eviction also calls `removeAllListeners()` (auth.ts:118), which is correct.
7. **Session TTL eviction does not cascade to battle cleanup (Critical, same root cause as #1)** — `auth.ts:103-122` deletes the session and dequeues, but only "resets opponent TTL" and logs. It does not `delete battle.parties[session.session_key]`, does not clear `session.battle_id` for the survivor, and does not `removeBattle` even when the opponent is gone. Listed as a separate finding because the fix is in a different file.
8. **`getSession("user_id", ...)` O(n) walk (Low)** — `auth.ts:140-143`. Linear scan over the sessions map. Only called from `calculateLevel` on queue entry (`queue.ts:26`), not per-poll. Event-loop tax is small at current scale (single-digit concurrent sessions). Flag for indexing if session counts grow past ~100.
9. **`battle.turns[]` grows unbounded for the lifetime of the battle (Low/Medium)** — `Battle.ts:325-326, 370-371`. Each turn appends to a sparse array. For long matches this is bounded by gameplay but combined with finding 1 the array survives indefinitely on orphaned battles.

---

## Findings

### 1. Battle registry leak on one-sided disconnect

**Severity:** Critical

**Evidence:**

`Battle.ts:152`
```ts
// MED-1: const instead of var
const battles: Record<string, Battle> = {};
```

`Battle.ts:163-165` — only removal path:
```ts
removeBattle: (battle_id: string) => {
    delete battles[battle_id];
},
```

`Battle.ts:460-463` — `/exit` is the only caller of `removeBattle`, and it removes the registry entry only when **all** parties are gone:
```ts
delete battle.parties[data.session.session_key];
data.session.battle_id = undefined;
if (Object.keys(battle.parties).length === 0) battleHandler.removeBattle(battle.battle_id);
```

`auth.ts:103-122` — TTL reaper does not touch `battles`:
```ts
session.removeAllListeners();
dequeuePlayer(key);
delete sessions[key];
```

**Trigger:**

1. Players A and B start a battle. `battles[id] = { parties: {keyA, keyB} }`.
2. Player A's client process is killed (alt-F4, network drop, OS sleep).
3. 30 minutes pass. The session reaper (auth.ts:103) evicts A. The reaper logs `"opponent already gone"` or "TTL reset" but never deletes A's entry from `battle.parties` and never calls `removeBattle`.
4. Player B never sees a surrender (no `/killed` arrives because A's units are intact in `aliveUnits`; no `/exit` from A because their client is dead). B eventually closes the client and is also evicted.
5. After both sides are evicted, the `Battle` entry, its `parties`, `turns[]`, and `aliveUnits` are unreachable from any code path that would call `removeBattle`. Reference is held by `battles` map indefinitely.

**Impact on the 1 GB instance:**

Per-battle steady-state cost is small in absolute terms — each `Battle` holds 2× `BattlePartyData` with `defs` (~12 units × ~2 KB each = ~24 KB/party), an `aliveUnits` map (~hundreds of bytes), and a `turns[]` array that grows with match length. A clean battle is maybe 50-200 KB. An abandoned mid-late-game battle with 30+ turns of synced move/action data per turn can easily reach 1-5 MB.

At 10-50 abandons/day this is ~10-250 MB/day of monotonic growth, dwarfing the available headroom on a 1 GB instance after Node baseline (~80 MB) and Express + sqlite (~30 MB). **This is the single most likely root cause of the intermittent OOM-style "match freezes and load failures"** — once heap pressure crosses ~600-700 MB the V8 GC tax tanks event loop responsiveness, which the client experiences as long-poll timeouts.

**Proposed fix:**

Wire battle cleanup into the TTL reaper. In `auth.ts:103-122`, before `delete sessions[key]`:

```ts
// pseudo-diff
if (session.battle_id) {
    const battle = battleHandler.getBattle(session.battle_id);
    if (battle) {
        delete battle.parties[key];
        if (Object.keys(battle.parties).length === 0) {
            battleHandler.removeBattle(session.battle_id);
        } else {
            // Notify the survivor as if the evicted player surrendered, so their
            // client FSM exits the battle screen rather than long-polling forever.
            const survivorKey = Object.keys(battle.parties)[0];
            const survivor = sessions[survivorKey];
            if (survivor) {
                survivor.pushData({
                    ...battle.setBaseBattleData(`_surrender_${session.account_id}`,
                        ServerClasses.BATTLE_SURRENDER_DATA, session.account_id),
                    turn: 0, entity: "", ordinal: 0,
                });
                // Optionally schedule an endgame() with the survivor as winner here.
                battleHandler.removeBattle(session.battle_id);
            }
        }
    }
}
```

**Subtlety:** doing the full endgame() from the reaper means a DB write fires inside a `setInterval`. That's fine — `endgame()` already returns a `Promise` whose rejection is caught. The reaper itself stays synchronous; only the awaited paths inside `endgame()` cost time, and they don't block the loop on the reaper because they're awaited in a microtask.

---

### 2. Session TTL eviction does not cascade to battle cleanup

**Severity:** Critical (same root cause as #1, separate fix site)

**Evidence:**

`auth.ts:107-117`:
```ts
if (session.battle_id) {
    const opponent = sessionHandler.getSessions((s) => s.battle_id === session.battle_id && s.session_key !== key)[0];
    if (opponent) {
        opponent.lastActivity = Date.now();
        console.log(`[SESSION] Evicted stale session for user_id=${session.user_id} (mid-battle); opponent user_id=${opponent.user_id} TTL reset`);
    } else {
        console.log(`[SESSION] Evicted stale session for user_id=${session.user_id} (battle=${session.battle_id}, opponent already gone)`);
    }
}
```

Note: when `opponent` is gone, the code logs but does nothing. The `battles[]` entry survives with `parties = {still has both keys, or just one}`. There is no call to `battleHandler.removeBattle`.

**Trigger:** see finding 1.

**Impact:** see finding 1.

**Proposed fix:** see finding 1. The fix is keyed off `session.battle_id`, lives in `auth.ts`, and must import `battleHandler` from `battle/Battle.ts`. Watch for the circular import: `Battle.ts` already imports `Session` and `sessionHandler` from `auth/auth.ts`. The cycle currently works because `battleHandler` is a const object assigned at module load — but if you need to call methods on it from inside `auth.ts`'s top-level `setInterval`, prefer a lazy `require` or pass `battleHandler` in via a setter to avoid an undefined at first-tick.

---

### 3. No turn timeout

**Severity:** High

**Evidence:** `Battle.ts` defines no `setTimeout` per turn. The `timer` field on `BattlePartyData` (Battle.ts:145) is the *client-side* countdown displayed in the UI; the server never reads it back. There is no `/turn/timeout` route, no scheduled `endgame()` trigger.

**Trigger:**

1. Player A's network drops mid-turn — TCP connection alive enough that the session reaper does not fire for 30 min.
2. Player B's long-poll receives no further data because A never sends `/move`, `/action`, `/sync`, or `/killed`.
3. B's poll returns empty after 10 s (`game.ts:68`), the client immediately re-polls, and this loop continues for the full 30-min TTL.
4. B's `lastActivity` is refreshed by every poll (`game.ts:25`), so B never times out.
5. Battle hangs for 30 minutes until A is evicted by the TTL reaper. Until finding 1 is fixed, the battle then leaks.

**Impact on the 1 GB instance:** Indirect. Each stuck battle is one extra long-poll loop on the server (cheap in itself — a `setTimeout` + listener), plus the leaked `Battle` object. The user-visible symptom is "match freezes" exactly as reported.

**Proposed fix:** add a per-turn deadline to the `Battle` instance, refreshed whenever a turn-advancing message arrives. Pseudocode:

```ts
class Battle {
    private turnDeadline?: NodeJS.Timeout;
    private TURN_LIMIT_MS = 90_000;

    startTurnClock(currentTurnAccountId: number) {
        if (this.turnDeadline) clearTimeout(this.turnDeadline);
        this.turnDeadline = setTimeout(() => this.timeoutSurrender(currentTurnAccountId), this.TURN_LIMIT_MS);
        this.turnDeadline.unref(); // don't block process exit
    }

    private timeoutSurrender(stuckAccountId: number) {
        if (this.endgameStarted) return;
        this.endgameStarted = true;
        this.winner = /* the OTHER account_id */;
        // synthesize a `data` object shape that `endgame()` expects, then call it
    }
}
```

Call `startTurnClock` from `/move`, `/action`, `/sync`, and `/deploy` handlers. Ensure `clearTimeout(this.turnDeadline)` is in the `removeBattle` path (Battle.ts:163) so the orphan-cleanup fix from finding 1 also stops the timer.

**Subtlety:** picking the wrong `currentTurnAccountId` (e.g. the player who *just moved* vs the player whose turn it is *next*) will let the stuck player keep their game alive by spamming `/sync` against their own turn. Keep this server-side rather than trusting the client. The simplest version: timer always penalizes whichever side hasn't sent a `/action` or `/move` within `TURN_LIMIT_MS` after the previous one.

---

### 4. Missing `process.on('unhandledRejection' | 'uncaughtException')`

**Severity:** High

**Evidence:** `Grep -r "unhandledRejection|uncaughtException" bsf-server/src` returns no matches. `index.ts:1-7` is a 7-line bootstrap with no handlers. `app.ts` has no top-level `process.on`.

**Trigger:** anywhere a `Promise` rejection escapes its `.catch`, or a synchronous throw escapes Express's error middleware (Express *does* catch sync throws in handlers but **not** async ones unless wrapped with an error middleware — and there is none). Examples in this codebase:

- `endgame(data).catch(...)` at `Battle.ts:418` — handles its own rejections, but the inner `.then` callback (Battle.ts:536-588) contains code that constructs and pushes data; if `winnerSession.pushData(...)` throws because `winnerSession.removeAllListeners` raced with it, that throw rejects the `.then` and is caught by the trailing `.catch(err => console.error...)` at line 589 — good. But the `.catch` itself (Battle.ts:589-628) does not have its own `.catch`. A throw inside the recovery path is unhandled.
- `finalizeSurrender` at `Battle.ts:451`: `await endgame(data).catch(...)` — same shape.
- `void`-style fire-and-forget calls do not appear, but `Promise.all([...])` at `Battle.ts:528-535` is not awaited from `endgame()`'s caller — it relies entirely on the attached `.then/.catch` for resolution.

**Impact on the 1 GB instance:** Node's default on unhandled rejection in 20.x is process termination (post 15.x). A single bad input crashes the entire server, which on e2-micro means systemd (or whatever supervises it) restarts cold, all in-memory state lost, every connected client sees a disconnect. This matches the "load failures" symptom.

**Proposed fix:** add at the top of `index.ts`:

```ts
process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
});
```

**Subtlety:** Do not exit on these. On a 1 GB box with no clustering, exiting drops every player. Logging and continuing is the right tradeoff for this deployment, with the understanding that the process may enter an inconsistent state. Pair this with a sentry-style log filter so you can spot patterns.

---

### 5. `endgame()` is fire-and-forget and leaves a half-state on the error branch

**Severity:** High

**Evidence:**

`Battle.ts:415-419`:
```ts
if (party.length === 0 && !battle.endgameStarted) {
    battle.endgameStarted = true;
    battle.winner = Number(req.body.killerparty);
    endgame(data).catch(err => console.error("[BATTLE] endgame failed:", err));
}
```

`Battle.ts:528-589` — the success path of `Promise.all(...).then(...)` pushes `BattleFinishedData` and `RenownMessage` after DB writes complete.

`Battle.ts:589-628` — the failure branch pushes a fallback `BattleFinishedData` with `total_renown: 0`. **Neither branch calls `battleHandler.removeBattle()`.** Cleanup is deferred to whenever the clients send `/exit`, which is the same path that's broken in finding 1.

**Trigger:** Endgame fires successfully (`endgameStarted = true`, clients receive finished messages, DB writes succeed or fail). Players close the game without sending `/exit` (e.g. they alt-F4 from the post-battle screen). Both sessions are TTL-evicted 30 min later, and per finding 2, the `Battle` is never removed.

**Impact:** Same memory footprint as finding 1; the worst case is that *every* battle leaks if exit is racy on the client.

**Proposed fix:** Two complementary changes:

```ts
// Battle.ts:418 — after endgame() resolves either branch, sweep the registry.
endgame(data)
    .catch(err => console.error("[BATTLE] endgame failed:", err))
    .finally(() => {
        // Allow a grace window for /exit then forcibly remove
        setTimeout(() => battleHandler.removeBattle(battle.battle_id), 30_000).unref();
    });
```

Or — simpler — remove unconditionally in `.finally()` and have `/exit` tolerate a 404 silently. The 30 s window exists only so `/exit` can still report a clean `{ status: "success", battle_id }` to a polite client.

**Subtlety:** the `delete battle.parties[...]` on `/exit` (Battle.ts:460) will then run on an already-removed battle. `battleHandler.getBattle()` returns `undefined`, the middleware at Battle.ts:178-181 returns 404 — fine, but worth confirming the client handles a 404 on `/exit` gracefully.

---

### 6. `node:sqlite` statements re-prepared per call

**Severity:** Medium (Low for current load, latent landmine)

**Evidence:** `connection.ts:63-79`:
```ts
export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
    const stmt = db.prepare(sql);   // ← every call
    ...
}
export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
    return (db.prepare(sql).get(...) as T) ?? null;  // ← every call
}
export async function queryUpdate(sql: string, params?: any[]): Promise<number> {
    return (db.prepare(sql).run(...).changes as number);  // ← every call
}
```

No statement cache, no `.finalize()`. `node:sqlite` `Statement` objects rely on V8 GC, which is fine for correctness but adds parsing overhead on every call.

**Hot-path audit:** Which DB calls run per gameplay event?

- Per-turn (`/move`, `/action`, `/sync`, `/killed`, `/deploy`): **zero DB writes**. Battle state is purely in-memory.
- Per-poll (`game.ts`): zero DB calls.
- Per-login: `upsertAccount` (1 write + 1 read = 2 prepares).
- Per-queue-join: zero.
- Per-endgame: 2× `addRenown` + 1× `saveBattleResult` = 3 prepares, fires once per battle.
- Per-account-update: 1 prepare per `saveParty`/`saveRoster` call.

So at current load this is *not* on a hot path. It is a Medium because (a) any future feature that adds per-turn persistence (replay logs, achievement progress) will instantly multiply prepare overhead by turn count × battle count, and (b) on a low-CPU box the SQL parser itself is non-trivial — each `prepare()` for an `UPDATE accounts SET ... WHERE user_id = ?` is ~50-200 µs of CPU.

**Proposed fix:** module-level statement cache keyed by SQL text, with WeakRef cleanup is overkill. Plain `Map<string, Statement>`:

```ts
// connection.ts
const stmtCache = new Map<string, ReturnType<typeof db.prepare>>();
function prep(sql: string) {
    let s = stmtCache.get(sql);
    if (!s) {
        s = db.prepare(sql);
        stmtCache.set(sql, s);
    }
    return s;
}
// then use prep(sql) inside query/queryOne/queryUpdate
```

**Subtlety:** `node:sqlite` `Statement` does not need an explicit `.finalize()` — the binding finalizes on GC. Caching them indefinitely is safe as long as the set of distinct SQL strings is bounded (and it is — we have ~10 distinct queries in this codebase). Do **not** include user-supplied SQL strings (we don't have any — all queries are parameterized literals, good).

---

### 7. Long-poll listener pairing on `req`/`res`/`session`

**Severity:** Medium

**Evidence:** `game.ts:42-81`. Pattern reads as:

```ts
const onClose = () => { clearTimeout(timer); session.removeListener("data", onData); finish(); };
const onData  = () => { clearTimeout(timer); req.removeListener("close", onClose); ...send + finish... };

req.on("close", onClose);
timer = setTimeout(() => {
    session.removeListener("data", onData);
    req.removeListener("close", onClose);
    ...send + finish...
}, 10000);
session.once("data", onData);
```

`session.once("data", onData)` auto-removes after firing — good. The pairing is *mostly* correct: every exit path removes both the `data` and `close` listeners, and `session.removeAllListeners()` at `auth.ts:118` is the belt-and-suspenders on session eviction.

**Risk:** there is no `try/catch` around `res.send()` inside `onData`. If `safeJsonStringify(session.data)` throws (circular refs, BigInt, etc.), `onData` exits without clearing `session.pollingActive = true`. Future polls return `429` forever (`game.ts:27-30`). The session is stuck until TTL eviction.

**Impact:** one stuck session per crash. Not catastrophic on its own — at most ~50 sessions × ~40 KB session data = ~2 MB — but combined with finding 4 the throw also takes down the process.

**Proposed fix:** wrap `onData`'s body in `try/finally { finish(); }` and similarly the timeout callback. One line each:

```ts
const onData = () => {
    clearTimeout(timer);
    req.removeListener("close", onClose);
    try {
        if (res.writableEnded) return;
        const elapsedMs = ...;
        res.type("json").send(safeJsonStringify(session.data));
        session.data = [];
    } finally {
        finish();
    }
};
```

Same shape for the `setTimeout` callback.

---

### 8. `getSession("user_id", ...)` O(n) walk

**Severity:** Low

**Evidence:** `auth.ts:140-143`:
```ts
getSession: (key: string, value: any): Session | undefined => {
    if (key === "session_key") return sessions[value];
    return Object.values(sessions).find((session) => (session as any)[key] === value) as Session;
},
```

Call sites for the non-`session_key` variant:
- `queue.ts:26` — `calculateLevel`, called from `/services/vs/start/:session_key` (queue.ts:144). Per-queue-entry. Not per-poll, not per-turn.
- `app.ts:67` — debug-only `/debug/renown` route, only registered when `NODE_ENV !== "production"`.

**Hottest path:** queue start, fired once when a player clicks "Find Match". With ~50 concurrent sessions the walk is ~50 property lookups, sub-microsecond. **Not currently a problem.** Listed for the record because it would matter at 1000 sessions.

**Proposed fix:** if/when this matters, maintain a parallel `Map<number, Session>` indexed by `user_id` (and `account_id`), populated in `addSession` and torn down in `removeSession`. No fix needed today.

---

### 9. `battle.turns[]` grows unbounded per battle

**Severity:** Low (Medium when combined with finding 1)

**Evidence:** `Battle.ts:325-326, 370-371`:
```ts
if (!battle.turns[turn]) battle.turns[turn] = [];
battle.turns[turn].push(moveData);
```

The array is keyed by integer turn number (sparse), appended to on every `/move` and `/action`. The only read site is `/query/:session_key` at Battle.ts:285-289, which returns the full per-turn log for replay/resync.

**Per-battle bound:** a typical match in BSF is 5-15 turns. Each turn slot holds N actions, each action ~500 bytes serialized. Realistic bound: 5-15 turns × 6-10 actions × ~500 B = ~30-75 KB per battle. Not a problem in isolation.

**Trigger combined with finding 1:** orphaned battles retain their `turns[]`, including hash strings and tile arrays. At ~50 KB × 100 orphans = ~5 MB. Real cost vs. the rest of the orphan-battle footprint is small but worth noting.

**Proposed fix:** finding 1's removal-on-eviction handles this. No additional change needed unless replays grow significantly (then bound turn history at the last K turns).

---

## Non-findings

### Statement re-preparation in *hot* paths — refuted at the "hot" claim

The seeded lead suggested `prepare()` might fire per-turn or per-poll. Verified by reading `game.ts` (the long-poll handler) and all `/battle/*` routes: **no DB calls fire during polling or per-turn gameplay**. Battle state mutations (`/move`, `/action`, `/sync`, `/killed`) all live entirely in memory. The DB is touched only at login, account update, and endgame. So the prepare-per-call inefficiency is real but is downgraded from "Critical hot-path tax" to "Medium latent landmine" — see finding 6.

### `dequeuePlayer` listener-leak on disconnect — not actually broken

The seeded leads asked to check whether evicted sessions leave queue entries behind. `auth.ts:119` calls `dequeuePlayer(key)` inside the reaper, and `auth.ts:133` calls it again inside `addSession` when an existing user_id is found. Both paths cleanly splice the queue array. No leak here.

### `EventEmitter` listener leak on session — guarded by `removeAllListeners()`

The seeded leads asked whether `session.once("data", ...)` listeners survive eviction. `auth.ts:118` explicitly calls `session.removeAllListeners()` before deleting the session. Combined with the `removeListener` pairing in `game.ts:46-72`, the listener accounting is correct. The one remaining risk is a throw inside `onData` — covered as finding 7, not the seeded one.

### `setInterval` handles surviving past their owner — both call sites are `.unref()`'d or singletons

`auth.ts:103` is `.unref()`'d at line 123 — good, will not block process exit. `queue.ts:102-113` is *not* `.unref()`'d but is a module-level singleton that lives for the whole process. There is no per-battle or per-session interval that could leak. Not a finding.

### "`endgame()` fire-and-forget at Battle.ts:~418 leaves DB in half-state"

The seeded brief asked to verify the `.catch` cleans up. The DB side is fine — `Promise.all([addRenown, addRenown, saveBattleResult])` either all succeed or the `.catch` at line 589 runs the fallback. Renown is not double-applied (the `.then` at line 537 only touches `accountData` on success). The actual issue is not DB half-state — it's **registry half-state**: `endgame` never removes the battle from `battles{}`. That's finding 5, not the seeded shape.

### `getInitialData()` called on every poll — refuted

The brief was concerned about `getInitialData()` being expensive. Verified: it's called exactly once per session, in the `Session` constructor (`auth.ts:80`). `_firstJsonData` and `_accountsData` are cached at module load (`auth.ts:31, 38`). No per-poll cost.

---

## Recommended next steps

Ordered for blast-radius reduction × implementation cost on a 1 GB box:

1. **[Critical] Cascade battle cleanup into the session TTL reaper.** Touch `bsf-server/src/services/auth/auth.ts` (lines 103-122) and import `battleHandler` from `services/battle/Battle.ts`. See findings 1, 2.
2. **[High] Add `process.on('unhandledRejection')` and `('uncaughtException')` log-only handlers.** Touch `bsf-server/src/index.ts`. See finding 4.
3. **[High] Sweep the battle registry on endgame completion (`.finally(() => removeBattle)` with a 30 s grace).** Touch `bsf-server/src/services/battle/Battle.ts` around lines 418 and 451. See finding 5.
4. **[High] Add a per-turn server-side timeout that triggers `endgame()` with the opposing player as winner.** Touch `bsf-server/src/services/battle/Battle.ts` — new field on `Battle`, refresh hooks in `/move`, `/action`, `/sync` handlers. See finding 3.
5. **[Medium] Wrap the `onData` and timeout bodies in `game.ts` with `try/finally { finish(); }` so a serialization throw can't strand `pollingActive`.** Touch `bsf-server/src/services/game.ts` lines 54-78. See finding 7.
6. **[Medium] Add a module-level statement cache in `connection.ts`.** Touch `bsf-server/src/db/connection.ts` lines 63-79. See finding 6.
7. **[Low] Index `sessions` by `user_id` and `account_id` if/when concurrent player count exceeds ~100.** Touch `bsf-server/src/services/auth/auth.ts`. See finding 8.
8. **[Low] Bound `battle.turns[]` to the last K turns (only the `/query` resync handler reads from it; old turns are dead weight).** Touch `bsf-server/src/services/battle/Battle.ts`. See finding 9. *Skip unless replay scope expands.*

Items 1-4 together address the directly-reported "match freezes and load failures" symptoms. Items 5-6 are insurance. Items 7-8 are scale prep.
