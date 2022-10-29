# Development Notes
_The wind ceased and momentarily there was calm across the small seaside town, before signs of life began to show_

## Overview of Client <-> Server Data Flow

The client communicates with the server over HTTP(S). All request URLs end with the clients session key with the exception of the login and steam overlay requests. When the client has data to send to the server, it makes a POST request to a given route, in most cases the server responds with status 200 and no data however there are some exceptions, such as posting to the leaderboards route. To receive data which is not returned after making a POST request the client makes GET requests to the server every 2 seconds. If the server has new data for the client it is returned in the response otherwise the server responds with status 200 and no data. All data returned from the server is JSON formatted. All data sent to the server is JSON formatted with the exception of the location update and chat message send requests, these are plaintext strings.

## Routes

All URL routes are formatted as `services/{service name}/{some action}/{session key}`

There is a looooot of data so this will be very much WIP for a long time and subject to change as more of the data is understood.

<details>
  <summary>Auth Routes</summary>

  <details>
  <summary>Login</summary>

  `POST services/auth/login/11`

  ### Request
  Key|Value|Description
  ---|---|---|
  `child_number` | `int` | No idea what this is. Possibly an index if two clients are running in the same window? `Unused`
  `client_config` | `JSON` | Client metadata (e.g. O.S., language, screen resolution) `Unused`
  `display_name` | `string` | User display name, set by the username launch argument. `Unused`
  `password` | `string` | Used for Virtual Bulletin Board (VBB) login on official servers. `Unused`
  `steam_auth_ticket` | `string` | Steam Authentication Ticket used for authentication via Steam on official servers. `Unused`
  `steam_id` | `int` | Users Steam ID. Can be overridden with launch arg `--steam_id`. `Used` for user authentication in this implementation
  `username` | `string` | Used for VBB login on official servers. `Unused`
  
  ### Response
  Key|Value|Description
  ---|---|---|
  `build_number`| `string`| Server build number. Using 1.10.51 as its the same as official servers.
  `display_name`| `string` | Display name used by game client.
  `session_key`|`string`|Session key for the user session. Included in all future requests.
  `user_id`|`int`|User ID number
  `vbb_name`|`string`|VBB name
  </details>

  <details>
  <summary>Logout</summary>

  `POST services/auth/logout/{session_key}`

  ### Request 
  Key|Value|Description
  ---|---|---|
  `steam_id` | `int` | Users Steam ID. `Unused`.
  `steam_ticket` | `string` | Steam Authentication Ticket used for authentication via Steam on official servers `Unused`
  
  ### Response
  
  `200 OK`
  </details>
</details>

<details>
  <summary>Account Routes</summary>

  <details>
  <summary>Account Info</summary>

  `GET services/account/info/{session_key}`

  ### Response
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
  `roster`|`JSON`|Object containing all users battle units. For details see [`roster`](#nested-data-structures)
  `roster_rows`|`int`| My account data has `roster_row = 1` although I'm unsure if that can be upgraded or increase over time.  **To be investigated**
  `unlocks`|`?`|This field is empty in my reference data. Needs to be compared against other user data before making any conclusions. **To be investigated**
  </details>
</details>

<details>
  <summary>Game Routes</summary>
  
  <details>
  <summary>Leaderboards</summary>

  `POST services/game/leaderboards/{session_key}`
    
  ### Request
  Key|Value|Description
  ---|---|---|
  `board_ids`|`Array<strings>`|List of leaderboard ids to request data from. Any of [`ELO`, `WINS`, `WINLOSS`, `TOTAL`, `BEST_WIN_STREAK`, `WIN_STREAK`]
  `tourney_id`|`int`|Tournament id; `0` for quick play
  
  ### Response
  Key|Value|Description
  ---|---|---|
  `boards`|`Array<JSON>`|An array of leaderboard objects. See [`LeaderboardData`](#nested-data-structures)
  `class`|`tbs.srv.data.LeaderboardsData`|Indicates the data structure to the game client
  `max_entries`|`int`|Maximum number of leaderboard entries returned from the server

  </details>

  <details>
  <summary>Location</summary>

  `POST services/game/location/7bda00000e7454dd`
  
  ### Request
  
  This is one of the few routes that sends plaintext data.

```
data = {player current location} e.g. loc_strand, loc_greathall, loc_proving_grounds
```

  ### Response

  `200 OK`

  </details>

  <details>
  <summary>Session Data</summary>

  `GET services/game/{session_key}`

  ### Response

  The response to this data can be anything really. All thats certain is, if theres data its returned as an array; if there's no data the server responds with status 200. See the sections on [Nested Data Structures](#nested-data-structures) and [Typical Game Flow](#typical-game-flow) below for more information on what to expect as return data on the `game/{session_key}` route.

  </details>
</details>
</details>
<details>
  <summary>Queue Routes</summary>

<details>
  <summary>Join Queue</summary>

  `POST services/vs/start/{session_id}`

### Request 

Key|Value|Description
---|---|---|
`match_handle`|`int`|The number of queue (or game, I'm not sure) for the current user session
`vs_type`|`string`|Indicates the game mode. One of [`QUICK`, `RANKED`, `TOURNEY`]
`tourney_id`|`int`|Tournament id; `0` for quick play
`party`|`JSON`|Object containing user party data. For deatils see [`party`](#party)
`timer`|`int`|Round timer in seconds. Default: `45` 

### Response

The reponse is an array containing a single JSON object with the following structure: 
Key|Value|Description
---|---|---|
`class`|`tbs.srv.data.ServerStatusData`|Indicates the data structure to the game client
`session_count`|`int`|Current number of sessions (i.e. number of players online)


</details>

<details>
  <summary>Cancel Queue</summary>

  `POST services/vs/cancel/{session_id}`

  ## Request

  Key|Value|Description
  ---|---|---|
  `match_handle`|`int`|Match handle of the queue being cancelled

  ### Response

  `200 OK`

</details>
</details>

<details>
  <summary>Battle Routes</summary>

TODO: ready, deploy, sync, move, action...

</details>


## Typical Battle Flow

TODO: Describe the typically order of requests and data as a battle plays out

## Nested Data Structures

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
### `PurchasableUnitData`:
- `class`: `tbs.srv.data.PurchasableUnitsData` Indicates Data Type
- `id`: `string` Really not sure here. In my sample data it's always `global`, so maybe it indicates the availability of the units? i.e. global means available to all players? **To be investigated**
- `units`:  `Array<JSON>` Array of PurchasableUnit JSON objects
  - `class`: `tbs.srv.data.PurchasableUnitData` Indicates Data Type
  - `cost`: `int` Unit purchase cost in renwon
  - `def`: `JSON` EntityDef JSON object describing the unit [see EnitityDef](#)
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