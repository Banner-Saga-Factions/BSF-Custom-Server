# Endpoints

These are all the server endpoints that the client makes requests to.

All endpoints are formatted as `services/{service name}/{some action}/{session key}`

There is a looooot of data so this will be very much WIP for a long time and subject to change as more of the data is understood.

## Auth Endpoints

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

## Account Endpoints

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
  `party`|`JSON`|Object containing user party data. For deatils see [`party`](./dataStructures.md#party)
  `purchaseable_units`|`JSON`|Object containing units availbale for the player to purchase. FOr details see [`PurchasableUnitData`](./dataStructures.md#purchasableunitdata)
  `purchases`|`?`|This field is empty in my reference data. Needs to be compared against other user data before making any conclusions. **To be investigated**
  `renown`|`int`| Amount of renown in user account
  `roster`|`JSON`|Object containing all users battle units. For details see [`roster`](./dataStructures.md#wip)
  `roster_rows`|`int`| My account data has `roster_row = 1` although I'm unsure if that can be upgraded or increase over time.  **To be investigated**
  `unlocks`|`?`|This field is empty in my reference data. Needs to be compared against other user data before making any conclusions. **To be investigated**

## Game Endpoints
  
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
  `boards`|`Array<JSON>`|An array of leaderboard objects. See [`LeaderboardData`](./dataStructures.md#wip)
  `class`|`tbs.srv.data.LeaderboardsData`|Indicates the data structure to the game client
  `max_entries`|`int`|Maximum number of leaderboard entries returned from the server

---
  ### Location

  `POST services/game/location/7bda00000e7454dd`
  
  Request
  
  This is one of the few endpoints that sends plaintext data.

```
data = {player current location} e.g. loc_strand, loc_greathall, loc_proving_grounds
```

  Response

  `200 OK`

---

  ### Session Data

  `GET services/game/{session_key}`

  Response

  The response to this data can be anything really. All thats certain is, if theres data its returned as an array; if there's no data the server responds with status 200. See the sections on [Data Structures](./data-structures) and [Typical Game Flow](./README.md#typical-game-flow) below for more information on what to expect as return data on the `game/{session_key}` endpoint.


## Queue Endpoints

  ### Join Queue

`POST services/vs/start/{session_key}`

  Request 

Key|Value|Description
---|---|---|
`match_handle`|`int`|The number of queue (or game, I'm not sure) for the current user session
`vs_type`|`string`|Indicates the game mode. One of [`QUICK`, `RANKED`, `TOURNEY`]
`tourney_id`|`int`|Tournament id; `0` for quick play
`party`|`JSON`|Object containing user party data. For deatils see [`party`](./dataStructures.md#party)
`timer`|`int`|Round timer in seconds. Default: `45` 

  Response

The reponse is an array containing a single JSON object with the following structure: 
Key|Value|Description
---|---|---|
`class`|`tbs.srv.data.ServerStatusData`|Indicates the data structure to the game client
`session_count`|`int`|Current number of sessions (i.e. number of players online)


---

### Cancel Queue

  `POST services/vs/cancel/{session_key}`

  Request

  Key|Value|Description
  ---|---|---|
  `match_handle`|`int`|Match handle of the queue being cancelled

  Response

  `200 OK`

## Battle Endpoints

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
  `tiles`|`Array<x,y>`|Array of JSON objects, each with an x and y field denoting the unit position on the map (see [`tiles`](./dataStructures.md#tiles)). I assume the order of the tiles maps to the order of units in the [`party`](./dataStructures.md#party) array.

  Response

  `200 OK`

--- 

### Battle Sync Route

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


