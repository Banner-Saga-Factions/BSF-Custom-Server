# Typical Battle Flow

## Launching the game:
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

## Chat messages:
While the client polls the server, if a chat message for the client is sent to the server, the client will recieve the message data on `services/game/{session_key}`.


If the player sends a message, the client POSTs to `services/chat/{room_name}/{session_key}`, the chat message is sent as a string; the server responds with no data but the message is broadcast to the relevant clients which they receive on `services/game/{session_key}`

See [some link here] for chat data structure

## Queueing:

- When the player enters the great hall to queue, the client POSTs to `services/game/location/{session_key}` with the message `loc_great_hall`
- When the player enters the queue for quick play, the client POSTs to `services/vs/start/{session_key}` with queue data (see [insert link here]).
  - The server responds with no data, but adds the client to the queue
- If the client leaves the queue without finding a match, a POST request is made to `services/vs/cancel/{session_key}` with the match handle to be cancelled, the server responds with no data and removes the client from the queue.
- If a match is found for the client, they are removed from the queue automatically.

When the queue is updated; either by adding or removing a client from the queue; it's broadcast to all players (except those in battle?). Each client receives the queue update on `services/game/{session_key}` as they poll the server.

See [some link here] for queue update data structure

## Party Change
When a player updates their party, the client POSTs the new party data to the server on `services/???/arrange/{session_key}` (I havent looked into this much so the URL is probably wrong but its something with "arrange" in it). The server responds with no data (and presumably updates the player party on the server.)

See [party data strucuture](./dataStructures.md#party) for details.

## Match Start Up

### Match Found
- When a match is found for a client, it receives the data needed to create the battle on `services/game/{session_key}`, it mostly contains user data for the local and remote clients. 

  - See [BattleCreateData](./dataStructures.md#battlecreatedata) below

### Loading into battle
- As the client loads the battle scene it POSTs to the server on `services/game/location/{session_key}` with the message `loc_battle`. The server responds with no data.

- Once the client has loaded the battle scene, it POSTs to the server on `services/battle/ready/{session_key}` with the battle id. 
  - See [Battle Ready Route](./serverEndpoints.md#battle-ready-route) above

- When the remote client (opponent) POSTs it's ready message to the server, the local client receives a battle ready message from the server on `services/game/{session_key}`.
  - See [BattleReadyData](./dataStructures.md#battlereadydata) below

### Deployment
- Once both clients have sent and recieved each others ready messages, the client allows the players to configure their starting positions.

- When the player clicks `Ready` the client POSTs to `services/battle/deploy/{session_key}` with the battle id and tile configuration.
  - See [Battle Deploy Route](./serverEndpoints.md#battle-deploy-route) above

- When the remote client POSTs it's deploy data the local client receives the data on `services/game/{session_key}`.
  - See [BattleDeployData](./dataStructures.md#battledeploydata) below


## Match Play
### Sync
- After both parties have deployed their units, the client sends POSTs to `services/battle/sync/{session_key}` with synchronisation data.
  - See [Battle Sync Route](./serverEndpoints.md#battle-sync-route) above
  - A hash is calculated from the current game state information see [issue #2](https://github.com/Pieloaf/BSF-Custom-Server/issues/2). I'm not sure how the server handles an incorrect hash data mismatch. **To be investigated**
- The remote client also POSTs it's sync data and the local client receives the data on `services/game/{session_key}`.
  - See [BattleSyncData](./dataStructures.md#battlesyncdata) below

Sync is sent on a new turn starting, the client which just made a turn sends their sync message with a hash generated from the previous turn, and a turn number equal to the next turn. This is passed to the other client who then responds with their sync message. The server expects the same hash from both clients. The first sync is sent in response to the [deploy message](#deployment)
### Move
If the player moves a unit, the local client POSTs to `services/battle/move/{session/_key}` and if the opponent moves a unit the local client recieves the data on `services/game/{session_key}`
  - See [Battle Move Route](./serverEndpoints.md#battle-move-route) and [BattleMoveData](./dataStructures.md#wip) for details
### Action 
If the player attacks or uses an ability the local client POSTs to `services/battle/action/{session/_key}` and if the opponent attacks or uses an ability, the local client recieves the data on `services/game/{session_key}`
  - See [Battle Action Route](./serverEndpoints.md#battle-action-route) and [BattleActionData](./dataStructures.md#wip) for details
### Kill
If the player kills an enemy unit or the enemy kills a players unit, in both cases the local client POSTs to `services/battle/move/{session/_key}` and also receives the killed data on `services/game/{session_key}`. I think this is used to verify the kill?
  - See [Battle Killed Route](./serverEndpoints.md#battle-killed-route) and [BattleKilledData](./dataStructures.md#wip) for details
### Query
This I'm very unsure of. From what I understand so far this request is made on each turn. It POSTs the battle ID and turn number to the server which responds with no data, but on the next request to `services/game/{session_key}` all action carried out on that turn are sent (even if previously received). It may be used to ensure it didnt miss any message during the turn?
  - See [Battle Query Route](./serverEndpoints.md#battle-query-route) for details.
### End Game
I haven't look at this too much only breifly as I type this but at first glance it seems that when the last unit on a team is killed the server sends match complete data to the clients. This means the server needs to track the number of units in battle and the number of units alive on each time to be able to issue the data on one team being killed completely. Data is sent across a few different requests here, including achievement data, elo data, renown data and [BattleFinishedData](./dataStructures.md#wip). This is mostly just speculation.

After exiting the game a POST request is made to `services/game/location/{session_key}`. If the player is returning to strand the data is set to `loc_strand`. If the player selects to play again the data is set to `loc_versus` (see [Queuing](#queueing). Finally some data including the battle id, is sent to `services/battle/exit`.
