# Plan: Extract ActionScript Source from BSF Game Client

## Context

Phase 2 of the mobile crossplay plan (`misc/Plan-Enable-Mobile-Windows-Crossplay.md`) requires decompiling the AIR game client to ActionScript source. This is a prerequisite for patching the server URL, replacing Steam auth with Discord OAuth, and recompiling for mobile targets. This plan fills in the concrete mechanics that the crossplay doc left vague ("decompile the mobile SWF with JPEXS").

**Key facts already confirmed:**
- The main SWF is `app.game.air.swf` (confirmed from Fiddler captures: `Referer: app:/app.game.air.swf`)
- The SWF is directly accessible on disk — not embedded in the .exe; no extraction step needed
- The `application.xml` manifest confirms: `supportedProfiles` includes `mobileDevice` + `extendedMobileDevice`, iOS was an active target, Android was scaffolded. Two ANE extensions loaded: `air.fmod.ane.FmodContext` (audio) and `air.steamworks.ane.SteamworksAneContext` (Steam auth)
- JPEXS workflow is already partially documented in `docs/Development.md` lines 636–702

**Client binary location (two options):**
- Steam install: `C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32\app.game.air.swf`
- GitHub release: download `BannerSagaFactions-client.zip` from the BSF-Custom-Server releases, unzip, SWF is in the root

---

## Step 1 — Tool Setup

**JPEXS Free Flash Decompiler** (primary tool)
- Download from: `https://github.com/jindrapetrik/jpexs-decompiler/releases` (get `ffdec_<version>.zip`)
- Requires Java 11+. Check: `java -version`. Install Temurin 21 LTS from `https://adoptium.net/` if missing.
- CLI export command (batch-friendly):
  ```bat
  java -jar "C:\tools\ffdec\ffdec.jar" -export script "C:\decompile\bsf\scripts" "C:\decompile\bsf\app.game.air.swf"
  ```

**7-Zip** — needed only if working from the GitHub release ZIP (not the Steam install).

---

## Step 2 — Copy and Verify the SWF

Never modify the original. Work from a copy:
```bat
mkdir C:\decompile\bsf
copy "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32\app.game.air.swf" C:\decompile\bsf\
certutil -hashfile C:\decompile\bsf\app.game.air.swf SHA256
```
Record the hash for integrity verification.

---

## Step 3 — Decompile to ActionScript

**GUI path (recommended for first pass):**
1. Launch JPEXS → File → Open → `C:\decompile\bsf\app.game.air.swf`
2. Wait ~30 seconds for parse. Expand `scripts` node in left panel.
3. Spot-check: confirm `game/cfg/GameConfig` is visible (we know it exists at line ~906).
4. File → Export → Export selection → "Scripts (ActionScript source)" → output to `C:\decompile\bsf\scripts\`

**CLI path (1–3 min for this SWF size):**
```bat
java -jar ffdec.jar -export script "C:\decompile\bsf\scripts" "C:\decompile\bsf\app.game.air.swf"
```

Optional — export embedded binary/XML assets (may contain config data):
```bat
java -jar ffdec.jar -export binaryData "C:\decompile\bsf\binaryData" app.game.air.swf
```

---

## Step 4 — Verify Completeness

Count exported files (expect 200–800 classes for a SWF this size):
```bat
(for /r "C:\decompile\bsf\scripts" %f in (*.as) do @echo .) | find /c "."
```

Confirm the 12 known protocol anchor classes are present (names from `src/const.ts`):
```powershell
$anchors = @("BattleCreateData","BattlePartyData","BattleSyncData","BattleMoveData",
             "BattleActionData","BattleKilledData","BattleFinishedData","ServerStatusData",
             "ChatMsg","EntityDef","VsQueueData","LeaderboardsData")
foreach ($a in $anchors) {
    $f = Get-ChildItem "C:\decompile\bsf\scripts" -Recurse -Filter "*$a.as" | Select -First 1
    if ($f) { "OK  $a -> $($f.FullName)" } else { "MISSING  $a" }
}
```
If all 12 resolve, the export is complete. Also open `GameConfig.as` and confirm console command registrations are readable at line ~906 — this is the canary.

---

## Step 5 — Find the 6 Key Items for Crossplay

Run all searches from `C:\decompile\bsf\scripts\` with PowerShell `Select-String -Recurse -Include *.as`.

### 5.1 Server URL constant
```powershell
sls "stoicstudio|tbs-dev" -Recurse -Include *.as
sls "services/auth/login" -Recurse -Include *.as
```
**What to find:** `static const SERVER_URL:String = "http://tbs-dev-live.stoicstudio.com"` (or similar) in a class like `GameConfig`, `NetworkManager`, or `AppConfig`. This string gets patched to the community HTTPS domain.

### 5.2 Steam auth flow (entry point for Discord OAuth replacement)
```powershell
sls "getAuthSessionTicket|SteamworksAneContext|steam_auth_ticket" -Recurse -Include *.as
sls "auth/login" -Recurse -Include *.as
```
**What to find:** the function that calls `SteamworksContext.instance.getAuthSessionTicket()` and then POSTs to `/services/auth/login/11`. This is the exact code path to replace with the Discord OAuth deep-link initiation.

### 5.3 Login response parsing — `user_id` vs `game_id` field name
```powershell
sls "\.user_id\s*=|session_key" -Recurse -Include *.as
```
**What to find:** the class that parses the login response JSON. Confirms whether it reads `data.user_id` or `data.game_id`. The server's `auth.ts` currently returns `{ user_id: session.account_id, session_key }` — if the client reads `user_id`, no client-side field rename is needed when we introduce `game_id` on the server.

### 5.4 Entity naming — DJB hash input construction
```powershell
sls "djb|DJB|hashCode" -Recurse -Include *.as
sls 'user_id.*\+.*index|account_id.*\+' -Recurse -Include *.as
```
**What to find:** confirms the entity name is assembled as `{user_id}+{index}+{unit_id}` and that `user_id` is sourced from the login response field identified in 5.3. This must stay consistent — both clients must compute identical entity strings or the DJB hash diverges at turn 0.

### 5.5 Long-poll loop (reconnect behavior on mobile)
```powershell
sls "services/game" -Recurse -Include *.as
sls "ioError|reconnect|Timer" -Recurse -Include *.as
```
**What to find:** the polling loop class. Confirm the client handles an empty-array response (server returns `[]` after 10s timeout) by immediately restarting the poll, and understand back-off/retry behavior on network errors (important for mobile network transitions).

### 5.6 Mobile-specific code paths
```powershell
sls "Capabilities.os|mobileDevice|Capabilities.version" -Recurse -Include *.as -CaseSensitive:$false
sls "registerClassAlias" -Recurse -Include *.as
```
`registerClassAlias` calls embed canonical `tbs.srv.*` names as string literals — this is the fastest way to build a mapping if any identifier obfuscation is present.

---

## Step 6 — Decompile the Steam ANE Stub

The ANE extension is a ZIP. Extract it to read the ActionScript method signatures:
```bat
7z x "C:\...\win32\META-INF\AIR\extensions\air.steamworks.ane.SteamworksAneContext" -o"C:\decompile\bsf\ane-steam"
```
Then open `ane-steam\META-INF\ANE\default\library.swf` in JPEXS. This gives the exact method name for Steam ticket generation that must be replaced/stubbed in the Discord auth rewrite.

---

## Step 7 — Handle Obfuscation (if present)

**Diagnose first:** if class names in the JPEXS tree are readable (e.g., `game.cfg.GameConfig`) — proceed directly. If gibberish (`_-1gA`) — identifier renaming.

**For identifier renaming (most likely scenario for a game of this era):**
- The `registerClassAlias` search from step 5.6 maps obfuscated names → canonical `tbs.srv.*` names
- Use JPEXS Tools → Rename identifiers for auto-deobfuscation
- Use known string literals from the Fiddler captures as anchors (e.g., search for `"BattleCreateData"` string constant to find the class even if the class identifier is garbled)

**For string encryption (server URL returns nothing):** look for `String.fromCharCode` + XOR patterns. Extract the encrypted blob and key from the AS3, decrypt manually.

**For control-flow obfuscation (decompilation fails, red nodes):** use JPEXS P-code view for the specific methods needed (login, polling loop) rather than full AS3 decompilation.

---

## Step 8 — Document Findings

Create `misc/SWF-Decompilation-Findings.md` with, for each of the 6 items above:
- Exact `.as` file path and line number
- Verbatim AS3 snippet
- Specific change required for crossplay

This feeds directly into the crossplay plan Phase 2 client patches.

---

## Step 9 — Path to Recompilation (Sketch)

Full details are in `misc/Plan-Enable-Mobile-Windows-Crossplay.md`. Quick sequence:
1. Apply the four patches (server URL, Steam→Discord auth, `bsf://` URL scheme in `application.xml`, stub/remove SteamworksANE for mobile targets)
2. Install HARMAN AIR SDK → set `AIR_HOME` env var
3. Recompile SWF with `amxmlc`, package with `adt`
4. Test Windows build first (`--server https://community.domain/ --steam false --steam_id 123456`)
5. Android APK sideload is the fastest path to mobile testing (no store account needed)

---

## Verification Checklist

- [ ] 200+ `.as` files exported to `C:\decompile\bsf\scripts\`
- [ ] All 12 protocol anchor classes resolved (step 4 check)
- [ ] `GameConfig.as` line ~906 is human-readable (canary)
- [ ] Server URL string found (step 5.1)
- [ ] Steam auth call site found (step 5.2)
- [ ] Login response field name confirmed (step 5.3)
- [ ] Entity naming construction confirmed (step 5.4)
- [ ] `SWF-Decompilation-Findings.md` created with all 6 items documented

---

## Critical Files

| File | Role |
|------|------|
| `C:\Program Files (x86)\Steam\steamapps\...\win32\app.game.air.swf` | Source SWF to decompile |
| `C:\Program Files (x86)\Steam\steamapps\...\win32\META-INF\AIR\application.xml` | App manifest (entry point, profiles, extensions) |
| `C:\decompile\bsf\scripts\game\cfg\GameConfig.as` | Server URL + console commands (known location) |
| `misc/Plan-Enable-Mobile-Windows-Crossplay.md` | Parent plan — server-side prerequisites and recompilation details |
| `src/services/auth/discord.ts` | Server Discord auth (must be fixed before mobile client can authenticate) |
| `src/services/auth/auth.ts` | Session account_id computation (game_id override needed) |
| `src/db/account.ts` | AccountRow type + upsertAccount (game_id field needed) |

*Created with [Claude Code](https://claude.ai/code)*
