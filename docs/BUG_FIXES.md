# Bug Fix Documentation

## Overview
This document provides detailed technical analysis of the 7 critical bugs fixed in v0.1.0.

---

## Bug #1: Array Index Syntax Error

### Root Cause
Typo using bracket notation `indexOf[...]` instead of function call `indexOf(...)`.

### Affected Code Path
```
POST /services/battle/killed/:session_key
→ BattleRouter.post("/killed/...") 
→ Line 301: let killed_idx = party.indexOf[req.body.entity]
→ CRASH: undefined is not a function
```

### Reproduction Steps
1. Start 2-player battle
2. Kill any unit
3. Server crashes with "undefined is not a function"

### Fix Verification
```bash
# Before: SyntaxError caught by TypeScript or runtime
# After: Properly calls indexOf() function, returns valid index
```

---

## Bug #2: Party Filtering Commented Out

### Root Cause
Active development commented out without uncommenting when complete.

### Code Analysis
```typescript
// BEFORE (Lines 85-88)
defs: [acc.roster.defs[0]],  // ❌ Hardcoded to [0]
//(acc.roster.defs as any[]).filter((unit) =>
//  acc.party.ids.includes(unit.id)
//),

// Impact: Sends ONLY first unit, not all 6
```

### Why It Matters
- Game UI renders unit slots for 6 units
- Only 1 unit data causes rendering failure
- Battle becomes unplayable with 5 empty slots

### Fix Applied
```typescript
let filteredDefs = (acc.roster.defs as any[]).filter((unit) =>
    acc.party.ids.includes(unit.id)
);

defs: filteredDefs,  // ✅ Now sends all matching units
```

### Verification
```bash
# Check party.ids has 6 entries
cat data/acc.json | grep -A 6 '"ids"'

# Verify filtered result has 6 units
curl http://localhost:8082/services/battle/... | jq '.parties[0].defs | length'
# Expected output: 6
```

---

## Bug #3: Missing HTTP Response

### Root Cause
Endpoint implemented but `res.json()` or `res.send()` call missing.

### HTTP Issue
```
Client: POST /services/battle/exit/{session_key}
Server: Processes request, but... 
        No response sent back
Client: Waits for response
        Times out after 30-60 seconds
        Shows "connection lost" error
```

### Affected Code Path
```typescript
BattleRouter.post("/battle/exit/:session_key", (req, res) => {
    // ... cleanup logic ...
    // ❌ Missing: res.json() or res.send()
});
```

### Fix Applied
```typescript
res.json({ status: "success", battle_id: battle.battle_id });
```

### Why This Matters
- HTTP is request-response protocol
- Every endpoint MUST send response
- Missing response = client hangs indefinitely
- Common Express.js bug

---

## Bug #4: Parties Data Structure

### Root Cause
Initialized as array `[]` but used as object `{}`

### Type Confusion
```typescript
// BEFORE
this.parties = [];  // Array
this.parties[session.session_key] = party;  // ❌ Treats array as object

// ISSUE: Array with large numeric indices creates sparse array
// Example: this.parties["abc123def456"] = {...}
// Creates: [empty × 10, {party}, empty × 1000000]
```

### Cascade Effects
1. `Object.values(this.parties)` returns sparse entries
2. `battleHandler.getOpponent()` looks up by session_key but finds undefined
3. Second player's opponent is undefined
4. Opponent data operations fail silently or crash

### Fix Applied
```typescript
this.parties = {};  // Object from start
this.parties[session.session_key] = party;  // ✅ Proper key-value storage

// Later when serializing:
parties: Object.values(this.parties),  // ✅ Always exactly 2 parties
```

### Verification
```typescript
// After battle creation, verify:
console.log(typeof battle.parties);  // Should be "object"
console.log(Object.keys(battle.parties).length);  // Should be 2
console.log(battle.parties[session1_key]);  // Should have defs array
console.log(battle.parties[session2_key]);  // Should have defs array
```

---

## Bug #5: Queue Cleanup (Both Players)

### Root Cause
Only removed matched opponent, leaving challenger in queue.

### Queue State Issue
```
BEFORE MATCH:
gameQueue = [
  {user: 123456, type: "QUICK", power: 5},  // Item (challenger)
  {user: 293850, type: "QUICK", power: 5}   // Match (opponent)
]

AFTER MATCH (BROKEN):
gameQueue = [
  {user: 123456, type: "QUICK", power: 5}   // ❌ Still here!
]

Then when 123456 tries to queue again:
"You're already in queue" or duplicate match errors
```

### Why It Happens
```typescript
gameQueue.splice(gameQueue.indexOf(match), 1)[0];  // Removes match only
// ❌ Challenger (item) never removed!
// Later when matchmaking runs again for item, it may match itself or create ghost matches
```

### Fix Applied
```typescript
gameQueue.splice(gameQueue.indexOf(match), 1);  // Remove opponent
gameQueue.splice(gameQueue.indexOf(item), 1);   // ✅ Also remove challenger
```

### Verification
```typescript
// Before match:
console.log("Queue size before:", gameQueue.length);  // Should be 2

// Simulate match creation
battleHandler.addBattle([opponent, challenger], ...);
gameQueue.splice(...);  // Both removals

console.log("Queue size after:", gameQueue.length);  // Should be 0
```

---

## Bug #6: GameRouter Disabled

### Root Cause
During development, someone commented out the route registration.

### Architectural Impact
```
Client: GET /services/game/{session_key}
         ↓ (long-polling for data)
Express Router:
  /services/game → ❌ NOT REGISTERED
  Fallback: 404 or undefined behavior

Client: Receives empty response
        Nothing to display
        Battle UI broken
```

### Router Chain
```typescript
// BEFORE
ServiceRouter.use("/chat", ChatRouter);  // ✅ Registered
// ServiceRouter.use("/game", GameRouter);  // ❌ Commented out
ServiceRouter.use("/vs", QueueRouter);  // ✅ Registered
ServiceRouter.use("/battle", BattleRouter);  // ✅ Registered

// Result: GET /services/game/* returns 404
```

### Fix Applied
```typescript
ServiceRouter.use("/game", GameRouter);  // ✅ Uncommented
```

### Impact
- Long-polling endpoint now accessible
- Data buffer delivered to clients
- Battle state synchronized between players

---

## Bug #7: Protocol Misalignment

### Root Cause
Did not follow official Banner Saga Factions server format.

### Three Sub-Issues

#### a) Missing EntityDef Fields

**What Official Server Sends**:
```json
{
  "class": "tbs.srv.data.EntityDef",
  "id": "warrior_1",
  "entityClass": "warmaster",
  "name": "Thales",  // ← Field we were missing
  "stats": [
    {"class": "tbs.srv.data.Stat", "stat": "STRENGTH", "value": 15},
    {"class": "tbs.srv.data.Stat", "stat": "KILLS", "value": 148},  // ← Track kills
    ...
  ],
  "start_date": 1610826014832,  // ← When unit acquired
  "appearance_acquires": 0,  // ← Cosmetic
  "appearance_index": 0  // ← Cosmetic
}
```

**What We Sent**:
```json
{
  "id": "warrior_1",
  "entityClass": "warmaster",
  // ❌ Missing: name, complete stats, start_date, appearance fields
}
```

**Client Impact**: 
- Missing 'name' field causes deserialization error
- Game can't create unit object
- Crash on BattleCreateData parse

#### b) Wrong Scene Value

**Official**: `"scene": "greathall"`
**Our Code**: `"scene": "rand"` (or other)
**Impact**: Wrong map loaded in game

#### c) Wrong Timer Values

**Official**: 
- Player 1: `"timer": 30` seconds per turn
- Player 2: `"timer": 45` seconds per turn

**Our Code**: 
- Both: `"timer": 45`

**Impact**: Time limit UI wrong; timer might affect matchmaking logic

### Fix Applied
```typescript
// Restore complete EntityDef
let filteredDefs = (acc.roster.defs as any[]).filter(...);
// All objects include: name, stats (with KILLS/BATTLES), 
// start_date, appearance_acquires, appearance_index

// Fix scene
scene: "greathall",  // Literal, not random

// Fix timer
timer: idx === 0 ? 30 : 45,  // Dynamic per player_index
```

### Verification
```bash
# Capture BattleCreateData
curl -X GET http://localhost:8082/services/game/{session_key} | jq '.parties[0]'

# Verify structure matches official (from Fiddler):
# data/game_captures/extracted/raw/0058_s.txt

# Check fields:
# ✅ defs[].name exists
# ✅ defs[].stats includes KILLS and BATTLES
# ✅ scene === "greathall"
# ✅ parties[0].timer === 30
# ✅ parties[1].timer === 45
```

---

## Impact Summary

| Bug | Before | After | Severity |
|-----|--------|-------|----------|
| 1 | Crash on unit death | Unit tracking works | 🔴 CRITICAL |
| 2 | 1/6 units visible | 6/6 units visible | 🔴 CRITICAL |
| 3 | HTTP timeout | Clean exit | 🔴 CRITICAL |
| 4 | Opponent not found | Opponent found | 🔴 CRITICAL |
| 5 | Queue corrupted | Queue clean | 🔴 CRITICAL |
| 6 | No game data | Data delivered | 🔴 CRITICAL |
| 7 | Client crash | Protocol match | 🟠 HIGH |

**Total Fixes**: 7 bugs blocking local 2-player MVP
**Result**: End-to-end battle flow now functional ✅

---

## Testing Procedure

### Unit Test (Per Fix)

```bash
# Bug #1: Death tracking
# → Start battle, kill unit via request manipulation
# → Verify aliveUnits[user_id] decreases

# Bug #2: Party filtering  
# → Start battle
# → Verify parties[session_key].defs.length === 6

# Bug #3: Exit response
# → End battle, post to /battle/exit
# → Verify response received within 1 second

# Bug #4: Parties object
# → Check battleHandler.getBattle(id).parties type
# → Verify Object.keys(parties).length === 2

# Bug #5: Queue cleanup
# → Match two players
# → Verify gameQueue.length decreases by 2

# Bug #6: GameRouter
# → POST to queue start
# → GET /game/{session_key}
# → Verify BattleCreateData received

# Bug #7: Protocol
# → Compare network traffic with official capture
# → Validate EntityDef structure, scene, timer values
```

---

## Lessons Learned

1. **Type Safety**: TypeScript would have caught `indexOf[...]` vs `indexOf(...)`
2. **Code Comments**: Commented-out code should be deleted or marked with TODO
3. **HTTP Basics**: Every endpoint needs response (common Express.js mistake)
4. **Data Structure Intent**: Array vs Object matters; `{}` for key-value, `[]` for ordered
5. **Protocol Compliance**: Reverse-engineer exact format before implementation
6. **Testing**: Catch these locally before production

---

## Prevention Strategies

- [ ] Enable strict TypeScript in tsconfig.json
- [ ] Add HTTP response validation in middleware
- [ ] Require code review before commenting-out logic
- [ ] Protocol tests against official captures
- [ ] Integration tests for full battle flow

---

## Phase 2 Fixes (2026-04-20)

### CRIT-1: 403 response left socket open
**File**: `src/index.ts`  
`res.status(403)` sets the status code but sends no body, leaving the socket open. Changed to `res.sendStatus(403)` which flushes a complete response.

### CRIT-2: Missing JWT_SECRET not caught at startup
**File**: `src/index.ts`  
Added startup `throw` if `JWT_SECRET` env var is missing. Also wrapped `jwt.verify()` in try/catch — tampered, expired, or malformed tokens were throwing an unhandled exception mid-request.

### CRIT-3: Discord JWT path reached undefined route handlers
**File**: `src/index.ts`  
When a Discord JWT was present but no matching session existed, the request fell through to routes that expected `req.session`, causing a TypeError. Now returns `res.sendStatus(501)` immediately.

### MED-4: Invalid `vs_type` not rejected
**File**: `src/services/queue.ts`  
`vs_type` values not in the `GameModes` enum were silently accepted and created malformed queue entries. Now returns 400.

### MED-5: Non-numeric DB_PORT not caught at startup
**File**: `src/db/connection.ts`  
Added `isNaN(DB_PORT)` check; throws with a clear message if `DB_PORT` env var is not a valid number.

### MED-7: Concurrent polls caused double-send
**File**: `src/services/game.ts`  
If two `GET /game/:session_key` polls arrived concurrently (e.g. network retry), both could resolve with the same buffered data. Added `pollingActive: boolean` to `Session` — returns 429 if a poll is already active.

### MED-8: Discord JWT had no expiry
**File**: `src/services/auth/discord.ts`  
`jwt.sign()` was called without `expiresIn`, producing tokens that never expire. Added `expiresIn: "7d"`.

### MED-9: Steam overlay path never matched
**File**: `src/index.ts`  
Check was `req.path.startsWith("/services/session/steam/overlay/")` but Express strips the `/services` prefix inside `ServiceRouter`, so the path starts with `/session/...`. Check corrected.

### HIGH-2: Party/roster writes not validated
**File**: `src/services/account.ts`  
`POST /account/update` was writing whatever was passed for `party.ids` and `roster.defs` directly to the DB without checking that they are arrays. Now returns 400 if either is present but not an array.

### HIGH-8: Re-login didn't evict existing session
**File**: `src/services/auth/auth.ts`  
A second login with the same `user_id` would create a new session while the old one remained in the map. Now evicts any existing session for the `user_id` before creating the new one.

### Fix #7: Duplicate queue entries allowed
**File**: `src/services/queue.ts`  
A player could queue multiple times with different `match_handle` values. Now returns 409 if the player's `user_id` is already present in the queue.

### Fix #15: Matchmaking ignored power level
**File**: `src/services/queue.ts`  
`matchmaking()` only filtered by `type`, so players with different power levels could be matched. Now filters by both `type` AND `power`.

### NEW-2: Account update DB failures not caught
**File**: `src/services/account.ts`  
DB writes in `POST /account/update` were not wrapped in error handling. A DB failure would propagate as an unhandled rejection with no 500 sent to the client. Now wrapped in try/catch.

### NEW-3: Missing lboard.json crashed server
**File**: `src/services/game.ts`  
`readFileSync("./data/lboard.json")` at the module level (inside a route handler) would throw and crash the server if the file was missing. Now wrapped in try/catch — returns 500 instead.
