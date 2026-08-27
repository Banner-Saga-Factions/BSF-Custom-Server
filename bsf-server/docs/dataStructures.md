# Data Structures

There are soooo many different data structures, so this will be WIP for a long long time.
This is how the data is structured when sent between the client and server, although the internal client and server representation can be different. You can get an idea of how the server structures the data by looking at the source code with a [flash decompiler](../README.md#data-sources)

> **The same data seen from the client.** What the game client *does* with these shapes once it receives them — how a unit definition, its class template, and the loader that pairs them fit together — is in `bsf-client/docs/data-model.md` ([local](../../bsf-client/docs/data-model.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/data-model.md)). That doc cites this one for the wire shapes; this is the return trip.

---
## `party`:
 - `ids`: `Array<string>` An array of strings containing battle unit ids.

 The server caps `party.ids.length` at 6 and rejects unknown IDs (must exist in the player's roster) — see `POST /account/update` validation in `src/services/account.ts`.

 e.g.
 ```JSON
 "party": {
    "ids": [
        "raider_start_0",
        "thrasher_start_0",
        "archer_start_0",
        "shieldbanger_start_0",
        "warrior_exp_0",
        "archer_start_1"
    ]
}
```
---
## `tiles`
An array of JSON objects, each with an x and y field denoting a units position on the board
- `class`: `tbs.srv.battle.data.Tile` Indicates data type
- `x`: `int` indicates units x position on board
- `y`: `int` indicates units y position on board

---
## `PurchasableUnitData`:
- `class`: `tbs.srv.data.PurchasableUnitsData` Indicates Data Type
- `id`: `string` Really not sure here. In my sample data it's always `global`, so maybe it indicates the availability of the units? i.e. global means available to all players? **To be investigated**
- `units`:  `Array<JSON>` Array of PurchasableUnit JSON objects
  - `class`: `tbs.srv.data.PurchasableUnitData` Indicates Data Type
  - `cost`: `int` Unit purchase cost in renwon
  - `def`: `JSON` EntityDef JSON object describing the unit [see EnitityDef](#entitydef)
  - `limit`: `int` Indicates how many times the unit can be purchased

e.g.
```JSON
"purchasable_units": {
    "class": "tbs.srv.data.PurchasableUnitsData",
    "units": [{
        "class": "tbs.srv.data.PurchasableUnitData",
        "def": {
            "class": "tbs.srv.data.EntityDef",
            "id": "archer",
            "entityClass": "archer",
            "autoLevel": 1.0,
            "stats": [
                ...
            ],
            "start_date": 0,
            "appearance_acquires": 0,
            "appearance_index": 0
        },
        "limit": 0,
        "cost": 10
    },
    ...
    ],
    "id": "global"
}
```
---
## `EntityDef`:
- `class`: `tbs.srv.data.EntityDef` Indicates data type
- `id`: `thrasher_start_0` The id of the unit
- `entityClass`: `thrasher` The class/type of unit
- `name`: `string` Display name of the unit (e.g. `Thales`). **Required** — the client silently renders a blank unit if `name` is absent. Verified against `data/game_captures/extracted/raw/0058_s.txt`. See [Development.md → Key Gotchas](./Development.md#key-gotchas-for-new-developers).
- `stats`: `Array<JSON>` Array of stat types defining the units stats
    - `class`: `tbs.srv.data.Stat`Indicates data type
    - `stat`: `string `String indicating the stat category the value corresponds to. One of [`RANK`, `RANGE`, `EXERTION`, `ABILITY_0`, `WILLPOWER`, `MOVEMENT`, `ARMOR_BREAK`, `STRENGTH`, `ARMOR`]
      - `KILLS` and `BATTLES` also appear in capture `0058_s.txt`; recommend extending the list.
    - `value`: `int` The value of the given stat
- `start_date`: `int` Epoch timestamp of the date the unit was first added to the players roster,
- `appearance_acquires`: `int` No idea what this does. **To be investigated**
- `appearance_index`: `int` No idea what this does. **To be investigated**

e.g.
```JSON

"defs": [{
    "class": "tbs.srv.data.EntityDef",
    "id": "thrasher_start_0",
    "entityClass": "thrasher",
    "stats": [
        {
            "class": "tbs.srv.data.Stat",
            "stat": "RANK",
            "value": 2
        },
        {
            "class": "tbs.srv.data.Stat",
            "stat": "RANGE",
            "value": 1
        },
        ...
    ]}
]
```

## `BattlePartyData`:
- `class`: `tbs.srv.battle.data.BattlePartyData` Indicates data type
- `user`: `int` User id for the relevant party
  - This is the **32-bit `account_id`**, not the 64-bit Steam ID. Both clients must agree on this value or the DJB hash diverges at turn 0. See [ARCHITECTURE.md → Key Design Decisions](./ARCHITECTURE.md#key-design-decisions).
- `team`: `string` String of the user id. I think the functionality for the team name was never fully implemented and so this field is unused.
- `display_name`: `string` String indicating the users display name
- `defs` : `Array<EntityDef>` An array of [EntityDefs](#entitydef), defining the parties units
  - The `stats` inside these defs are **what both players fight with** (measured 2026-08-21) — editing one here silently changes the battle for both sides, so they must be the roster's own numbers. Full explanation in [`../.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).
- `match_handle`: The match handle for the users current battle
- `party_index`: `int` I've only seen this as either 1 or 0 so I think it indicates which party is first or second to move, although I'm not 100% sure. **To be investigated**
- `elo`: `int` The users elo rating. 0 for quick play, not sure if its set for tournament play. **To be investigated**
- `power`: `int` The power level of the users party
- `session_key`: `int` Really no idea what this is since it doesnt match with the users session key in the requests. Although maybe its the session key encoded as an `int` since normally the session key is a hex string in the requests? but the number seems a little bit small. **To be investigated**
- `battle_count`: `int` The number of battles played by a user
- `timer`: `int` The time in seconds the user has per turn (Thanks Stef! 🙂).
  - This server emits `30` for `parties[0]` and `45` for `parties[1]` to match the reference capture (`0058_s.txt`).
- `tourney_id`: `int` Tournament id; `0` for quick play. Not sure if data changes if it is a tournament.  **To be investigated**
- `vs_type`: `string` The game mode of the battle. One of [`QUICK`, `RANKED`, `TOURNEY`]

```JSON
{
  "class": "tbs.srv.battle.data.BattlePartyData",
  "user": 343275,
  "team": "343275",
  "display_name": "Stef",
  "defs": [
    {
      "class": "tbs.srv.data.EntityDef",
      ...
    }, 
    ...
  ],
  "match_handle": 1,
  "party_index": 0,
  "elo": 0,
  "power": 6,
  "session_key": 3019478832626556667,
  "battle_count": 1212,
  "timer": 30,
  "tourney_id": 0,
  "vs_type": "QUICK"
}
```

## `BattleCreateData`: 
- `class`: `tbs.srv.battle.data.BattleCreateData` Indicates data type
- `reliable_msg_id`: `string` String formated as `{battle_id}_create` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` always seems to be null for BattleCreateData **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` Always 0 for BattleCreateData
- `battle_id`: `string` Unique battle id. Formatted as a hexadecimal string, split with `:` after 11 and 16 bytes (not sure if this matter though).  **To be investigated**
  - This server generates the id as 80 random bits; the `:` segmentation appears to be cosmetic — clients accept it as an opaque string.
- `parties`: `Array<BattlePartyData>` An array of data describing each each party in battle. See [BattlePartyData](#battlepartydata)
- `scene`: `string` Indicates the map to be used for the battle. This server always emits `"greathall"` (matches reference capture `0058_s.txt`; the value is hardcoded, not chosen by mode).
- `friendly`: `Boolean` indicates if a match is a friendly game (via steam friends system I think). Not sure if data changes if `true`. **To be investigated**
- `tourney_id`: `int` Tournament id; `0` for quick play. Not sure if data changes if it is a tournament.  **To be investigated**

```JSON
{
  "class": "tbs.srv.battle.data.BattleCreateData",
  "reliable_msg_id": "1840430f2a3:53ceb:47bda_create",
  "reliable_msg_target": null,
  "timestamp": 1666517627555,
  "user_id": 0,
  "battle_id": "1840430f2a3:53ceb:47bda",
  "parties":[
    {
      "class": "tbs.srv.battle.data.BattlePartyData",
      ...
    },
    ...
  ],
  "scene": "greathall",
  "friendly": false,
  "tourney_id": 0

}
```

## `BattleReadyData`
- `class`: `tbs.srv.battle.data.client.BattleReadyData` Indicates data type
- `reliable_msg_id`: `string` String formated as `{battle_id}_ready_{user_id}` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` always seems to be null for BattleReadyData **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` User id of the user whose client is prepared to start battle
- `battle_id`: `string` Unique battle id. Formatted as a hexadecimal string, split with `:` after 11 and 16 bytes (not sure if this matter though).  **To be investigated**

```JSON
{
  "class":"tbs.srv.battle.data.client.BattleReadyData","reliable_msg_id":"1840430f2a3:53ceb:47bda_ready_343275",
  "reliable_msg_target":null,
  "timestamp":1666517657828,
  "user_id":343275,
  "battle_id":"1840430f2a3:53ceb:47bda"
}
```

## `BattleDeployData`
- `class`: `tbs.srv.battle.data.client.BattleDeployData`
- `reliable_msg_id`: `string` String formated as `{battle_id}_deploy_{user_id}` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` always seems to be null for BattleDeployData **To be investigated**
- `tiles`: Array of JSON objects, each with an x and y field denoting the unit position on the map (see [`tiles`](#tiles)). I assume the order of the tiles maps to the order of units in the [`party`](#party) array.
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` User id of the user whose client has deployed its units

```JSON
{
  "class": "tbs.srv.battle.data.client.BattleDeployData",
  "reliable_msg_id": "1840430f2a3:53ceb:47bda_deploy_343275",
  "reliable_msg_target": null,
  "timestamp": 1666517707879,
  "user_id": 343275,
  "battle_id": "1840430f2a3:53ceb:47bda",
  "tiles": [
    ...
  ]
}
```

## `BattleSyncData`
- `class`: `tbs.srv.battle.data.client.BattleSyncData` Indicates data type
- `reliable_msg_id`: `string` String formated as `{battle_id}_sync_{user_id}_{turn_number}` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` Not sure if this ever not null for BattleSyncData, haven't looked at it enough. **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` User id of the user who has posted it's sync data
- `battle_id`: `string` Battle id for the relevant battle
- `entity`: `string` String composed of user id, some number (idk), and unit name. Indicates what units turn it currently is. **To be investigated**
  - Format is `{user_id}+{index}+{unit_id}`, where `{index}` is the unit's position in the owning party's `defs[]` array. Both clients must produce identical entity strings or the DJB hash diverges — see [gameFlow.md → Sync](./gameFlow.md#sync).
- `turn`: `int` Turn number of the battle
- `ordinal`: `int` Indicates the action number in the turn. Sync message always has ordinal 0 as it indicates the start of a new turn
- `hash`: `int` Both clients generate a hash. The server relays each side's sync message to the opponent without computing or validating the hash itself. The hash is a DJB hash on the hash string which is composed of game data. More info [here](https://github.com/Pieloaf/BSF-Custom-Server/issues/2). Verified in `src/services/battle/Battle.ts` (`/battle/sync` handler is a pass-through).
- `team`: `string` String of the user id. I think the functionality for the team name was never fully implemented and so this field is unused.
- `hash_str`: `string` Seems to always be null in the sent data, but is used to generate the hash itself. See [here](https://github.com/Pieloaf/BSF-Custom-Server/issues/2#issuecomment-1321164727) for more.

```JSON
{
    "class": "tbs.srv.battle.data.client.BattleSyncData",
    "reliable_msg_id": "1840430f2a3:53ceb:47bda_sync_343275_0",
    "reliable_msg_target": null,
    "timestamp": 1666517707873,
    "user_id": 343275,
    "battle_id": "1840430f2a3:53ceb:47bda",
    "entity": "343275+0+axeman_exp_4",
    "turn": 0,
    "ordinal": 0,
    "hash": -1686485492,
    "team": "343275",
    "hash_str": null
}
```

## `BattleMoveData`
- `class`: `tbs.srv.battle.data.client.BattleMoveData` Indicates data type
- `reliable_msg_id`: `string` String formated as `{battle_id}_move_{user_id}_{turn_number}` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` Not sure if this ever not null for BattleSyncData, haven't looked at it enough. **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` User id of the user who has posted it's sync data
- `battle_id`: `string` Battle id for the relevant battle
- `entity`: `string` String composed of user id, some number (idk), and unit name. Indicates what units turn it currently is.
- `turn`: `int` Turn number of the battle
- `ordinal`: `int` Indicates the action number in the turn.
- `tiles`: Array of JSON objects, each with an x and y field denoting the unit position on the map (see [`tiles`](#tiles)).

```JSON
{
    "class": "tbs.srv.battle.data.client.BattleSyncData",
    "reliable_msg_id": "1840430f2a3:53ceb:47bda_sync_343275_5",
    "reliable_msg_target": null,
    "timestamp": 1666517707873,
    "user_id": 343275,
    "battle_id": "1840430f2a3:53ceb:47bda",
    "entity": "343275+0+axeman_exp_4",
    "turn": 5,
    "ordinal": 1,
    "tiles": [
      ...
    ]
}
```

## `BattleActionData`
- `class`: `tbs.srv.battle.data.client.BattleActionData` Indicates data type
- `reliable_msg_id`: `string` String formated as `{battle_id}/{user_id}/{turn_number}` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` Not sure if this ever not null for BattleSyncData, haven't looked at it enough. **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` User id of the user who has posted it's sync data
- `battle_id`: `string` Battle id for the relevant battle
- `entity`: `string` String composed of user id, some number (idk), and unit name. Indicates what units turn it currently is.
- `turn`: `int` Turn number of the battle
- `ordinal`: `int` Indicates the action number in the turn.
- `tiles`: Array of JSON objects, each with an x and y field denoting the unit position on the map, if changed (see [`tiles`](#tiles)).
- `terminator`: `boolean` Indicates if action ends the current turn.
- `action`: `string` Indicates the executed action.
- `executed_id`: `int` No idea what this is, always seems to be 0. **To be investigated**
- `level`: `int` Assuming its the level of the unit but I have no idea where that comes from . **To be investigated**
- `target_ids`: `Array<strings>` An array of entity ids that the action targets

```JSON
{
    "class": "tbs.srv.battle.data.client.BattleActionData",
    "reliable_msg_id": "1840430f2a3:53ceb:47bda/293850/23",
    "reliable_msg_target": null,
    "timestamp": 1666517707873,
    "user_id": 293850,
    "battle_id": "1840430f2a3:53ceb:47bda",
    "entity": "293850+2+archer_start_0",
    "turn": 23,
    "ordinal": 2,
    "executed_id": 0,
    "level": 1,
    "terminator": true,
    "tiles": [
      ...
    ],
    "target_ids": [
      "343275+4+archer_exp_1"
    ],
}
```

## `BattleKilledData`
- `class`: `tbs.srv.battle.data.client.BattleActionData` Indicates data type
  - Yes, this is intentional in the original protocol — `BattleKilledData` reuses the `BattleActionData` class string. The route (`/battle/killed`) is what distinguishes it.
- `reliable_msg_id`: `string` String formated as `_killed_{user_id}_{killedparty}_{entity_id}` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` Not sure if this ever not null for BattleSyncData, haven't looked at it enough. **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` User id of the user who has posted it's sync data
- `battle_id`: `string` Battle id for the relevant battle
- `entity`: `string` Entity id of the unit that has been killed
- `turn`: `int` Turn number of the battle
- `ordinal`: `int` Indicates the action number in the turn.
- `killedparty`: `int` User id of the team whose unit has been killed.
  - The client sends this as a **string** in the request body; the server `Number(...)`s it before strict-equality comparison. Skipping the cast was a 0.2.0 bug where the wrong player was always declared winner — see [CHANGELOG.md → 0.2.0 endgame fixes](../CHANGELOG.md).
- `killer`: `string` Entity id of the unit that made the kill.
- `killerparty`: `int` User id of the team whose unit made the kill.

```JSON
{
    "class": "tbs.srv.battle.data.client.BattleActionData",
    "reliable_msg_id": "1840430f2a3:53ceb:47bda_killed_343275_293850_archer_start_0",
    "reliable_msg_target": null,
    "timestamp": 1666517707873,
    "user_id": 343275,
    "battle_id": "1840430f2a3:53ceb:47bda",
    "entity": "293850+2+archer_start_0",
    "turn": 23,
    "ordinal": 2,
    "killedparty": 293850,
    "killer": "warrior_vet_3",
    "killerparty": 343275
}
```

## `BattleQueryData`
A **request** the client POSTs to `services/battle/query/{session_key}` to recover messages it missed within a turn (e.g. after a dropped long-poll). The server does **not** reply with a distinct `BattleQueryData` class — it re-pushes every message stored for that turn back to the **requesting** session's own buffer, delivered on its next long-poll. Java DTO: `tbs.srv.battle.data.client.BattleQueryData`. Handler: `src/services/battle/Battle.ts` (`/query` route).
- `battle_id`: `string` Battle id for the player's current battle.
- `turn`: `int` Turn number being queried. Must be `>= 0` — the server returns `400` for a missing/negative/non-integer turn and `404` if that turn slot holds no messages.

```JSON
{
  "battle_id": "1840430f2a3:53ceb:47bda",
  "turn": 5
}
```
Response: `200 OK`, with the turn's stored `BattleMove`/`BattleAction`/`BattleSync` messages pushed to the caller's long-poll (each re-stamped with a fresh `timestamp`).

---

## `BattleSurrenderData`
Pushed to the **winner** (the side that did *not* surrender) the instant a player surrenders — sent **before** `BattleFinishedData` so the winner's client leaves its turn-state and transitions to the finish screen (`BattleFsm.as:273-289`). Without it the subsequent `BattleFinishedData` is dropped and the winner stays stuck on the battle screen. Produced by the shared `finalizeSurrender()` helper, reached from both `POST /battle/surrender` and `POST /battle/exit` (when the battle hasn't finished yet). Delivered on the long-poll. Java DTO: `tbs.srv.battle.data.client.BattleSurrenderData`.
- `class`: `tbs.srv.battle.data.client.BattleSurrenderData` Indicates data type.
- `reliable_msg_id`: `string` Formatted as `{battle_id}_surrender_{surrenderer_account_id}`.
- `reliable_msg_target`: `string` Always `null`.
- `timestamp`: `int` Epoch-ms timestamp of the message.
- `user_id`: `int` 32-bit `account_id` of the player who surrendered.
- `battle_id`: `string` Battle id for the relevant battle.
- `turn`: `int` Always `0`.
- `entity`: `string` Always `""` (empty).
- `ordinal`: `int` Always `0`.

```JSON
{
  "class": "tbs.srv.battle.data.client.BattleSurrenderData",
  "reliable_msg_id": "1840430f2a3:53ceb:47bda_surrender_343275",
  "reliable_msg_target": null,
  "timestamp": 1666517757828,
  "user_id": 343275,
  "battle_id": "1840430f2a3:53ceb:47bda",
  "turn": 0,
  "entity": "",
  "ordinal": 0
}
```

---

## `BattleExitData`
The client POSTs `services/battle/exit/{session_key}` to leave a battle. **This server does not emit a class-tagged `BattleExitData` push** — the route's reply is a plain JSON success object (not wrapped in the long-poll message envelope). If the battle had not already finished (`battle.winner` still `null`), `/exit` delegates to `finalizeSurrender()`, so the *opponent* receives a [`BattleSurrenderData`](#battlesurrenderdata) followed by [`BattleFinishedData`](#battlefinisheddata). Along with `/battle/surrender`, this is one of only two battle routes allowed to succeed after the opponent has disconnected. Java DTO (request): `tbs.srv.battle.data.client.BattleExitData`. Handler: `src/services/battle/Battle.ts` (`/exit` route).
- Request body: `battle_id`: `string`.
- Response:

```JSON
{ "status": "success", "battle_id": "1840430f2a3:53ceb:47bda" }
```

---

## `BattleFinishedData`
Pushed to **both** players at endgame to close out the match. It is sent **only after every endgame database write resolves**, so a client never sees a renown total that wasn't actually saved; if the writes fail, a fallback `BattleFinishedData` with `total_renown: 0` and an empty `rewards` array is sent instead (plus a chat line asking the player to report it). Produced by `endgame()` in `src/services/battle/Battle.ts`. Delivered on the long-poll. Java DTO: `tbs.srv.battle.data.client.BattleFinishedData`.
- `class`: `tbs.srv.battle.data.client.BattleFinishedData` Indicates data type.
- `reliable_msg_id`: `string` Formatted as `{battle_id}_finished_0`.
- `reliable_msg_target`: `string` Always `null`.
- `timestamp`: `int` Epoch-ms timestamp of the message.
- `user_id`: `int` Always `0`.
- `battle_id`: `string` Battle id for the relevant battle.
- `victoriousTeam`: `string` The winner's 32-bit `account_id` as a string. The winner is **server-derived** (the side still holding units), not read from any client-supplied `killerparty`.
- `total_renown`: `int` The **combined** renown of both players (winner + loser). Each player's own amount is in their `rewards` bundle below.
- `rewards`: `Array<BattleRewardData>` One [`BattleRewardData`](#battlerewarddata) per party, **indexed by `party_index`** — `rewards[0]` is the `party_index=0` player's bundle, `rewards[1]` the `party_index=1` player's. **Not** winner-first. The client reads its own bundle via `rewards[localBattleOrder]` where `localBattleOrder` is the local player's `party_index` (`BattleStateFinished.as:32`); filling slot `0` with the winner's bundle regardless of index makes a loser at `party_index=0` see the winner's bonus icons.

```JSON
{
  "class": "tbs.srv.battle.data.client.BattleFinishedData",
  "reliable_msg_id": "1840430f2a3:53ceb:47bda_finished_0",
  "reliable_msg_target": null,
  "timestamp": 1666517807879,
  "user_id": 0,
  "battle_id": "1840430f2a3:53ceb:47bda",
  "victoriousTeam": "343275",
  "total_renown": 28,
  "rewards": [
    { "class": "tbs.srv.battle.data.client.BattleRewardData", "...": "party_index 0 bundle" },
    { "class": "tbs.srv.battle.data.client.BattleRewardData", "...": "party_index 1 bundle" }
  ]
}
```

---

## `BattleRewardData`
A single player's reward bundle, carried inside [`BattleFinishedData`](#battlefinisheddata)`.rewards[party_index]`. Java DTO: `tbs.srv.battle.data.client.BattleRewardData`.
- `class`: `tbs.srv.battle.data.client.BattleRewardData` Indicates data type.
- `awards`: `JSON` A map of renown-award type → amount for this player, e.g. `{ "WIN": 5, "KILLS": 3, "UNDERDOG": 2 }`. Award types come from the renown calculator (`src/services/battle/renownAwards.ts`): **WIN**, **KILLS**, **UNDERDOG**, **EXPERT**, **STREAK** are implemented; **DAILY**, **BOOST**, **FRIEND** are deferred until their supporting data lands. Absent types simply aren't keyed.
- `achievements`: `JSON` Achievement-renown breakdown. Currently always `{}` (achievements aren't wired up).
- `total_renown`: `int` This player's own renown for the battle (sum of `awards`).
- `total_achievement_renown`: `int` Currently always `0`.

```JSON
{
  "class": "tbs.srv.battle.data.client.BattleRewardData",
  "awards": { "WIN": 5, "KILLS": 3 },
  "achievements": {},
  "total_renown": 8,
  "total_achievement_renown": 0
}
```

---

## `RenownMessage`
Pushed to each player alongside their [`BattleFinishedData`](#battlefinisheddata); drives the post-battle renown ticker. Each side gets its **own** amount (not the combined total). Produced by `endgame()`. Java DTO: `tbs.srv.util.RenownMsg`.
- `class`: `tbs.srv.util.RenownMsg` Indicates data type.
- `reliable_msg_id`: `string` Formatted as `renown_{account_id}_{timestamp}_{renown}`.
- `reliable_msg_target`: `string` Always `null`.
- `timestamp`: `int` Epoch-ms timestamp of the message.
- `total`: `int` This player's renown for the battle.
- `user_id`: `int` The player's 32-bit `account_id`.

```JSON
{
  "class": "tbs.srv.util.RenownMsg",
  "reliable_msg_id": "renown_343275_1666517807880_8",
  "reliable_msg_target": null,
  "timestamp": 1666517807880,
  "total": 8,
  "user_id": 343275
}
```

---

## `AchievementProgressData`
Pushed to **both** players at the start of endgame (before the database writes), one message per achievement type. **Placeholder today** — every `delta` is `0` and `total` is `1`; real achievement tracking is not yet implemented, so these exist only to keep the client's achievement UI from erroring. Produced by `endgame()`. Java DTO: `tbs.srv.util.AchievementProgressData`.
- `class`: `tbs.srv.util.AchievementProgressData` Indicates data type.
- `account_id`: `int` The player's 32-bit `account_id`.
- `session_key`: `string` Always `""` (blanked). These messages go to **both** players, so sending the real key would hand each one the other's auth token — the same leak class fixed for `BattleCreateData`. The client never reads this field.
- `achievement_type`: `string` One of `BATTLES`, `ELO`, `STREAK`, `UNIT_KILL`, `WINS`.
- `delta`: `int` Progress added this battle. Always `0` today.
- `total`: `int` Running total. Always `1` today.
- `acquired`: `Array` Newly-unlocked achievement tokens. Always `[]` today.
- `handle`: `string` Formatted as `{battle_id}.{index}.{account_id}.{achievement_type}`.
- `battle_id`: `string` Battle id for the relevant battle.

```JSON
{
  "class": "tbs.srv.util.AchievementProgressData",
  "account_id": 343275,
  "session_key": "",
  "achievement_type": "BATTLES",
  "delta": 0,
  "total": 1,
  "acquired": [],
  "handle": "1840430f2a3:53ceb:47bda.0.343275.BATTLES",
  "battle_id": "1840430f2a3:53ceb:47bda"
}
```

---

## `ServerStatusData`
Returned as the **HTTP response body** to `POST services/vs/start/{session_key}` — a one-element array containing a single `ServerStatusData` object. It is a direct POST response, **not** a long-poll push. (Matching `BattleCreateData`, when an opponent is immediately available, is delivered separately on each client's next `GET services/game/{session_key}`.) Java DTO: `tbs.srv.data.ServerStatusData`.
- `class`: `tbs.srv.data.ServerStatusData` Indicates data type.
- `session_count`: `int` Current number of active sessions (players online).

```JSON
[
  {
    "class": "tbs.srv.data.ServerStatusData",
    "session_count": 12
  }
]
```

---

## Friends list

Three messages, all delivered on the long poll (`GET services/game/{session_key}`). There is no friends
endpoint — the game never asks for the list, so the server sends one whenever the answer changes.

**The one rule that shapes all three:** the game's copy of the list **only ever grows**. It merges what
we send by id and has no way to delete an entry, so a name we have sent can never be taken off that
player's screen. Somebody who signs out is marked offline instead, which greys their row and stops
anyone inviting them.

### `FriendsData`

The whole list. Send the whole list every time — a shorter one is read as an addition, not a
replacement, so it silently leaves stale names in place.

- `class`: `tbs.srv.data.FriendsData`
- `friends`: `Array<FriendData>` Everyone signed in right now, except the recipient.

An **empty list is a real answer and worth sending.** Until the first `FriendsData` arrives the screen
reads *"waiting for friend list"* for ever; the empty one moves it to *"find a friend to battle"*.

Send one `FriendsData` per sign-in, from one place. [`data/first.json`](../data/first.json) used to
carry an empty one as well and no longer does — not because the stub broke anything (the friends screen
is rebuilt from the live list every time a player opens it, so both messages had merged long before
anyone could look), but because two sources for one list is a trap waiting for whoever edits either.

### `FriendData` — one entry

Three of these fields will break the screen rather than merely look wrong, and they are marked.

- `id`: `int` The friend's **32-bit `account_id`**. The game hands this exact value back as the target
  of `services/lobby/invite`, so it has to be the id their session is keyed on. **Keep it above zero** —
  anything else renders as a greyed "not a player" row with no win/loss shown. (The row stays clickable;
  only `online` blocks an invite.)
- `display_name`: `String` **Must not be null.** The game assigns it straight to a text field as it
  draws the row and throws on null, so the list stops drawing at that point.
- `online`: `Boolean` **Not decoration.** With `false` the row is greyed and the invite button answers
  *"X is currently offline"* and sends nothing at all, so the whole feature depends on this being right.
- `location`: `String | null` Which room they are standing in — `loc_great_hall`, `loc_friend_lobby`
  and so on (full list in [`serverEndpoints.md`](./serverEndpoints.md)). `null` shows as "unknown".
- `avatar128` / `avatar64` / `avatar32`: `String` A picture. **`avatar64` or `avatar32` must be a
  non-empty string** — the game's loader throws on an empty one, part-way down the list, and the row's
  own placeholder graphic is hidden during setup so a failed load leaves a blank square rather than a
  fallback. We send one shared path to an image the game already carries. `avatar128` is never read:
  the size-picking code has a bug that always falls through to `avatar64`.
- `steam_id`: `String` Sent empty. The original put the player's real Steam id here; we hold the
  equivalent but it identifies a person off-game to everyone signed in, and nothing on the row shows it.
- `wins` / `losses`: `int` Drawn as "3:1" beside the name. Sent as zeros for now — we do keep ranking
  rows, but ranked results are written to one tournament row and read from another (#198), so any
  record shown today would be wrong for exactly the players who have one.
- `last_battle_time`: `int` Unused by the row. Sent as zero.

```JSON
{
  "class": "tbs.srv.data.FriendsData",
  "friends": [
    {
      "id": 293850,
      "display_name": "Pieloaf",
      "location": "loc_friend_lobby",
      "online": true,
      "steam_id": "",
      "avatar128": "common/achievement/icons/friendmatch_achievement_icon.png",
      "avatar64": "common/achievement/icons/friendmatch_achievement_icon.png",
      "avatar32": "common/achievement/icons/friendmatch_achievement_icon.png",
      "wins": 0,
      "losses": 0,
      "last_battle_time": 0
    }
  ]
}
```

> **Never send `tbs.srv.data.FriendData` on its own.** The game handles that class, but for a name it
> already holds it builds a *fresh* object, fails to find that object in its own list, and writes to
> index −1. The list is growable — it throws because it is a **typed** list, where any out-of-range
> index is an error rather than a silent no-op. And the damage is worse than losing that message: the
> throw lands before both of the two places that re-arm the long poll, so **the client stops polling
> altogether**. The plural `FriendsData` is safe for both new and known names.

### `FriendOnlineData`

Flips one name between available and greyed, without resending the list. The game also prints
"*name* has logged in" or "*name* has logged out" into the global chat off the back of this — that
line is the game's own doing, not a chat message we send, and it is how a player waiting for company
learns somebody arrived without watching the friends screen.

- `class`: `tbs.srv.data.FriendOnlineData`
- `account_id`: `int` Whose row to change. (Note the name: this message says `account_id` where
  `FriendData` says `id`. Both are the same number; the original server was inconsistent and the game
  reads each by its own name.)
- `online`: `Boolean`

```JSON
{ "class": "tbs.srv.data.FriendOnlineData", "account_id": 293850, "online": false }
```

### `GameLocationData`

Updates the room shown beside one name. The game treats receiving this as proof that player is online
as well, which is correct — only a signed-in player reports a room.

- `class`: `tbs.srv.data.GameLocationData`
- `account_id`: `int`
- `location`: `String`

```JSON
{ "class": "tbs.srv.data.GameLocationData", "account_id": 293850, "location": "loc_mead_house" }
```

**One limitation worth knowing before you debug it.** A name that arrives while a player is *sitting
on* the friends screen lands in their copy of the list but paints no row — the game raises no event
for an appended name, only for a changed one. Leaving the screen and coming back redraws it. There is
no server-side fix; it is how the game is built.

---

## WIP

If you've been linked to this section it means the data structure has not yet been documented 🙃

---

*Last updated: 2026-08-27*
