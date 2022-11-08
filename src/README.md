# Development Notes
_The wind ceased and momentarily there was calm across the small seaside town, before signs of life began to show_

## Overview of Client <-> Server Data Flow

The client communicates with the server over HTTP(S). All request URLs end with the clients session key with the exception of the login and steam overlay requests. When the client has data to send to the server, it makes a POST request to a given route, in most cases the server responds with status 200 and no data however there are some exceptions, such as posting to the leaderboards route. To receive data which is not returned after making a POST request the client makes GET requests to the server every 2 seconds. If the server has new data for the client it is returned in the response otherwise the server responds with status 200 and no data. All data returned from the server is JSON formatted. All data sent to the server is JSON formatted with the exception of the location update and chat message send requests, these are plaintext strings.

## Routes

All URL routes are formatted as `services/{service name}/{some action}/{session key}`

There is a looooot of data so this will be very much WIP for a long time and subject to change as more of the data is understood.

<details>
  <summary>Auth Routes</summary>

  ### Login

  `POST services/auth/login/11`

  Request
  Key|Value|Description
  ---|---|---|
  `child_number` | `int` | No idea what this is. Possibly an index if two clients are running in the same window? `Unused`
  `client_config` | `JSON` | Client metadata (e.g. O.S., language, screen resolution) `Unused`
  `display_name` | `string` | User display name, set by the username launch argument. `Unused`
  `password` | `string` | Used for Virtual Bulletin Board (VBB) login on official servers. `Unused`
  `steam_auth_ticket` | `string` | Steam Authentication Ticket used for authentication via Steam on official servers. `Unused`
  `steam_id` | `int` | Users Steam ID. Can be overridden with launch arg `--steam_id`. `Used` for user authentication in this implementation
  `username` | `string` | Used for VBB login on official servers. `Unused`
  
  Response
  Key|Value|Description
  ---|---|---|
  `build_number`| `string`| Server build number. Using 1.10.51 as its the same as official servers.
  `display_name`| `string` | Display name used by game client.
  `session_key`|`string`|Session key for the user session. Included in all future requests.
  `user_id`|`int`|User ID number
  `vbb_name`|`string`|VBB name

---
  ### Logout

  `POST services/auth/logout/{session_key}`

  Request 
  Key|Value|Description
  ---|---|---|
  `steam_id` | `int` | Users Steam ID. `Unused`.
  `steam_ticket` | `string` | Steam Authentication Ticket used for authentication via Steam on official servers `Unused`
  
  Response
  
  `200 OK`
</details>

<details>
  <summary>Account Routes</summary>

  ### Account Info

  `GET services/account/info/{session_key}`

  Response
  Key|Value|Description
  ---|---|---|
  `completed_tutorial`|`boolean `|Indicates if the game client should start the first tutorial battle 
  `daily_login_bonus`|`int`| Renown bonus corressponding to daily login streak
  `daily_login_streak`|`int`| Number of consecutive days player logged in
  `iap_sandbox`|`boolean`| In App Purchases Sandbox. **To be investigated**
  `login_count`| `int` | Total user login count
  `party`|`JSON`|Object containing user party data. For deatils see [`party`](#party)
  `purchaseable_units`|`JSON`|Object containing units availbale for the player to purchase. FOr details see [`PurchasableUnitData`](#purchasableunitdata)
  `purchases`|`?`|This field is empty in my reference data. Needs to be compared against other user data before making any conclusions. **To be investigated**
  `renown`|`int`| Amount of renown in user account
  `roster`|`JSON`|Object containing all users battle units. For details see [`roster`](#)
  `roster_rows`|`int`| My account data has `roster_row = 1` although I'm unsure if that can be upgraded or increase over time.  **To be investigated**
  `unlocks`|`?`|This field is empty in my reference data. Needs to be compared against other user data before making any conclusions. **To be investigated**
</details>

<details>
  <summary>Game Routes</summary>
  
  ### Leaderboards

  `POST services/game/leaderboards/{session_key}`
    
  Request
  Key|Value|Description
  ---|---|---|
  `board_ids`|`Array<strings>`|List of leaderboard ids to request data from. Any of [`ELO`, `WINS`, `WINLOSS`, `TOTAL`, `BEST_WIN_STREAK`, `WIN_STREAK`]
  `tourney_id`|`int`|Tournament id; `0` for quick play
  
  Response
  Key|Value|Description
  ---|---|---|
  `boards`|`Array<JSON>`|An array of leaderboard objects. See [`LeaderboardData`](#)
  `class`|`tbs.srv.data.LeaderboardsData`|Indicates the data structure to the game client
  `max_entries`|`int`|Maximum number of leaderboard entries returned from the server

---
  ### Location

  `POST services/game/location/7bda00000e7454dd`
  
  Request
  
  This is one of the few routes that sends plaintext data.

```
data = {player current location} e.g. loc_strand, loc_greathall, loc_proving_grounds
```

  Response

  `200 OK`

---

  ### Session Data

  `GET services/game/{session_key}`

  Response

  The response to this data can be anything really. All thats certain is, if theres data its returned as an array; if there's no data the server responds with status 200. See the sections on [Data Structures](#data-structures) and [Typical Game Flow](#typical-game-flow) below for more information on what to expect as return data on the `game/{session_key}` route.


</details>
<details>
  <summary>Queue Routes</summary>

  ### Join Queue

`POST services/vs/start/{session_key}`

  Request 

Key|Value|Description
---|---|---|
`match_handle`|`int`|The number of queue (or game, I'm not sure) for the current user session
`vs_type`|`string`|Indicates the game mode. One of [`QUICK`, `RANKED`, `TOURNEY`]
`tourney_id`|`int`|Tournament id; `0` for quick play
`party`|`JSON`|Object containing user party data. For deatils see [`party`](#party)
`timer`|`int`|Round timer in seconds. Default: `45` 

  Response

The reponse is an array containing a single JSON object with the following structure: 
Key|Value|Description
---|---|---|
`class`|`tbs.srv.data.ServerStatusData`|Indicates the data structure to the game client
`session_count`|`int`|Current number of sessions (i.e. number of players online)


---

### Cancel Queue</summary>

  `POST services/vs/cancel/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `match_handle`|`int`|Match handle of the queue being cancelled

  Response

  `200 OK`

</details>

<details>
  <summary>Battle Routes</summary>

### Battle Ready Route

  `POST services/battle/ready/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle

  Response

  `200 OK`

--- 

### Battle Deploy Route

  `POST services/battle/deploy/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `tiles`|`Array<x,y>`|Array of JSON objects, each with an x and y field denoting the unit position on the map (see [`tiles`](#tiles)). I assume the order of the tiles maps to the order of units in the [`party`](#party) array.

  Response

  `200 OK`

--- 

### Battle Sync Route</summary>

   `POST services/battle/sync/{session_key}` 

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entities`|`Array`|Array of entites? This field seems to be always empty for sync requests. **To be investigated**
  `entity`|`string`|String composed of user id and enitity id, indicating a unit but not sure exactly what its purpose is. **To be investigated**
  `hash`|`int`|A unique hash generated by the client. Both clients generate the same new hash for each turn. Possibly used to validate the message? **To be investigated**
  `randomSampleCount`|`int`|No idea. **To be investigated**
  `team`|`string`|String of current turns team (just the user id). Not sure exactly what its for, possibly for validating the team whose turn it is, is agreed by both clients? **To be investigated**
  `turn`|`int`|Turn number

  Response

  `200 OK`

---

### Battle Query Route

   `POST services/battle/query/{session_key}` 

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `turn`|`int`|Turn number being queried

  Response

  `200 OK`

---

### Battle Move Route

  `POST services/battle/move/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entity`|`string`|String composed of user id and enitity id, indicating the unit to be moved
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn but not sure. **To be investigated**
  `tiles`|`Array<x,y>`|An array of JSON objects, each with an x and y field indicating the path take by the unit
  `turn`|`int`|Battle turn number

  Response

  `200 OK`

---

### Battle Action Route

  `POST services/battle/action/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `action`|`string`|Action name
  `entity`|`string`|String composed of user id and enitity id, indicating the unit to be moved
  `execution_id`|`int`|No idea **To be investigated**
  `level`|`int`|No idea **To be investigated**
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn but not sure. **To be investigated**
  `target_ids`|`Array<string>`|Array of entity ids targetted by the ability
  `terminator`|`Boolean`|Indicates if action ends current turn
  `tiles`|`Array<x,y>`|Indicates tiles moved by a unit, not exactly sure how its used in this case. May be relevant for something like `Run Through` **To be investigated**
  `turn`|`int`|Battle turn number
  `user_id`|`int`|User id for player carrying out action. I think this is always 0 in the request but should be set by the server using the `session_key` **To be investigated**

  Response

  `200 OK`

---

### Battle Killed Route

  `POST services/battle/killed/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entity`|`string`|Unit id indicating the killed unit
  `killedparty`|`int`|User id of the team whose unit has been killed
  `killer`|`string`|Unit id of the killing unit
  `killerparty`|`int`|User id of the team whose unit has made the kill
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn but not sure. **To be investigated**
  `turn`|`int`|Battle turn number
  `user_id`|`int`|User id for player carrying out action. I think this is always 0 in the request but should be set by the server using the `session_key` **To be investigated**

  Response

  `200 OK`


--- 

### Battle Exit Route

  `POST services/battle/exit/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `battle_id`|`string`|Battle id for players current battle
  `entity`|`string`|String composed of user id and enitity id. Always set to `NULL` on battle exit
  `ordinal`|`int`|Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn. Think it's always set to 0 for battle exit but not sure. **To be investigated** 
  `turn`|`int`|Battle turn number. Set to 0 on battle exit
  `user_id`|`int`|User id for player carrying out action. I think this is always 0 in the request but should be set by the server using the `session_key` **To be investigated**

  Response

  `200 OK`

</details>


## Typical Battle Flow

### Launching the game:
- POST to `services/auth/login/11`
- Session is created and the user is returned a session key used in all subsequent requests
- GET to `services/account/info/{session_key}`
  - Server returns user account data
- POST to `services/game/leaderboards/{session_key}` with leaderboard names to be returned
  - Leaderboard data sent in response
- POST to `services/game/location/{session_key}` with location data typically loc_strand assuming normal login
  - Server reponds with no data, not sure what it does with the location data (see sample data [here](../data/first.json))
- Client begins polling the server (every 2secs I think?) at `services/game/{session_key}`
  - On first request the client receives all queue information, currency configuration, tournament data and friend data.
  - Client continues to poll for data

### Chat messages:
While the client polls the server, if a chat message for the client is sent to the server, the client will recieve the message data on `services/game/{session_key}`.


If the player sends a message, the client POSTs to `services/chat/{room_name}/{session_key}`, the chat message is sent as a string; the server responds with no data but the message is broadcast to the relevant clients which they receive on `services/game/{session_key}`

See [some link here] for chat data structure

### Queueing:

- When the player enters the great hall to queue, the client POSTs to `services/game/location/{session_key}` with the message `loc_great_hall`
- When the player enters the queue for quick play, the client POSTs to `services/vs/start/{session_key}` with queue data (see [insert link here]).
  - The server responds with no data, but adds the client to the queue
- If the client leaves the queue without finding a match, a POST request is made to `services/vs/cancel/{session_key}` with the match handle to be cancelled, the server responds with no data and removes the client from the queue.
- If a match is found for the client, they are removed from the queue automatically.

When the queue is updated; either by adding or removing a client from the queue; it's broadcast to all players (except those in battle?). Each client receives the queue update on `services/game/{session_key}` as they poll the server.

See [some link here] for queue update data structure

### Party Change
When a player updates their party, the client POSTs the new party data to the server on `services/???/arrange/{session_key}` (I havent looked into this much so the URL is probably wrong but its something with "arrange" in it). The server responds with no data (and presumably updates the player party on the server.)

See [party data strucuture](#party) for details.

### Match Start Up

#### Match Found
- When a match is found for a client, it receives the data needed to create the battle on `services/game/{session_key}`, it mostly contains user data for the local and remote clients. 

  - See [BattleCreateData](#battlecreatedata) below

#### Loading into battle
- As the client loads the battle scene it POSTs to the server on `services/game/location/{session_key}` with the message `loc_battle`. The server responds with no data.

- Once the client has loaded the battle scene, it POSTs to the server on `services/battle/ready/{session_key}` with the battle id. 
  - See [Battle Ready Route](#battle-ready-route) above

- When the remote client (opponent) POSTs it's ready message to the server, the local client receives a battle ready message from the server on `services/game/{session_key}`.
  - See [BattleReadyData](#battlereadydata) below

#### Deployment
- Once both clients have sent and recieved each others ready messages, the client allows the players to configure their starting positions.

- When the player clicks `Ready` the client POSTs to `services/battle/deploy/{session_key}` with the battle id and tile configuration.
  - See [Battle Deploy Route](#battle-deploy-route) above

- When the remote client POSTs it's deploy data the local client receives the data on `services/game/{session_key}`.
  - See [BattleDeployData](#battledeploydata) below


### Match Play
#### Sync
- After both parties have deployed their units, the client sends POSTs to `services/battle/sync/{session_key}` with synchronisation data.
  - See [Battle Sync Route](#battle-sync-route) above
  - From all sample data I've looked at both parties have the same sync data. I'm not sure how the server handles a data mismatch. **To be investigated**
- The remote client also POSTs it's sync data and the local client receives the data on `services/game/{session_key}`.
  - See [BattleSyncData](#) below

As well as after unit deployment, client sync happens continuously through out a battle. I have not yet figured out what triggers it/how often its triggered,
#### Move
If the player moves a unit, the local client POSTs to `services/battle/move/{session/_key}` and if the opponent moves a unit the local client recieves the data on `services/game/{session_key}`
  - See [Battle Move Route](#battle-move-route) and [BattleMoveData](#) for details
#### Action 
If the player attacks or uses an ability the local client POSTs to `services/battle/action/{session/_key}` and if the opponent attacks or uses an ability, the local client recieves the data on `services/game/{session_key}`
  - See [Battle Action Route](#battle-action-route) and [BattleActionData](#) for details
#### Kill
If the player kills an enemy unit or the enemy kills a players unit, in both cases the local client POSTs to `services/battle/move/{session/_key}` and also receives the killed data on `services/game/{session_key}`. I think this is used to verify the kill?
  - See [Battle Killed Route](#battle-killed-route) and [BattleKilledData](#) for details
#### Query
This I'm very unsure of. From what I understand so far this request is made on each turn. It POSTs the battle ID and turn number to the server which responds with no data, but on the next request to `services/game/{session_key}` all action carried out on that turn are sent (even if previously received). It may be used to ensure it didnt miss any message during the turn?
  - See [Battle Query Route](#battle-query-route) for details.
#### End Game
I haven't look at this too much only breifly as I type this but at first glance it seems that when the last unit on a team is killed the server sends match complete data to the clients. This means the server needs to track the number of units in battle and the number of units alive on each time to be able to issue the data on one team being killed completely. Data is sent across a few different requests here, including achievement data, elo data, renown data and [BattleFinishedData](#). This is mostly just speculation.

After exiting the game a POST request is made to `services/game/location/{session_key}`. If the player is returning to strand the data is set to `loc_strand`. If the player selects to play again the data is set to `loc_versus` (see [Queuing](#queueing). Finally some data including the battle id, is sent to `services/battle/exit`.

## Data Structures

TODO: Decide how to properly lay this out and also describe all the data types (or at least the important ones)

---
### `party`:
 - `ids`: `Array<string>` An array of strings containing battle unit ids.
 
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
### `tiles`
An array of JSON objects, each with an x and y field denoting a units position on the board
- `class`: `tbs.srv.battle.data.Tile` Indicates data type
- `x`: `int` indicates units x position on board
- `y`: `int` indicates units y position on board

---
### `PurchasableUnitData`:
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
### `EntityDef`:
- `class`: `tbs.srv.data.EntityDef` Indicates data type
- `id`: `thrasher_start_0` The id of the unit
- `entityClass`: `thrasher` The class/type of unit
- `stats`: `Array<JSON>` Array of stat types defining the units stats
    - `class`: `tbs.srv.data.Stat`Indicates data type
    - `stat`: `string `String indicating the stat category the value corresponds to. One of [`RANK`, `RANGE`, `EXERTION`, `ABILITY_0`, `WILLPOWER`, `MOVEMENT`, `ARMOR_BREAK`, `STRENGTH`, `ARMOR`]
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

### `BattlePartyData`:
- `class`: `tbs.srv.battle.data.BattlePartyData` Indicates data type
- `user`: `int` User id for the relevant party
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

### `BattleCreateData`: 
- `class`: `tbs.srv.battle.data.BattleCreateData` Indicates data type
- `reliable_msg_id`: `string` String formated as `{battle_id}_create` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` always seems to be null for BattleCreateData **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` Always 0 for BattleCreateData
- `battle_id`: `string` Unique battle id. Formatted as a hexadecimal string, split with `:` after 11 and 16 bytes (not sure if this matter though).  **To be investigated**
- `parties`: `Array<BattlePartyData>` An array of data describing each each party in battle. See [BattlePartyData](#battlepartydata)
- `scene`: `string` Indicates the map to be used for the battle.
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
  "scene": "proving_grounds",
  "friendly": false,
  "tourney_id": 0

}
```

### BattleReadyData
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

### BattleDeployData
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

### BattleSyncData
- `class`: `tbs.srv.battle.data.client.BattleSyncData` Indicates data type
- `reliable_msg_id`: `string` String formated as `{battle_id}_sync_{user_id}_{turn_number}` Not exactly sure what it's used for  **To be investigated**
- `reliable_msg_target`: `string` Not sure if this ever not null for BattleSyncData, haven't looked at it enough. **To be investigated**
- `timestamp`: `int` Epoch timestamp of the message
- `user_id`: `int` User id of the user who has posted it's sync data
- `battle_id`: `string` Battle id for the relevant battle
- `entity`: `string` String composed of user id, turn number, and unit name. I think it indicates what units turn it currently is. **To be investigated**
- `turn`: `int` Turn number of the battle
- `ordinal`: `int` Number between 0 and 2, seems to increment for each request in a single turn and reset on next turn. **To be investigated** 
- `hash`: `int` Both client generate a new hash for each sync. Both clients generate the same hash. Presumably if the hashes are different the server is supposed to do something idk. Maybe the server also generates the same hash and if they differ from the server it acts as some form of anticheat. **To be investigated**
- `team`: `string` String of the user id. I think the functionality for the team name was never fully implemented and so this field is unused.
- `hash_str`: `string` Seems to always be null. Not sure what its for. Maybe was an alternate to the `hash` int but was never implemented? **To be investigated**

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
    "turn": 0,
    "hash_str": null
}
```