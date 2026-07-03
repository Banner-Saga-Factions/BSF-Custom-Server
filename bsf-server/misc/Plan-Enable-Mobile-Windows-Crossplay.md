# Plan: Enable Mobile + Windows Crossplay

> **Revised 2026-06-04 (design-A).** This plan was rewritten after a code-verified review found the
> previous version was written against the original MySQL/Java server and a stale snapshot of
> `discord.ts`. Full rationale and the line-by-line evidence are in
> [`Review-Plan-Enable-Mobile-Windows-Crossplay.md`](./Review-Plan-Enable-Mobile-Windows-Crossplay.md).
> This version is meant to be executed as-is.

## To resume working with AI
 A new chat can open with:

  Execute the server-side steps (1–3) in
  @bsf-server/misc/Plan-Enable-Mobile-Windows-Crossplay.md.
  Re-confirm the discord.ts line anchors against current code first, then
  present all edits with What/Why/Tradeoff and wait for my "y" per CLAUDE.md.
  
## Context

The server already supports crossplay at the protocol level — matchmaking (`type` + `power` only) and
battle logic have no platform-specific code. The only barrier to mobile crossplay is **authentication**:
mobile clients can't use Steam, so Discord OAuth is the path in. The OAuth machinery in `discord.ts` is
mostly built, but **Discord login does not work today** for one concrete reason:

- **Real Discord IDs are rejected outright.** Discord snowflakes are 18–19-digit numbers, all larger than
  JavaScript's safe-integer limit (`Number.MAX_SAFE_INTEGER` ≈ 9.0×10¹⁵, 16 digits). The current code
  (`discord.ts` "M-6" guard, ~lines 133-140 and 163-166) runs `parseInt()` on the ID, notices it can't
  round-trip, and **rejects the login** with `error=unsupported_account_id`. Because every real Discord
  account trips this, Discord login is a safe-but-inert stub. The fix is to stop forcing the ID through a
  lossy `Number`, carry the **exact ID string** instead, and derive a compact 32-bit in-game id from it
  with `BigInt`.

**Why a 32-bit in-game id at all:** the Flash client builds every battle entity name as
`{account_id}+{index}+{unit_id}` and seeds its per-turn sync hash (DJB) from those strings. The client
stores `user_id` as a **signed 32-bit int** (`Credentials.as:28` → `userId:int`, max **2,147,483,647**).
If the two players ever disagree on a player's id, their entity strings — and the hash — diverge at turn 0
and the match desyncs. So the server must hand both clients the same id for each player, and it must fit a
signed 32-bit int. Steam already does this (`account_id = steam_id − 76561197960265728`); Discord needs an
equivalent reduction.

### Design choice: derive deterministically, no new DB column (design-A)

We compute the 32-bit id on the fly from the provider id and add **no `game_id` column and no migration**:

- **Steam:** `account_id = steam_id − 76561197960265728` *(already implemented; unchanged).*
- **Discord:** `account_id = Number(BigInt(discord_id) & 0x3FFFFFFFn)` — the low 30 bits, always positive
  and ≤ 1,073,741,823, comfortably under the client's signed-int ceiling.

This accepts a vanishingly small, unresolved collision probability at revival-server scale in exchange for
zero schema work. *(If guaranteed uniqueness is ever needed, the fallback is a persisted `game_id` column
with a UNIQUE index and collision resolution — deferred; see the review doc.)*

### What does NOT need to change

- **Matchmaking** (`src/services/queue.ts`) — matches on `type` + `power` only; no platform filtering.
- **Battle system** — fully platform-agnostic; all in-game data already uses 32-bit `account_id`.
- **HTTP transport** — long-polling works on all platforms; the client auto-reconnects on network flips.
- **DB layer** — `upsertAccount` / `getAccountByUserId` already accept `string | number` and store
  `user_id` as TEXT, so the full Discord snowflake fits the primary key with no precision loss.
- **OAuth CSRF (`state`)** — **already implemented, tested, and shipped** (Issue #54): the `pendingStates`
  map + `bsf_oauth_state` HttpOnly cookie + callback validation in `discord.ts`, covered by
  `discord.test.ts`. Do **not** re-implement it.

---

## Server-Side Steps

> Per `bsf-server/CLAUDE.md`, present each edit below with **What / Why / Tradeoff** in one message and wait
> for an explicit **y** before touching any file. Line numbers are approximate — re-confirm the anchors
> against current code before editing.

### Step 1 — Accept real Discord snowflakes in the OAuth callback
**File:** `src/services/auth/discord.ts` (the `/oauth-callback` handler)

- **Remove** the M-6 precision-loss rejection (the `parseInt(discord_user.id)` block, ~lines 133-140). Do
  **not** touch the CSRF cookie code or the `KNOWN_DISCORD_ERRORS` allowlist — those are unrelated security
  features the old plan mistakenly flagged.
- Validate the id's shape and upsert with the **exact string**:

```typescript
const discord_id_str = discord_user.id;                 // exact snowflake, full precision
if (!/^\d{1,20}$/.test(discord_id_str)) {
    res_params.set("error", "unsupported_account_id");
    return res.redirect(302, `bsf://auth?${res_params}`);
}
const accountRow = await upsertAccount(discord_id_str, discord_user.username);  // row PK = full snowflake
// JWT is unchanged — it already signs the exact string: sign({ discord_id: discord_user.id }, ...)
res_params.set("new_user", String(accountRow.login_count === 1));
res_params.set("username", accountRow.username);
res_params.set("access_token", jwt_res);
```

**Why:** stores the account under its true id (TEXT PK) instead of a truncated number, so later lookups and
in-session writes can find it.
**Tradeoff:** none meaningful — the shape check replaces the numeric parse; the JWT already carried the
exact string.

### Step 2 — Build a working Discord session
**File:** `src/services/auth/discord.ts` (the `POST /session` handler)

- **Remove** the M-6 precision-loss rejection (the `parseInt(decoded.discord_id)` block, ~lines 163-166).
- Mirror the Steam login route (`auth.ts:218-235`): derive the 32-bit id, create the session, then set the
  exact id string into `steam_id_str` (the field every in-session DB write keys off — see note) and return
  `account_id` as `user_id`:

```typescript
const discord_id_str = String(decoded.discord_id);      // exact string from the JWT
if (!/^\d{1,20}$/.test(discord_id_str)) return res.sendStatus(401);

// Low 30 bits → positive, <= 1,073,741,823 (fits the client's signed 32-bit user_id).
const account_id = Number(BigInt(discord_id_str) & 0x3FFFFFFFn);

const session = sessionHandler.addSession(account_id);  // ctor derives account_id (account_id < STEAM base)
session.steam_id_str = discord_id_str;                  // exact snowflake — the accounts-table primary key
session.account_id = account_id;                        // explicit for clarity / future-proofing

try {
    session.accountData =
        (await getAccountByUserId(discord_id_str)) ??
        (await upsertAccount(discord_id_str, session.display_name));
    session.display_name = session.accountData.username;
    res.json({ ...session.asJson(), user_id: session.account_id });  // <-- send account_id, like Steam
} catch (err) {
    sessionHandler.removeSession(session.session_key);
    console.error("[DISCORD] DB error during session creation:", err);
    res.sendStatus(500);
}
```

> **Invariant — why `steam_id_str` matters:** despite the Steam-flavoured name, `session.steam_id_str` is
> the exact provider-id string used as the DB key by **every** in-session write: `roster.ts` (×8 sites),
> `account.ts` `saveParty`/`saveRoster`/`markTutorialComplete`, `app.ts` `addRenown`, and `Battle.ts`
> endgame `addRenown`. If it isn't the exact snowflake, a Discord player's roster/renown/party writes land
> on the wrong row (or a truncated-id collision). The Steam route already sets it this way at `auth.ts:220`.

**Why:** turns the inert stub into a real session whose in-game id fits the client and whose DB writes hit
the right account row.
**Tradeoff:** the masked id carries the same small collision risk as design-A in general; acceptable for a
revival-scale PoC.

*(Optional cleanliness: extract the two `BigInt(...) & 0x3FFFFFFFn` derivation into a shared
`deriveDiscordAccountId(idStr)` helper. Single call site today, so inline is fine.)*

### Step 3 — Document `.env` variables
**File:** `.env.example` / README

```
DISCORD_CLIENT_ID=...            # has a hardcoded fallback in discord.ts — set to the community app's id
DISCORD_CLIENT_SECRET=...        # REQUIRED — OAuth login fails without it (code already warns on startup)
DISCORD_REDIRECT_URI=http://localhost:8082/login/discord/oauth-callback   # has a default; override per host
```

Only `DISCORD_CLIENT_SECRET` is strictly required; `CLIENT_ID` and `REDIRECT_URI` have defaults in
`discord.ts:20-21`. Confirm the fallback `CLIENT_ID` is the intended community application or override it.

### No database migration

Design-A adds **no column and no migration**. Leave `src/db/schema.sql`, the inline DDL in
`connection.ts`, and `src/db/migrations/` untouched.

---

## Client-Side Changes

> **Note:** The server steps above are the prerequisite. The repo already contains a JPEXS decompile of the
> shipped client at `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\` (1,267 classes, no obfuscation), and
> the wire-level findings live in
> [`Findings-Client-ActionScript-Crossplay.md`](./Findings-Client-ActionScript-Crossplay.md). The hooks
> below already exist in the client — the work is small, not a from-scratch rebuild.

### Windows / Steam — No Changes Needed

The Windows client works end-to-end today: it sends a Steam ID to `POST /login/:httpVersion`, gets a
`session_key`, and long-polls. The only thing ever needed was pointing it at the community server (hosts
redirect or the `--server` launch flag below).

### Desktop-first Discord smoke test (validate the server before any mobile spend)

The client has a built-in `--server` launch override (`GameMainAir.as:381-384`) and a pre-existing
`overrideSteamId` auth bypass (`PreAuthState.as:31-34`). Use them to exercise the corrected server on
desktop without rebuilding the SWF:

1. Launch the AIR client with `--server https://<community-host>/`.
2. Patch `PreAuthState.as:33` to put the Discord OAuth token (received via the `bsf://` deep link) into
   `credentials.steamAuthTicket` instead of the literal `"override-authticket"`.
3. Complete a real Discord login against the corrected server; confirm a session + long-poll.

### iOS / Android — packaging work (after the desktop smoke test passes)

1. **Server URL:** desktop takes `--server`, but a packaged mobile app can't take launch args — bake the
   HTTPS URL into the **AIR application descriptor / build config** (not a hex-edit). The URL **must** be
   `https://` (iOS ATS and Android network-security policies block plain HTTP).
2. **Auth:** add a "Login with Discord" affordance that opens `/login/discord/` in the **system browser**,
   register the `bsf://` scheme (Android `AndroidManifest.xml` intent-filter; iOS `Info.plist`
   `CFBundleURLTypes`), catch `bsf://auth?access_token=<jwt>`, and `POST` it to `/login/discord/session`.
   From the returned `session_key` on, the mobile client behaves exactly like the Steam path.
3. **Steamworks shim:** subclass the existing `NullSteamworks` as `DiscordSteamworks` (override SteamID →
   Discord id, auth ticket → OAuth token, and init → `true`).
4. **Runtime:** recompile on **HARMAN AIR 50+** (Adobe abandoned AIR in 2019) for iOS 16+ / Android API 33+,
   64-bit output. Without this the app fails modern-OS install/review.
5. **Distribution:** Android **sideload (APK)** is the fastest path and needs no store account. iOS needs an
   Apple developer account (TestFlight or App Store). Both stores require their respective accounts and
   compliance (privacy labels, ATS, targetSdk, 64-bit).

---

## Recommended Sequencing

```
Phase 1 — Server (doable now, ~half a day):
  Steps 1–3 (accept snowflakes, working Discord session, .env docs)
  yarn build + yarn test green; Steam path unaffected
  Deploy behind HTTPS (Caddy/OCI/Hetzner)

Phase 2 — Desktop Discord validation (de-risks before mobile spend):
  --server + overrideSteamId smoke test; full Steam-vs-Discord match, no turn-0 desync

Phase 3 — Mobile packaging:
  AIR descriptor URL + bsf:// deep link + DiscordSteamworks
  Recompile on HARMAN AIR 50+
  Android sideload first; iOS TestFlight; store submission if desired
```

---

## Verification

1. `yarn build` — compiles clean (run locally per CLAUDE.md).
2. `yarn test` — existing `discord.test.ts` (incl. the state-validation block) still passes. **Add** a test:
   a real 18–19-digit snowflake yields a **positive** `account_id` ≤ **2,147,483,647**, and
   `POST /login/discord/session` returns that value as `user_id`.
3. Manual Discord flow: `GET /login/discord/` → Discord (with `state`) → callback sets the `bsf_oauth_state`
   cookie and redirects `bsf://auth?access_token=…` → `POST /login/discord/session` with
   `Authorization: Bearer <jwt>` → returns `{ user_id ≤ 2,147,483,647, session_key }`.
4. Confirm the `accounts` row PK is the **full snowflake string** (not a truncated number), and that a
   roster/party change while logged in via Discord persists to that same row.
5. `test-2p-match.bat` — Steam path still works end-to-end (no regression).
6. Desktop crossplay: one Steam client + one Discord-via-`--server` client complete a full match; confirm no
   turn-0 desync (identical DJB hash ⇒ the server handed both clients a consistent `account_id`).

---

*Created with [Claude Code](https://claude.ai/code)*
