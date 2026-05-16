# SWF Decompilation Findings

Findings from JPEXS decompilation of `app.game.air.swf` (1,267 classes, no obfuscation).
Search root: `%USERPROFILE%\Code\bsf-refs\client-decompiled-as3\`
ANE stub: `%USERPROFILE%\Code\bsf-refs\client-swf-and-ane\ane-steam-scripts\scripts\`

---

## Item 1 — Server URL

**File:** `game/cfg/GameConfig.as:1224–1225`

```actionscript
private function setupHosts() : void
{
   serverHostsLive = "http://tbs-" + _buildRelease + "-live.stoicstudio.com/";
   serverHostsQa   = "http://tbs-" + _buildRelease + "-qa.stoicstudio.com/";
}
```

**Command-line override:** `GameMainAir.as:381–384`

```actionscript
else if(_loc18_ == "--server")
{
   serverOverridden = true;
   server = param1[++_loc15_];
}
```

**Change required for crossplay:** No SWF edit needed. Pass `--server https://community.domain/` as a launch argument to the AIR executable. The `--server` flag overrides `serverHostsLive` entirely. This is the simplest possible server URL patch.

---

## Item 2 — Steam Auth Flow

**File:** `game/session/states/PreAuthState.as:38–41` — the two-step ticket call:

```actionscript
credentials.steamAuthTicketHandle = config.steamworks.SteamUser_GetAuthSessionTicketHandle();
if(credentials.steamAuthTicketHandle)
{
   credentials.steamAuthTicket = config.steamworks.SteamUser_GetAuthSessionTicket(credentials.steamAuthTicketHandle);
   if(credentials.steamAuthTicket)
   {
      credentials.commit();
      return;
   }
}
```

**Pre-existing bypass:** `PreAuthState.as:31–34` — `overrideSteamId` option already exists in the client:

```actionscript
if(config.options.overrideSteamId)
{
   credentials.steamAuthTicket = "override-authticket";
   credentials.commit();
}
```

This bypass is the entry point for Discord OAuth. When `overrideSteamId` is set, `steam_auth_ticket` is a hardcoded string — replacing it with a real Discord token requires a small patch here.

**POST body sent to server:** `game/session/actions/AuthTxn.as:18–27`

```actionscript
var body:Object = {
   "username":          param1.vbb_name,
   "password":          param1.password,
   "child_number":      param1.childNumber,
   "steam_id":          param1.steamId,
   "steam_auth_ticket": param1.steamAuthTicket,
   "display_name":      param1.displayName,
   "client_config":     new ClientConfigData(param2)
};
super("services/auth/login/" + param1.protocolVersion, HttpRequestMethod.POST, body, ...);
```

The `"11"` in the server's hardcoded bypass (`/services/auth/login/11`) is the **protocol version number**, not a magic constant. The client sends its `protocolVersion` as the last URL path segment.

**Change required:** Patch `PreAuthState.as:33` to set `credentials.steamAuthTicket` to the Discord OAuth token (received via `bsf://` deep-link) instead of `"override-authticket"`. The `ISteamworks` interface and `NullSteamworks` stub already exist — a `DiscordSteamworks` implementation is not required for the login flow itself.

---

## Item 3 — Login Response Field Names

**File:** `game/session/actions/AuthTxn.as:35–47`

```actionscript
if(!jsonObject.session_key)
{
   logger.error("AuthAction no sessionKey for " + credentials.vbb_name);
}
if(!jsonObject.user_id)
{
   logger.error("AuthAction no userId for " + credentials.vbb_name);
}
credentials.userId      = jsonObject.user_id;       // line 43 — stored as int
credentials.vbb_name    = jsonObject.vbb_name;       // line 44
credentials.displayName = jsonObject.display_name;   // line 45
credentials.sessionKey  = jsonObject.session_key;    // line 46
buildNumber             = jsonObject.build_number;   // line 47
```

**Confirmation:** The client reads `user_id` (not `game_id`). The server's current `auth.ts` returns `{ user_id: session.account_id, session_key }` — no client-side field rename needed when adding `game_id` to the DB. The server just continues returning `user_id`.

**Constraint:** `Credentials.as:28` declares `userId: int` — a 32-bit signed integer. The `user_id` value returned by the server **must fit in 32 bits**. This is why the server reduces 64-bit Steam IDs to 32-bit account IDs before returning them. Discord snowflakes (18-digit numbers) must go through the same reduction (lower 30 bits via `BigInt(id) & 0x3FFFFFFFn`).

**All fields the server must return:**
- `user_id` — 32-bit int
- `session_key` — string
- `vbb_name` — string (username)
- `display_name` — string
- `build_number` — string

---

## Item 4 — Entity Naming / DJB Hash

**Entity ID construction:** `engine/battle/board/model/BattleBoard.as:451–456`

```actionscript
public function addPartyMember(
   param1:String,  // partyKey
   param2:String,  // entityId (if null, auto-constructed below)
   param3:String,  // battleId
   param4:String,  // accountId (the 32-bit user_id from login)
   param5:String,  // deployment side
   param6:IEntityDef,  // unit definition
   ...
) : BattleEntity
{
   var _loc12_:BattleParty = createParty(param1, param3, param4, param5, ...);
   if(!param2)
   {
      param2 = param4 + "+" + _loc12_.numMembers + "+" + param6.id;
   }
   ...
}
```

**Entity ID format:** `{account_id}+{member_count_before_this_unit}+{unit_def_id}`

- `account_id` — the 32-bit `user_id` from the login response
- `member_count_before_this_unit` — party member count before this unit is added (0 for first unit, 1 for second, etc.)
- `unit_def_id` — the unit's definition ID string from the party data

**DJB hash usage:**
- `engine/battle/board/model/BattleBoard.as:205` — `Hash.DJBHash(battleId)` seeds the RNG
- `engine/battle/fsm/state/BattleStateNextTurn.as:130` — `Hash.DJBHash(hashStr)` computes per-turn sync hash

Both clients must produce identical entity ID strings. If one client has a different `account_id` (because they computed it differently), the entity strings diverge, the DJB hash diverges at turn 0, and the game desynchronizes. This is why the server's 32-bit reduction must be consistent.

---

## Item 5 — Long-Poll Loop

**Poll transaction:** `engine/session/TxnGet.as:10–14`

```actionscript
public static const PATH:String = "services/game";

public function TxnGet(param1:Credentials, param2:Function, param3:ILogger)
{
   super("services/game" + param1.urlCred, HttpRequestMethod.GET, null, param2, param3);
}
```

Where `urlCred = "/" + sessionKey` (`engine/session/Credentials.as:141–143`), so the poll URL is `services/game/{sessionKey}`.

**Poll loop mechanics:** `engine/core/http/HttpCommunicator.as`

```actionscript
private static const DEFAULT_POLL_TIME:int = 3000;  // 3 seconds

private function fetchHandler(param1:HttpJsonAction) : void
{
   checkPoll();  // immediately restart poll on any response
}

private function checkPoll() : void
{
   // abort any in-flight fetch, then immediately send a new one
   if(txnFetch && !txnFetch.sent) { txnFetch.abort(); txnFetch = null; }
   if(!_connected || _pollTimeMs <= 0) { return; }
   txnFetch = txnPollCallback();
   if(txnFetch) { txnFetch.send(this, fetchHandler, _pollTimeMs); }
}
```

**Key behaviors:**
- Default poll interval: 3000ms (the `_pollTimeMs` is the request **timeout**, not a sleep — the server holds the connection for up to 10s, the client timeout is 3s)
- On any response (success, empty array, or error): `fetchHandler` fires → `checkPoll()` → new request immediately
- No back-off. On a network error (status 0), reconnect is instant
- Battle states can tighten the poll to 1000ms via `setPollTimeRequirement` (`BattleFsm.as:374`)
- Error handling: `HttpCommunicator.as:53–55` — status 0 or ≥401 (except 500) calls `errorState.noticeError()`; 500 is treated as OK (server is alive, maintenance mode detected separately)

**Mobile network transitions:** When Wi-Fi → cellular, the in-flight `TxnGet` fails with status 0. `fetchHandler` fires → `checkPoll()` → new `TxnGet` immediately. No reconnect delay. The `HttpErrorState` class tracks consecutive errors for UI display but does not add back-off.

---

## Item 6 — Mobile Code Paths

**Platform detection:** `engine/air/AirConfigVars.as:21–22`

```actionscript
logger.info("Considering local config for playerType " + Capabilities.playerType);
if(Capabilities.playerType != "Desktop")
{
   // load mobile config vars
}
```

`playerType == "Desktop"` on Windows/Mac AIR; `playerType == "AIR"` on iOS/Android.

**OS detection:** `GameMainAir.as:628–640`

```actionscript
if(Capabilities.os.indexOf("Windows") == 0)      { /* Windows path */ }
else if(Capabilities.os.indexOf("Mac") == 0)      { /* Mac path */ }
else                                              { logInfo("UNSUPPORTED OS: " + Capabilities.os); }
```

No explicit iOS/Android branch — mobile was scaffolded but not completed in this code path. iOS/Android will hit the `else` branch and log "UNSUPPORTED OS".

**`registerClassAlias`:** No results in the main SWF. Protocol class names match their ActionScript package names exactly — no obfuscation mapping needed.

**Pre-existing `NullSteamworks` stub:** `engine/steamworks/NullSteamworks.as`

A complete `ISteamworks` implementation with all methods as no-ops already exists in the client. For mobile targets where Steam is unavailable, replace `SteamworksAne` with a `DiscordSteamworks` that:
1. Extends `NullSteamworks`
2. Overrides `SteamUser_GetSteamID()` → returns Discord user ID string
3. Overrides `SteamUser_GetAuthSessionTicket(handle)` → returns Discord OAuth token
4. Overrides `create()` / `initialized` / `SteamAPI_Init()` → returns `true`

---

## Summary: Changes Required for Crossplay

| Item | File to change | What to change |
|------|---------------|----------------|
| Server URL | None (launch arg) | Pass `--server https://community.domain/` to AIR executable |
| Steam auth | `PreAuthState.as:33` | Set `steamAuthTicket` to Discord OAuth token instead of `"override-authticket"` |
| Login response | None | Server already returns `user_id`; no client change needed |
| Entity naming | None | Confirmed: `{account_id}+{index}+{unit_id}` using 32-bit `user_id` |
| Long-poll | None | Client auto-reconnects; no change needed |
| Mobile OS | `GameMainAir.as:628–640` | Add iOS/Android branch (or let it fall through to "UNSUPPORTED OS" for first test) |
| Steamworks | New class `DiscordSteamworks.as` | Extend `NullSteamworks`, override 3 methods |

**Server-side prerequisites** (from `misc/Plan-Enable-Mobile-Windows-Crossplay.md`):
1. Add `game_id` column to `accounts` DB table
2. Compute `game_id` in `upsertAccount()` using BigInt arithmetic
3. Override `session.account_id` with `session.accountData.game_id` after login
4. Add OAuth `state` parameter to Discord auth flow (CSRF fix — `TODO HIGH-1` in `discord.ts`)

*Created with [Claude Code](https://claude.ai/code)*
