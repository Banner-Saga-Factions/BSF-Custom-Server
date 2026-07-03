# Review: Plan-Enable-Mobile-Windows-Crossplay.md

## Context

This is a review of `misc/Plan-Enable-Mobile-Windows-Crossplay.md` — surfacing gaps, issues, and improvements. Every load-bearing claim in the plan was verified against the shipped code rather than taken at face value.

**Headline:** the plan's *goal* is sound (auth is the only real crossplay barrier; matchmaking/battle are already platform-agnostic), but the plan is **stale and dialect-wrong**. It was written against the original 2013 **MySQL/Java** server and an older snapshot of `discord.ts`. As written it would not run, would re-introduce a security regression, and — critically — **does not touch the one guard that actually blocks Discord login today.**

Files inspected: `src/services/auth/discord.ts`, `src/services/auth/auth.ts`, `src/db/account.ts`, `src/db/connection.ts`, `src/db/schema.sql`, `src/db/migrations/001_ranking_and_battle.sql`, `src/app.ts`, `.claude/rules/db.md`, and the companion `misc/Findings-Client-ActionScript-Crossplay.md`.

---

## Verdict at a glance

| # | Severity | Finding |
|---|----------|---------|
| F1 | 🔴 Blocker | **Step 4 (CSRF) is already built, tested, and shipped.** Implementing it again is dead work and the plan's version is a *regression*. |
| F2 | 🔴 Blocker | **Steps 1–2 are MySQL in a SQLite database.** `INT UNSIGNED`, `ADD UNIQUE KEY`, `CAST(... AS UNSIGNED)`, `ON DUPLICATE KEY UPDATE` are all invalid here. |
| F3 | 🔴 Blocker | **Step 1 edits the wrong file.** `schema.sql` is documentation-only; the live schema is inline in `connection.ts` + migrations. |
| F4 | 🔴 Blocker | **The actual blocker is never addressed.** A hard *rejection* guard (M-6) refuses every real Discord ID; the plan never removes it, so all the new `game_id` code is unreachable. |
| F5 | 🟠 Major | **Missing plumbing.** `Session`/`addSession` are `number`-typed and truncate the ID before `game_id` is ever computed; the exact snowflake (already in the JWT) is never threaded through. |
| F6 | 🟠 Major | **`ACCOUNT_COLUMNS` and the Discord `/session` response are not updated** — `game_id` would read back as `NaN` and the client would still receive the wrong `user_id`. |
| F7 | 🟡 Design | **32-bit *signed*, not unsigned.** Verification bound (`≤ 2^32`) is wrong; the client stores `userId:int`. Plus Steam/Discord `game_id` spaces overlap, so "increment until unique" is under-specified. |
| F8 | 🟡 Improve | **Line numbers are stale throughout** and point at unrelated security code; client section ignores the lighter path the repo already documents. |

---

## Detailed findings

### 🔴 F1 — Step 4 (OAuth CSRF `state`) is already implemented, tested, and shipped

The plan calls this "`TODO HIGH-1`… must be fixed before any mobile client can connect." It is **done**:
- `discord.ts:27-51` — `pendingStates` map + TTL sweep + `getDiscordOAuthURL()` returning `{ url, state }`.
- `discord.ts:93-100` — `GET /` sets the `bsf_oauth_state` HttpOnly `SameSite=Lax` cookie.
- `discord.ts:102-117` — `/oauth-callback` validates `queryState === cookieState` **and** the `pendingStates` TTL, one-shot delete. Labeled "Issue #54."
- `discord.test.ts:142-178` — a dedicated "state validation" test block (missing/wrong/expired state).
- `bsf-server/CLAUDE.md` already documents it: *"Discord OAuth uses a one-shot CSRF state stored in the `bsf_oauth_state` HttpOnly cookie (5-min TTL)."*

**Impact:** wasted effort, and the plan's snippet is *weaker* than what ships — it checks only `pendingStates` expiry and **drops the cookie↔query match**, so copying it in would remove a real CSRF control. **Action: delete Step 4 entirely.** Note the companion `Findings-Client` doc (summary item 4) is stale on this point too — both predate Issue #54.

### 🔴 F2 — Steps 1–2 are written in MySQL; the server is SQLite

`connection.ts:1` uses `node:sqlite` (`DatabaseSync`). The repo's own `.claude/rules/db.md` warns verbatim against exactly this: *"SQLite syntax, **not** MySQL — the original Java server's `INT UNSIGNED`, `ALTER TABLE ADD UNIQUE KEY`, etc. won't work."* The plan uses every one of those:
- `game_id INT UNSIGNED` → SQLite has no `UNSIGNED`; use `INTEGER`.
- `ALTER TABLE accounts ADD UNIQUE KEY idx_game_id (game_id)` → invalid; use `CREATE UNIQUE INDEX`.
- `CAST(... AS UNSIGNED)` → invalid; SQLite is `CAST(... AS INTEGER)`.
- Step 2's `ON DUPLICATE KEY UPDATE` → the real code is `ON CONFLICT(user_id) DO UPDATE` (`account.ts:62`).

**Impact:** the migration would throw on startup and abort boot (the migration runner aborts on any failure).

### 🔴 F3 — Step 1 edits a documentation-only file

`schema.sql:2` says it outright: *"Documentation only: schema is initialized automatically by `src/db/connection.ts`."* The live base DDL is inline at `connection.ts:36-61`, and `connection.ts:27-35` carries an explicit **schema-drift warning**: a real change must land in **both** a migration (for existing installs) **and** the inline DDL (for fresh installs). The plan touches neither correctly.

### 🔴 F4 — The real blocker (the M-6 rejection) is never removed

This is the most important finding. The plan frames the overflow as "we'll send a wrong number." The code does **not** send a wrong number — it **rejects the login**:
- `discord.ts:133-140` (oauth-callback): `parseInt(discord_user.id)`; if it doesn't round-trip → `console.error(... "login rejected")` and redirect with `error=unsupported_account_id`.
- `discord.ts:163-166` (`/session`): same `parseInt` + precision-loss rejection.

Every real Discord snowflake is 17–19 digits and exceeds `MAX_SAFE_INTEGER` (≈9.0×10¹⁵, 16 digits), so **this guard rejects 100% of real Discord users today.** Discord login is currently a safe-but-inert stub. The plan adds `game_id` math but **never says to remove or replace these two guards**, so the new code is unreachable — every login still bails at M-6.

It also misdescribes them: Step 3 says "remove the now-redundant precision-loss `console.warn` calls (lines 97–99, 124–126)." Those lines are the **CSRF cookie-setter** and the **Discord-error allowlist** — both security features. The actual precision handling is a `console.error` + `return redirect` rejection at 133-140/163-166. **Following the plan literally deletes two security controls and leaves the real blocker in place.**

### 🟠 F5 — Missing plumbing: the exact ID is truncated before `game_id` can be computed

`Session` is `number`-typed end to end and the constructor derives `account_id` by integer subtraction:
- `auth.ts:170` `addSession(user_id: number)`, `auth.ts:78-83` `constructor(user_id: number)` → `account_id = user_id >= STEAM_ID_BASE ? user_id - STEAM_ID_BASE : user_id`.
- `discord.ts:171` calls `addSession(discord_id)` with the **already-truncated** `parseInt` value; `discord.ts:175` looks up the account with `getAccountByUserId(discord_id)` → `String(discord_id)` is the *truncated* string.

The exact snowflake **does** survive in the JWT (`discord.ts:142` signs `{ discord_id: discord_user.id }` as the string), but nothing downstream uses it. So even with Step 3's `session.account_id = session.accountData.game_id`, `accountData` was fetched against a truncated key — wrong/missing row.

**Security angle:** two distinct snowflakes can `parseInt` to the same double → the same truncated `String(...)` → the **same account row** (account mixing/takeover). The M-6 guard is the only thing preventing this today. So when M-6 is removed, the lookup/upsert path **must** switch to the exact string. Correct fix: thread `discord_user.id` (string) through `upsertAccount`/`getAccountByUserId` (both already accept `string | number` and store `user_id` as TEXT — `account.ts:49,58`, `connection.ts:38`), and derive the 32-bit id with `BigInt`. The plan addresses none of this.

### 🟠 F6 — Two reads/writes the plan forgets, each fatal on its own

1. **`ACCOUNT_COLUMNS` is an explicit SELECT list** (`account.ts:34-35`). If `game_id` isn't added there, `getAccountByUserId` never returns it → `Number(raw.game_id)` is `NaN` → `session.account_id = NaN`. Step 2 only mentions `parseRow`, not the column list.
2. **The Discord `/session` response returns the raw `user_id`.** `discord.ts:177` does `res.json(session.asJson())`, and `asJson()` returns `user_id: this.user_id` (`auth.ts:88-96`). The Steam route overrides it (`auth.ts:235`: `{ ...session.asJson(), user_id: session.account_id }`); the Discord route does **not**. So even after everything else, the client receives the wrong/overflowing `user_id`, and the plan's own Verification step 4 would fail. Fix: override identically in `/session`.

### 🟡 F7 — Signedness and the collision space

- **Signed, not unsigned.** `Findings-Client` Item 3 quotes `Credentials.as:28` → `userId:int` (signed 32-bit). Safe range is `0 … 2,147,483,647` (2³¹−1), **not** the plan's `4,294,967,295` (2³²−1). Values above 2³¹−1 wrap negative in the client. The Discord mask `& 0x3FFFFFFFn` (30-bit, max ≈1.07B) is deliberately under that ceiling — good — but **Steam's** `account_id = steam − BASE` can approach/exceed 2³¹ as Steam's account-number space grows (pre-existing latent risk, worth a note). Verification should assert `≤ 2_147_483_647`.
- **Overlapping spaces.** Steam `game_id`s occupy up to 32 bits; Discord masks into 30 bits — they overlap, so a Discord mask can collide with an existing **Steam** row, not just another Discord row. The plan's "increment until unique" is described only on the Discord path and never spelled out (a SELECT-probe loop? catch the `UNIQUE` violation and retry?). Needs a concrete, race-safe mechanism if persistence is kept.
- **Design fork the plan never weighs.** For Steam, `game_id == account_id` already (`auth.ts:83`), so the column adds nothing there. The column only earns its keep if you actually *resolve* collisions (a resolved value is no longer a pure function of the provider id, so it must be stored). Two coherent designs:
  - **(A) Compute deterministically, no column** — Steam keeps `steam − BASE`; Discord uses `Number(BigInt(id) & 0x3FFFFFFFn)`. Zero migration, zero column plumbing; accepts a tiny, unresolved collision probability. **Recommended for a PoC.**
  - **(B) Persist `game_id` + `UNIQUE` index + increment-on-collision** — robust and stable across logins; only worth it if you commit to real collision handling.
- **Migration backfill caveat.** `user_id` is a **TEXT** primary key (`connection.ts:38`). A `WHERE user_id >= 76561197960265728` triggers SQLite text-affinity *string* comparison, not numeric — fragile. Backfill in app code (on next login via `upsertAccount`) or use explicit length/`CAST` logic; don't port the MySQL `WHERE`.

### 🟡 F8 — Stale line numbers and a heavier-than-necessary client section

- **Every line reference is stale.** Step 3's "auth.ts line ~148" is inside `reapStaleSessions`; the real upsert is `auth.ts:230/235`. "discord.ts line ~135" is the M-6 comment, not a session override. An implementer must ignore the plan's line numbers.
- **Client section overstates the work** (per `Findings-Client-ActionScript-Crossplay.md`, which is more accurate):
  - *"Source access is a blocker"* — the decompile **already exists** (`bsf-refs/client-decompiled-as3`, 1,267 classes, no obfuscation). Not a blocker.
  - *"Hex-edit the server URL"* — there is a built-in `--server` launch override (`GameMainAir.as:381-384`). **Desktop needs no SWF edit.** Mobile can't take launch args, so the URL goes in the **AIR app descriptor / build config** — still not a hex-edit.
  - *"Build a new login screen + Steam→Discord replacement"* — a pre-existing `overrideSteamId` bypass (`PreAuthState.as:31-34`) lets you inject the Discord token into `credentials.steamAuthTicket`; `NullSteamworks` already exists to subclass. Far smaller than "new login screen."
  - **Keep** the plan's correct points: HTTPS is mandatory (iOS ATS / Android network security), HARMAN AIR for modern OS targets, and store/distribution realities.

---

## Corrected execution plan (server)

> Per CLAUDE.md working style, each step below should be presented to the user with What / Why / Tradeoff and an explicit **y** approval before any file is edited.

**Decision to confirm first:** design **(A) deterministic, no column** vs **(B) persisted `game_id` column**. The steps below assume **(A)** as the recommended PoC path and note the **(B)** delta. (A) makes the schema steps disappear entirely.

**Step 1 — Remove the M-6 rejection and thread the exact Discord ID string** *(the actual blocker — F4/F5)*
- `discord.ts` oauth-callback: drop the `parseInt`/precision-loss rejection (~133-140); call `upsertAccount(discord_user.id, discord_user.username)` with the **string**.
- `discord.ts` `/session`: drop the `parseInt`/precision-loss rejection (~163-166); use `decoded.discord_id` (string) for `getAccountByUserId(...)`. Keep a cheap `^\d{1,20}$` shape check instead of numeric parsing.
- Let the session carry the exact provider id. Minimal change: compute the 32-bit id from the string and set `session.account_id` from it (mirrors `steam_id_str`). Avoid passing a snowflake into the `number`-typed `addSession`/constructor as an exact number.

**Step 2 — Derive the 32-bit in-game id** *(F7)*
- Steam (already correct): `account_id = steam − STEAM_ID_BASE`.
- Discord: `Number(BigInt(discord_id_str) & 0x3FFFFFFFn)` (30-bit, positive, ≤ 2³¹−1).
- Single helper, e.g. `deriveGameId(providerIdStr)`, reused by both paths.

**Step 3 — Fix the Discord `/session` response** *(F6.2)*
- `discord.ts:177` → `res.json({ ...session.asJson(), user_id: session.account_id })`, matching the Steam route (`auth.ts:235`).

**Step 4 — (Only if design B) Persist `game_id`** *(F2/F3/F6.1)*
- New migration `src/db/migrations/003_add_game_id.sql`, **SQLite syntax**, no `BEGIN/COMMIT` (runner wraps it):
  ```sql
  ALTER TABLE accounts ADD COLUMN game_id INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_game_id ON accounts(game_id) WHERE game_id <> 0;
  ```
- Mirror the column in the inline DDL at `connection.ts:36-61` (drift rule).
- `account.ts`: add `game_id` to the `AccountRow` type **and** to `ACCOUNT_COLUMNS`; add it to the `upsertAccount` INSERT list; **do not** add it to `ON CONFLICT DO UPDATE`. Backfill in app code on login, not via a MySQL `WHERE`.
- Add race-safe collision handling (catch `UNIQUE` violation, re-derive/increment, retry) — covering Steam rows too.

**Step 5 — `.env` docs** *(keep, with a correction)*
- Document `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI`. Note the code already defaults `CLIENT_ID` and `REDIRECT_URI` (`discord.ts:20-21`) and only `CLIENT_SECRET` is truly required (already warned, `discord.ts:23-24`). Confirm the hardcoded fallback `CLIENT_ID` is the intended community app or override it.

**Delete the old Step 4 (CSRF)** entirely *(F1)* and update the `Findings-Client` summary's prerequisite list to match.

## Corrected client approach (lighter path)

1. **Desktop-first smoke test (de-risks the server before any mobile spend):** launch the existing AIR client with `--server https://<community-host>/`, patch `PreAuthState.as:33` to put the Discord token into `credentials.steamAuthTicket` (via the `overrideSteamId` bypass), and complete a real Discord login against the corrected server. No new login screen required to validate the flow.
2. **`DiscordSteamworks`** subclass of `NullSteamworks` (3 overrides: SteamID, auth ticket, init) for targets without Steam.
3. **Mobile packaging (later):** bake the HTTPS URL into the **AIR app descriptor** (launch args aren't available to a packaged app), register the `bsf://` deep-link scheme (Android intent-filter / iOS `CFBundleURLTypes`), recompile on **HARMAN AIR 50+**, then sideload (Android) / TestFlight (iOS). HTTPS is mandatory.

---

## Verification

1. `yarn build` — must compile clean (run locally per CLAUDE.md).
2. `yarn test` — existing `discord.test.ts` (incl. the state-validation block) must still pass; **add** a test asserting a real 18–19-digit snowflake yields a positive `account_id` ≤ `2_147_483_647` and that `/login/discord/session` returns that value as `user_id`.
3. Manual Discord flow: `GET /login/discord/` → Discord (state param present) → callback sets cookie, redirects `bsf://auth?access_token=…` → `POST /login/discord/session` with `Authorization: Bearer <jwt>` → returns `{ user_id ≤ 2_147_483_647, session_key }`.
4. (Design B only) confirm the `accounts` row has `game_id` populated and equal to the returned `user_id`.
5. `test-2p-match.bat` — Steam path still works end-to-end (no regression).
6. Desktop crossplay smoke: one Steam client + one Discord-via-`--server` client complete a full match; confirm no turn-0 desync (identical DJB hash → consistent `account_id` from the server for both parties).

---

## Recommendation

Treat the original plan as **~30% accurate**: the goal and the "what does NOT change" section are right; the server steps need a near-total rewrite (SQLite, not MySQL; remove M-6, don't re-add CSRF; thread the exact string), and the client section should be replaced by the lighter path the repo already documents. The single highest-value change is **F4** — without removing the M-6 rejection and using the exact snowflake string, no amount of `game_id` work lets a Discord user log in.

---

*Review generated with [Claude Code](https://claude.ai/code)*
