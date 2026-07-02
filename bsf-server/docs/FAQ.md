# FAQ & Troubleshooting

The single place to land when something isn't working or you hit a "why does it do *that*?" moment. Each entry is **problem → root cause → fix**, grouped by area.

**How this file relates to the others (so nothing drifts):**

- **This file owns the human-facing, operational gotchas** in full (everything above the *Deep traps* index).
- **Deep protocol / security / persistence traps** — the ones that cause real bugs when editing `src/` — live in full in [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md), which auto-loads for anyone editing the server. This file *indexes* them at the bottom rather than copying them, so there is only ever one copy to maintain.
- **Symptom-specific troubleshooting** with long diagnostics (the "News of the Banner" popup, the tutorial-every-session registry errors) stays in [`Development.md`](Development.md#common-issues--fixes); this file links to it.

> **Maintenance rule — put each fact in exactly one place.** A new deep code/protocol trap → add it to [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) **and** add a one-line title under [Deep traps](#deep-protocol--correctness-traps) here. A new human/operational gotcha → add it here. Never copy prose between the two.

---

## Build & dev loop

**My code change isn't taking effect.**
`yarn dev` hot-reloads, but `start-server.bat` and `node build/index.js` run the compiled `build/` output. If you're testing with those, run `yarn build` first — a stale compiled build is the single most common "my change isn't working" cause.

**When to use `start-server.bat` vs `yarn dev`.**
`yarn dev` (ts-node-dev) is for active development with auto-restart. `start-server.bat` compiles fresh, kills any running node process, and starts clean — use it for functional/manual testing so you're never running a stale build.

## Data files & caching

**Editing a file under `data/` does nothing until I restart.**
`first.json` (and the other static `data/*.json` files) are read **once at module load** and cached for the process lifetime, so any edit needs a full server restart — `yarn dev`'s hot-reload is not enough. Use `start-server.bat` after changing static data.

## Sessions & auth

**A game route returns `501`.**
That's the login check doing its job, not a broken login. After a Discord login the server hands the client a signed login token; the client must trade that token for a **session key** at `POST /login/discord/session` before it calls game routes. A `501` means a still-unexchanged token reached a game route. See [`error-handling.md`](error-handling.md).

## Matchmaking

**Two players queue but never match ("power N vs M").**
Usually the two accounts have different total power — the sum of `(RANK − 1)` across their party units — not a rank/Elo problem. Both sides must fall inside the power window (near-equal on entry, widening with wait time). Check the console for `[MATCHMAKING]` / `[QUEUE]` lines; a short `party_ids_json` or an unresolved unit id is the usual culprit. See the queue runbook in [`observability.md`](observability.md).

## Persistence (DB)

**Reading account/party/roster back from the DB mid-session gives stale data.**
`session.accountData` is the **in-memory source of truth** for the session lifetime. Writes (`saveParty()`, `saveRoster()`) sync to SQLite in the background, but always read and update `session.accountData` in memory — don't re-query the DB to refresh it. (See the scoped rule in [`../.claude/rules/db.md`](../.claude/rules/db.md).)

**`daily_login_streak` never changes.**
The server does **not** auto-update `daily_login_streak` — it's a schema column with no incrementer yet. Don't build logic assuming it moves on login.

**`accounts.json` doesn't reflect real accounts.**
`data/accounts.json` is only a username *fallback* for unknown `user_id`s. All real account data lives in **SQLite** (the `accounts` table) — not in that JSON file.

## Client registry & assets

**A unit renders blank in battle.**
Its `EntityDef` in `data/acc.json` is missing a `name` property — the client silently renders a blank unit when `name` is absent. Every def needs a `name`.

**The tutorial fires on every login even though the DB says it's complete.**
A unit whose `entityClass` — or an ability it references — is absent from the client's registries (`character_classes.json.z` / `_ability_index.json.z`) makes the client's account-info build throw and silently fall back to `completed_tutorial = false`. Applies to units in `acc.json` **and** in the player's saved roster. Full diagnostics (the exact client-log lines) are in [`Development.md` → Common Issues & Fixes](Development.md#common-issues--fixes).

**"News of the Banner" popup appears every session.**
It's purely client-side — the server can neither trigger nor suppress it. Full explanation and the `fix-news-popup.ps1` steps are in [`Development.md` → Common Issues & Fixes](Development.md#common-issues--fixes) (and issue #28).

## Local testing

**A local 2-client battle hangs at the "loading" screen.**
On one PC, FMOD's audio extension only initializes for the *first* client; the second falls silent and takes a different load path that never fires `battle/ready`. Every 2-player local launch must include `--versus_start --versus_countdown 0`. Details in [`Development.md` → Two-Player Local Test](Development.md#two-player-local-test-same-machine) and [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

## Dependencies

**`async-mqtt` is in `dependencies` but nothing imports it.**
Left over from an early prototype. Don't add MQTT usage without discussing it in an issue first.

---

## Deep protocol & correctness traps

These cause real bugs when editing `src/`, so they live **in full** in [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) (auto-loaded for server work). Indexed here so you know they exist — read them there, don't copy them here:

- **Session key `"11"`** is the hardcoded login bypass.
- **Express strips the `/services` prefix** inside routers — match on `/session/...`, not `/services/session/...`.
- **`roster_rows` is a grid-row count**, not a unit count — only `expandBarracks()` / `upsertAccount()` may write it.
- **32-bit `account_id` vs 64-bit `user_id`** — using the wrong one diverges the DJB battle hash at turn 0.
- **Session keys are 32 hex chars (128-bit)** since #53 — don't hardcode the old 16-char width.
- **The session reaper frees the opponent before renown is saved.**
- **`party_ids_json` drives turn order** — build party defs with `buildOrderedPartyDefs`, never `roster.filter(...)`.
- **Stat-purchase deltas can be > 1 and negative** — validate the *resulting* value, not the sign.
- **Local 2-client tests need `--versus_start --versus_countdown 0`** (FMOD single-init).
- **`/killed` counts a death only after *both* clients report it** — the winner is server-derived, never `killerparty`.
- **Crediting a unit's KILLS stat additionally requires both clients to name the same killer.**

See also: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`security.md`](security.md) · [`error-handling.md`](error-handling.md) · [`observability.md`](observability.md).
