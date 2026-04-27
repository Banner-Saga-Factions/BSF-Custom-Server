# Plan: Enable Mobile + Windows Crossplay

## Context

The server already supports crossplay at the protocol level — matchmaking (type + power match only) and battle logic have no platform-specific code. The only barrier to mobile crossplay is **authentication**: mobile clients can't use Steam. Discord OAuth is the chosen path and is ~90% built in `discord.ts`, but has two bugs that must be fixed before any mobile client can connect:

1. **Missing CSRF protection** — no `state` parameter in the OAuth flow (marked `TODO HIGH-1`).
2. **Discord account_id overflow** — Discord IDs are 18-digit snowflakes > `Number.MAX_SAFE_INTEGER`. `parseInt()` loses precision; after subtracting `STEAM_ID_BASE`, the result is a large imprecise number. The Flash game client expects a 32-bit user ID for entity naming (`{user_id}+{index}+{unit_id}`). Sending an overflow value will diverge the DJB hash between opponents.

**What does NOT need to change:**
- Matchmaking (`src/services/queue.ts`) — matches on `type` + `power` only. No platform filtering.
- Battle system — fully platform-agnostic.
- HTTP transport — long-polling works on all platforms.
- DB layer — already accepts `string | number` for all IDs.

---

## Server-Side Steps

### Step 1 — Add `game_id` to the DB schema
**File:** `src/db/schema.sql`

Add a compact 32-bit game identifier used for all in-game entity naming, decoupled from the auth provider's ID:

```sql
-- In the accounts table definition, add after user_id:
game_id INT UNSIGNED NOT NULL DEFAULT 0,
-- After CREATE TABLE, add:
ALTER TABLE accounts ADD UNIQUE KEY idx_game_id (game_id);

-- One-time migration for existing Steam accounts:
UPDATE accounts
  SET game_id = CAST(CAST(user_id AS UNSIGNED) - 76561197960265728 AS UNSIGNED)
  WHERE user_id >= 76561197960265728;
```

---

### Step 2 — Propagate `game_id` through the DB layer
**File:** `src/db/account.ts`

- Add `game_id: number` to the `AccountRow` type.
- In `parseRow()`, include `game_id: Number(raw.game_id)`.
- In `upsertAccount()`, compute and pass `game_id` on INSERT using BigInt arithmetic:
  - **Steam:** `Number(BigInt(user_id_str) - 76561197960265728n)` — exact 32-bit result.
  - **Discord:** `Number(BigInt(discord_id_str) & 0x3FFFFFFFn)` — lower 30 bits of the snowflake, a compact stable int. If a collision exists (rare at revival-server scale), increment until unique.
- The `ON DUPLICATE KEY UPDATE` clause skips `game_id` so it's only set on first insert.

---

### Step 3 — Use `game_id` in Session
**Files:** `src/services/auth/auth.ts`, `src/services/auth/discord.ts`

**auth.ts (Steam login, line ~148):**
After `session.accountData = await upsertAccount(...)`, add:
```typescript
session.account_id = session.accountData.game_id;
```
This overrides the constructor-computed value with the authoritative DB value.

**discord.ts (Discord session, line ~135):**
Same override after `session.accountData` is populated:
```typescript
session.account_id = session.accountData.game_id;
```
Also remove the now-redundant precision-loss `console.warn` calls for `numeric_id` (lines 97–99, 124–126) since game_id is computed with BigInt.

---

### Step 4 — Add OAuth CSRF state parameter
**File:** `src/services/auth/discord.ts`

Implement the `TODO HIGH-1`:

```typescript
// Module-level state store (TTL 5 min)
const pendingStates = new Map<string, number>(); // state → expiry timestamp

// In getDiscordOAuthURL():
const state = crypto.randomBytes(16).toString("hex");
pendingStates.set(state, Date.now() + 5 * 60 * 1000);
url.searchParams.set("state", state);
// return { url, state } so the caller can set it in a cookie

// In oauth-callback handler: verify state
const state = req.query.state?.toString() ?? "";
const expiry = pendingStates.get(state);
if (!expiry || Date.now() > expiry) {
    res_params.set("error", "invalid_state");
    return res.redirect(302, `bsf://auth?${res_params}`);
}
pendingStates.delete(state);
```

The route `GET /login/discord/` sets the `state` in a `HttpOnly SameSite=Lax` cookie; `oauth-callback` reads it back and verifies.

---

### Step 5 — Document `.env` variables
**File:** `.env` (template / README)

Ensure these are documented as **required for mobile crossplay**:
```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...       # required — OAuth login fails without this
DISCORD_REDIRECT_URI=http://localhost:8082/login/discord/oauth-callback
```

---

## Client-Side Changes Required

> **Note:** The server steps above are prerequisites. Infrastructure alone (HTTPS proxy) is not sufficient — Discord auth bugs must be fixed before any mobile client can authenticate and play.

### Windows / Steam — No Changes Needed

The Windows client already works end-to-end. It sends a Steam ID to `POST /login/:httpVersion`, receives a `session_key`, and long-polls. The server handles everything correctly. The only "change" ever needed was pointing the client at the community server URL (done via hosts file redirect or binary patch), which is already in place.

---

### iOS / Android — Significant Work Required

The mobile client is a compiled Adobe AIR / SWF binary. Stoic Studio's original ActionScript source is not available. All changes below require either decompiling the SWF or a full recompile from source.

#### 1. Source Code Access (Blocker)

Decompile the mobile SWF with **JPEXS Free Flash Decompiler** to access and edit ActionScript bytecode. This is feasible for AIR apps but is a reverse-engineering effort, not a configuration step. Alternatively, if source is ever recovered from Stoic, a clean recompile is preferred.

#### 2. Server URL (Binary Patch or Source Edit)

The original BSF server URL is compiled into the SWF. It must be replaced with the community server's HTTPS domain. Options:
- **Source edit:** Change the server URL constant before recompiling (preferred).
- **Binary patch:** Hex-edit the string in the SWF via JPEXS (faster, riskier).

The URL must be `https://` — iOS ATS and Android network security policies block plain HTTP outright.

#### 3. Auth Flow — Replace Steam with Discord OAuth

Steam is not available on iOS/Android. The mobile auth flow must be replaced or extended:

1. Add a login screen with a **Login with Discord** button.
2. Open `/login/discord/` in the **system browser** (not a WebView, to avoid CSRF exposure).
3. Register the `bsf://` custom URL scheme:
   - Android: `AndroidManifest.xml` intent-filter
   - iOS: `Info.plist` CFBundleURLTypes entry
4. Catch the `bsf://auth?access_token=<jwt>` deep link redirect.
5. Extract the JWT and POST it to `POST /login/discord/session`.
6. Receive `session_key` — from here the mobile client behaves identically to the Steam path.

#### 4. Adobe AIR → HARMAN AIR SDK

Adobe abandoned AIR in 2019; HARMAN now maintains it for enterprise use. To build for modern OS targets:

| Target | Minimum Requirement |
|---|---|
| iOS 16+ | HARMAN AIR 50+, updated provisioning profile |
| Android (API 33+) | HARMAN AIR 50+, 64-bit binary output |
| Both | HARMAN free tier (non-commercial use) |

Without this, the app will fail App Store review and likely fail to install on modern devices.

#### 5. App Store Distribution

| Store | Requirement |
|---|---|
| Apple App Store | $99/year Apple Developer account, privacy labels, ATS compliance, App Review |
| Google Play | $25 one-time account, targetSdk 33+, 64-bit compliance |

Both stores require a developer account. The original app was under Stoic Studio's account — a community revival would be a new listing. **Android sideloading** (direct APK install) is achievable without any store account and is the fastest path to mobile testing. iOS without App Store requires TestFlight, which still needs an Apple developer account.

---

## Recommended Sequencing

```
Phase 1 — Server (doable now, ~1–2 days):
  Complete Steps 1–5 above (game_id, Discord CSRF fix, .env docs)
  Deploy to OCI/Hetzner with Caddy for HTTPS
  Verify Steam crossplay still works end-to-end

Phase 2 — Client reverse engineering (~1–2 weeks):
  Decompile mobile SWF with JPEXS
  Patch server URL to HTTPS community domain
  Implement Discord OAuth deep-link flow in ActionScript
  Recompile with HARMAN AIR 50+

Phase 3 — Distribution:
  Android: sideload APK (no store account needed — fastest path)
  iOS: TestFlight Ad Hoc (requires Apple dev account)
  Full App Store submission if desired (both platforms)
```

---

## Verification

1. Run `yarn build` — must compile clean after all TypeScript changes.
2. Start server with `start-server.bat`.
3. Simulate Discord login manually:
   - Hit `GET /login/discord/` — should redirect to Discord with a `state` param.
   - Complete OAuth in a browser — callback should set `state` cookie and redirect to `bsf://auth?access_token=...`.
   - POST `{ "Authorization": "Bearer <jwt>" }` to `/login/discord/session` — should return `{ user_id, session_key }` where `user_id` is a value < 2^32.
4. Verify `user_id` in the login response is ≤ 4,294,967,295 (fits 32-bit).
5. Verify DB row has `game_id` populated and matches the `user_id` returned.
6. Run `test-2p-match.bat` to confirm the existing Steam path still works end-to-end.
7. On mobile (Phase 2): verify `bsf://` deep link is caught correctly by the app after OAuth redirect.
8. On mobile (Phase 2): queue and complete a full cross-platform match (Windows Steam vs. Android/iOS Discord).

---

*Created with [Claude Code](https://claude.ai/code)*
