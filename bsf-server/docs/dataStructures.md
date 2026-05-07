# Data Structures

There are soooo many different data structures, so this will be WIP for a long long time.
This is how the data is structured when sent between the client and server, although the internal client and server representation can be different. You can get an idea of how the server structures the data by looking at the source code with a [flash decompiler](../README.md#data-sources)

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

## WIP

If you've been linked to this section it means the data structure has not yet been documented 🙃

---

*Last updated: 2026-05-07*
