# Observability & Runbooks

How to read what the server prints to its logs, and what to do about the three
problems it's known to run into. There are no dashboards or automatic alerts
yet, so the logs are your main tool (see [Metrics & alerts](#metrics--alerts-future) for what's planned).

The server prints its logs as plain text to the console. Almost every line
begins with a name in square brackets — a **channel** like `[BATTLE]`, `[QUEUE]`,
or `[GAME-POLL]` — telling you which part of the server wrote it. On the live
server (Google Cloud) the operating system collects these lines; when you run
locally they appear in the `start-server.bat` / `yarn dev` console. To focus on
one part of the server, search the log for its channel name (e.g. search for
`[QUEUE]`).

## Log channels

| Prefix | Emitted by | Example line | What it tells you |
|---|---|---|---|
| `[BOOT]` | `src/index.ts` | `[BOOT] NODE_ENV=production trust_proxy=1` | Process started; which environment, and whether it believes the address a proxy of ours forwards (#284). The `1` is Express's count of proxies in front, not the value of the setting, and it proves the setting rather than the result: it says nothing about whether a proxy is really there. `false` means the server counts whoever connected, which behind a proxy is the proxy — so every player shares one cap. **No `[BOOT]` line at all** means the process never started: it refuses to when the signing key is missing or the proxy setting is unrecognised, and that refusal happens before this line is printed. |
| `[FATAL]` | `src/index.ts` | `[FATAL] unhandledRejection: …` | A promise rejection / uncaught throw was swallowed so the process *doesn't* exit. The **process** survived; whatever was waiting did not necessarily get an answer. Since #176 a failing request handler produces `[UNCAUGHT]` and a reply instead, so a bare `[FATAL]` now means something that was not a request. Should be rare — investigate every one. |
| `[UNCAUGHT]` | `src/app.ts` | `[UNCAUGHT] POST /services/roster/unit/hire/… - name (account_id=…) - <message>` | A request handler failed and the catch-all answered for it, so the player got a refusal rather than silence. Carries the stack on the next line. Investigate every one. |
| `[AUTH]` | `src/services/auth/auth.ts` | `[AUTH] Steam ID precision loss: received "…" stored as …` | Login/auth issues: static-data load failures, Steam-ID precision warnings. |
| `[LOGIN]` | `src/services/auth/auth.ts` | `[LOGIN] DB error during upsertAccount: …` | The account upsert on login failed. |
| `[SESSION]` | `src/services/auth/auth.ts` | `[SESSION] Evicted stale session user_id=… mid-battle; surrendered to user_id=…` | The background job that drops sessions left idle for 30 minutes (the *session reaper*) removed one. The `mid-battle` variant is the orphan-battle safeguard firing. |
| `[DISCORD]` | `src/services/auth/discord.ts` | `[DISCORD] OAuth callback error: …` | Discord OAuth login path (missing secret, malformed id, callback errors). |
| `[ACCOUNT]` | `src/services/account.ts` | `[ACCOUNT] DB error during update: …` | A `/account/update` or tutorial-complete write failed. |
| `[ACCOUNT_INFO]` | `src/services/account.ts` | `[ACCOUNT_INFO] account=… roster_size=… ranks=[…]` | A client fetched `/account/info`; shows roster size and per-unit ranks. |
| `[ROSTER]` | `src/services/roster.ts` | `[ROSTER] DB error during unit/promote: …` | A roster mutation (arrange/promote/rename/retire/hire/stats/unlock/variation) hit a DB error. |
| `[LOBBY]` | `src/services/lobby.ts` | `[LOBBY] invite dropped — lobby … already has invitee …` | A lobby invite was rejected (the one-invitee-per-lobby cap). |
| `[MATCHMAKING]` | `src/services/queue.ts` | `[MATCHMAKING] Creating battle between … (power=…, elo=…) and …` | A pair was matched and a battle is being created. |
| `[QUEUE]` | `src/services/queue.ts` | `[QUEUE] account=… vs_type=… power=… breakdown=[…]` | Queue entry/exit: enqueue (with power breakdown), 5-min timeouts, Elo-snapshot failures. |
| `[BATTLE]` | `src/services/battle/Battle.ts` | `[BATTLE] endgame: winner=… (… kills) loser=… (… kills)` | Battle lifecycle: create, unit-select, turn-deadline surrender, kill reports, endgame, DB writes. |
| `[BATTLE-DEPLOY]` | `src/services/battle/Battle.ts` | `[BATTLE-DEPLOY] … deployed … tiles → opponent` | A deploy message was relayed to the opponent. |
| `[BATTLE-SYNC]` | `src/services/battle/Battle.ts` | `[BATTLE-SYNC] … turn=… hash=… entity=…` | A turn-sync message carrying each client's state fingerprint — a short value both sides compute identically to confirm they still agree (the *DJB hash*). |
| `[BATTLE-ACTION]` | `src/services/battle/Battle.ts` | `[BATTLE-ACTION] MOVE: … → opponent (pushing to queue)` | A move/action was relayed to the opponent. |
| `[GAME]` | `src/services/game.ts` | `[GAME] leaderboards build failed; serving static fallback: …` | The DB-driven leaderboard build failed and fell back to `data/lboard.json`. |
| `[GAME-POLL]` | `src/services/game.ts` | `[GAME-POLL] START: … begins polling (will wait up to 5s)` | The long-poll lifecycle: start, immediate flush, data-arrived, 429 (a prior poll still held), errors. |
| `[GAME-KEEP-ALIVE]` | `src/services/game.ts` | `[GAME-KEEP-ALIVE] … refreshed after …ms` | A long-poll returned empty after the 5 s hold; the client will re-poll. |
| `[STATS]` | `src/services/activityStats.ts` | `[STATS] 2026-09-16 13:00 UTC sign_ins=12 daily_players=9 new=2 returning=1 find_match=14 challenges=4 find_match_matched=10 challenges_matched=4 timeouts=3 peak_online=6` | Shortly after a UTC hour ends, that hour's player numbers; an hour around a restart can be missing — see [Player numbers](#player-numbers). A `[STATS] could not count …` line means one statistic failed to save; the sign-in or search it belongs to still went through. |
| `[DB]` | `src/db/…` | `[DB] applied migration 001_ranking_and_battle.sql` | Migrations applied at startup; WAL-mode warnings. |
| `[LEADERBOARD]` | `src/db/leaderboard.ts` | `[LEADERBOARD] Failed to load data/lboard.json baseline: …` | The historical leaderboard baseline file failed to load. |
| `[DEBUG]` | `src/app.ts` | `[DEBUG] party limit set to 1` | A dev-only `/debug/*` route was used. Never appears in production (`NODE_ENV` gate). |

> **Keep this table honest.** If you add or rename a log prefix, update the row here. To list every prefix actually in the tree:
> `grep -rhoE "\[[A-Z][A-Z0-9_-]+\]" src | sort -u`

## What to do when something breaks

### Orphan battles — finished or abandoned battles that never get cleaned up

**Symptom.** The classic report is "matches freeze / fail to load," usually after the server has been up a while — the surviving player's screen hangs on the battle view, and the server's memory use keeps climbing and never drops until it runs out of memory and restarts (the machine is small: a 1 GB Google Cloud `e2-micro`).

**Grep.** `[SESSION]` (evictions) and `[BATTLE]` (endgame + turn-deadline).

**Root cause.** A `Battle` used to be freed only when *both* clients sent `/exit`. If one client vanished (alt-F4, network drop) it was never removed — see the [2026-05-11 perf audit](audits/2026-05-11-perf-audit.md), findings #1/#2/#5.

**Current mitigations (shipped — verify they're firing).**
- The session reaper now treats an in-battle eviction as a **surrender**: look for `[SESSION] Evicted stale session user_id=… mid-battle; surrendered to user_id=…`. The survivor is told and the battle is freed.
- A **per-turn deadline** surrenders a stalled player: `[BATTLE] turn deadline expired after Ns: … surrenders, … wins`. The deadline is that player's own chosen turn length plus 60 seconds, so `N` varies by battle.
- A player who asked for **no** clock is never surrendered — they are looked in on every ten minutes instead, and the battle is only swept once their session has gone: `[BATTLE] no-clock check: … is still here, leaving battle … alone`. Seeing this line repeat for one battle is normal; seeing it repeat for hours means somebody is sitting in a match they never finished.
- Thirty seconds after any battle finalizes it's **force-removed** whether or not clients sent `/exit`.

**Healthy end-of-battle sequence.** `[BATTLE] endgame: winner=…` → `[BATTLE] endgame: DB writes complete for battle …`, and the battle leaves the registry within 30 s. If you see endgame start but never "DB writes complete," a DB write is failing (check `[BATTLE] endgame DB persistence failed`).

### Stuck matchmaking queue

**Symptom.** Two players click Find Match and never get paired, or one sits in the queue indefinitely.

**Grep.** `[QUEUE]` (enqueue + timeout) and `[MATCHMAKING]` (pairing).

**Root cause — usually power, not a bug.** On enqueue the server logs `[QUEUE] account=… power=N breakdown=[…]`. Matching requires both sides to fall inside a window that starts near-equal on power and widens with wait time; RANKED/TOURNEY also gate on Elo. If the two `power` values differ and never converge inside the window, no match is made. A short `party_ids_json` or an unresolved unit id (which understates `power`) is the most common real cause — see [`FAQ.md` → Matchmaking](FAQ.md#matchmaking) for the full explanation, and `bsf-client/docs/data-model.md` §5 "Your account and roster" ([local](../../bsf-client/docs/data-model.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/data-model.md)) for how the client models the same roster.

**What to check.**
1. Compare the two `[QUEUE] … power=…` lines — are the players actually the same power?
2. A 5-second pump re-tries matches; after 5 minutes an entry is dropped with `[QUEUE] Timed out player … after 5 min`. Seeing that means the window never overlapped.
3. `[QUEUE] Elo snapshot failed …` means a ranking read failed and the entry fell back to a default Elo — usually benign.

Matchmaking math lives in [`ARCHITECTURE.md`](ARCHITECTURE.md) (see *Queue Service*).

### A player stops getting updates (the held-open request gets stuck)

The client keeps one request open at a time and the server holds it — up to 5 seconds — until it has something to send; this held-open request is the **long-poll**.

**Symptom.** A client stops getting battle/lobby updates; its `/services/game` polls come back as `429` repeatedly.

**Grep.** `[GAME-POLL]` and `[GAME-KEEP-ALIVE]`.

**Healthy cycle.** `[GAME-POLL] START: … (will wait up to 5s)` → either `[GAME-POLL] ⚡ DATA ARRIVED …` (something was pushed) or `[GAME-KEEP-ALIVE] … refreshed after …ms` (the 5 s hold elapsed with nothing to send, client re-polls). One poll is in flight per session at a time.

**Root cause.** A poll sets a busy flag (`pollingActive`) while it holds the connection open; the next poll that arrives before the first finishes gets `[GAME-POLL] 429 for …: prior poll held …ms`. An occasional 429 is normal (a client double-polled). **Repeated** 429s for the same session mean that busy flag never got cleared — historically an error while packaging the outgoing data (a *serialization* failure) could leave it stuck on (perf audit finding #7, since wrapped in `try/finally`). If you see a session wedged on 429, it clears on the next push to that session, or when the session is evicted (30-min idle timeout).

**What to check.** Confirm the session is still alive (`[SESSION]` hasn't evicted it) and that something is actually being pushed to it (a matching `[BATTLE]`/`[MATCHMAKING]` event). No pushes + steady keep-alives = simply nothing to send, not a deadlock.

## Player numbers

The server counts what players do, so we can tell whether anything we try brings them back (#267). It keeps **one row of totals per hour, in UTC**, in the database table `activity_hourly`. That table is the record: the database carries over from one deploy to the next and is in the nightly backup. The hourly `[STATS]` line is a convenience copy. Only totals are stored, never who.

**To see the last week**, run the database inspection script. The numbers are the last part of what it prints.

On the live server (its bash shell, in the folder holding `docker-compose.yml`):

```bash
docker compose cp deploy/inspect-db.mjs app:/tmp/
docker compose exec -T app node /tmp/inspect-db.mjs
```

On your own PC (PowerShell or bash, in the `bsf-server` folder):

```
node deploy/inspect-db.mjs data/bsf.db
```

It covers the last 7 days the file holds — counted back from its newest hour, so an old backup shows its own final week — and ends with the five hours of the day with the highest average peak online.

| Number | What it counts |
|---|---|
| `hours` | Hours of that day the server recorded, which is roughly how long it was running. |
| `sign_ins` | Every successful sign-in, including a second one the same day. |
| `players` | Different people who signed in that UTC day. **The one to watch for "how many people played".** |
| `new_players` | Accounts signing in for the first time. |
| `returning_players` | Players whose previous sign-in was 14 or more days earlier. |
| `peak_online` | The most players online at once, checked once a minute. |
| `find_match` / `challenges` | Searches accepted into the queue: ones that named no opponent, and challenges that named one. |
| `matched` / `challenges_matched` | Of those, the searches that became a battle. |
| `timeouts` | Searches dropped after about five minutes with nobody found. |

**Before drawing conclusions:**

- **Days and hours are UTC**, not local time. A player counts toward the day they signed in, even if they play on past midnight.
- **Sign-ins jump after every deploy or restart.** A restart ends every session, so everyone still playing has to sign in again. `players` barely moves, because a second sign-in the same UTC day is not counted twice.
- **Nobody counts as returning for 13 days after this was first deployed.** Accounts that already existed were dated 24 hours before the deploy, and every account created since has a newer sign-in than that, so no 14-day gap can end sooner. That is deliberate: it never claims a comeback that did not happen.
- **A friend match counts twice**, once for each player, in both searches and matches — so `matched` divided by `find_match`, and `challenges_matched` divided by `challenges`, are true rates.
- **Compare whole days, not single hours.** A search started at 13:59 and matched at 14:01 is started in one hour and matched in the next, so one hour can show more matches than searches.
- **These are searches, not people.** Cancelling and searching again is two searches.
- **Searches minus matches minus timeouts** is everything else: searches cancelled, abandoned by signing out or signing in again, lost when the server restarted, or still waiting.

### Why "online" is not "signed in"

A player counts as online only while their own game keeps asking the server for messages: its last request (`lastPollAt`) must be no more than a minute old. The session's "last activity" time cannot answer that, because messages the server **sends** refresh it too — including the Find Match queue updates it sends to every player not in a battle. A game that has crashed can therefore keep a fresh "last activity" for as long as other people keep searching, and its session can stay in memory for 30 minutes or more (#246, #224). Counted from the game's own requests, a crashed game stops counting as online a minute after its last request. **The session clean-up still uses "last activity", deliberately unchanged** — changing that is for #246 and #224 to decide.

**Measured once, on 2026-09-17 UTC** (the shipped game, two players in one window, against a local server). The longest time between one game's requests was **24.5 seconds, on the battle loading screen**, and a minimised window kept asking every 6 seconds or so — so the one-minute window has room to spare, while a 20-second one could count players as offline while a battle loads. The same run ended the game process two minutes before the hour was up: the finished hour's `[STATS]` line showed both players, and the next hour's `peak_online` was **0**, although neither session had been cleared. Turns were not measured, because the battle stuck at its opening screen (the sound-library hang tracked in Banner-Saga-Factions/BSF-Client#7).

*Technical:* table `activity_hourly` and column `accounts.last_sign_in_at` (migration `005`); SQL in `src/db/activity.ts`; the recorders, the hourly `[STATS]` line and the once-a-minute sampler in `src/services/activityStats.ts` (started from `src/index.ts`); `Session.lastPollAt`, `ONLINE_WINDOW_MS` and `countOnlinePlayers` in `src/services/auth/auth.ts`, refreshed only in `src/services/game.ts`; reader `deploy/inspect-db.mjs`.

## Metrics & alerts (future)

Not built yet, apart from the hourly [Player numbers](#player-numbers) above, which nothing alerts on. When added, this section should cover request-rate / error-rate / event-loop-lag metrics, heap-usage alerting (the orphan-battle leak above is a memory-growth signal), and queue-depth / active-battle gauges. Two pending features will feed it:

- **#30 (battle event log)** — a structured JSONL event stream that a metrics sink can tail.
- **M5 (system messages + admin)** — an admin surface whose operations should be logged/audited here.

Until then, memory pressure is the signal that matters most on the 1 GB box; the [perf audit](audits/2026-05-11-perf-audit.md) is the reference for what leaks and why.

---

See also: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`error-handling.md`](error-handling.md) · [`FAQ.md`](FAQ.md) · [the changelog archive](changelog-archive/CHANGELOG-2026-H1.md) (the May 2026 entries, released as 0.5.0).
