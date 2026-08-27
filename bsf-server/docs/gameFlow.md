# Typical Battle Flow

> **Its opposite number on the client is `game-flow.md`** ([local](../../bsf-client/docs/game-flow.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/game-flow.md)). Near-identical names, complementary content — read them together, not instead of each other. **This** file follows the *messages*: what gets sent, in what order, and what the server does with each one. **That** file follows the *game program*: the state machine that decides when to send them, and the index of which client class fires each route ("The actions"). Neither repeats the other.

## Launching the game:
- POST to `services/auth/login/11`
- Session is created and the user is returned a session key used in all subsequent requests
- GET to `services/account/info/{session_key}`
  - Server returns user account data
- POST to `services/game/leaderboards/{session_key}` with leaderboard names to be returned
  - Leaderboard data sent in response
- POST to `services/game/location/{session_key}` with the name of the room the player has walked into, typically `loc_strand` after a normal login
  - The server answers with an empty `200` and remembers the room, so it can show it beside that player's name on everyone else's friends screen (#91). The handler answers `200` before it inspects anything and never refuses, including for a room name it does not recognise — the room is advisory, so there is nothing worth refusing over.
- Client begins polling the server (every 2secs I think?) at `services/game/{session_key}`
  - On first request the client receives the queue information and the currency configuration. The friends list is sent separately, once sign-in finishes, because it is built from who is signed in at that moment (#91).
  - Client continues to poll for data
  - The first-poll bundle is sourced from [`data/first.json`](../data/first.json), which is read once at module load — changing that file requires a server restart. See [Development.md → Key Gotchas](./Development.md#key-gotchas-for-new-developers).

## Chat messages:
While the client polls the server, if a chat message for the client is sent to the server, the client will recieve the message data on `services/game/{session_key}`.


If the player sends a message, the client POSTs to `services/chat/{room_name}/{session_key}`, the chat message is sent as a string; the server responds with no data but the message is broadcast to the relevant clients which they receive on `services/game/{session_key}`

See [chat data structure](./dataStructures.md) for chat data structure 

## Queueing:

- When the player enters the great hall to queue, the client POSTs to `services/game/location/{session_key}` with the message `loc_great_hall`
- When the player enters the queue for quick play, the client POSTs to `services/vs/start/{session_key}` with queue data (see [Battle Start Route](./serverEndpoints.md#battle-start-route)).
  - The server responds with no data, but adds the client to the queue
- If the client leaves the queue without finding a match, a POST request is made to `services/vs/cancel/{session_key}` with the match handle to be cancelled, the server responds with no data and removes the client from the queue.
- If a match is found for the client, they are removed from the queue automatically.

When the queue is updated; either by adding or removing a client from the queue; it's broadcast to all players (except those in battle?). Each client receives the queue update on `services/game/{session_key}` as they poll the server.

See [queue update data structure](./dataStructures.md) for queue update data structure 

Queue entries also expire after 5 minutes of inactivity; a periodic sweep evicts stale entries and broadcasts the updated queue counts (see `src/services/queue.ts`).

## Party Change
When a player updates their party, the client POSTs the new party data to the server on `services/account/update/:session_key`. The server responds with no data and updates the player party. Proving Grounds operations (promote, rename, retire, hire, stat upgrade, barracks unlock) live under `/roster/*` — see [Roster routes](./serverEndpoints.md#proving-grounds--roster-management).

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
  - Each client computes a DJB hash of the current game state. The server relays each player's sync message to the opponent — it does **not** validate the hash itself. Both clients compare hashes independently; a mismatch surfaces as a "divergence" error in the game client.
- The remote client also POSTs its sync data and the local client receives the data on `services/game/{session_key}`.
  - See [BattleSyncData](./dataStructures.md#battlesyncdata) below

Sync is sent on a new turn starting: the client that just took a turn sends a sync message with a hash generated from that turn's state and a turn number equal to the next turn. The server relays it to the opponent, who responds with their own sync. The first sync fires in response to the [deploy message](#deployment).

**Why this matters for entity IDs:** The hash input includes entity ID strings formatted as `{account_id}+{index}+{unit_id}`. Both clients must use the same `account_id` to produce the same hash. This is why the server sends a 32-bit `account_id` (not the full 64-bit Steam ID) in all battle messages — if the IDs differ between clients, the hash diverges at turn 0 and the game shows a desync error.

**Client-side action validation:** The game client cross-checks each action with the opponent before registering damage server-side. A modded damage value will briefly appear in the local client but the game will crash or freeze when the opponent's acknowledgement doesn't match. This is enforced by the hash mechanism, not by the server.
### Move
If the player moves a unit, the local client POSTs to `services/battle/move/{session/_key}` and if the opponent moves a unit the local client recieves the data on `services/game/{session_key}`
  - See [Battle Move Route](./serverEndpoints.md#battle-move-route) and [BattleMoveData](./dataStructures.md#battlemovedata) for details
### Action 
If the player attacks or uses an ability the local client POSTs to `services/battle/action/{session/_key}` and if the opponent attacks or uses an ability, the local client recieves the data on `services/game/{session_key}`
  - See [Battle Action Route](./serverEndpoints.md#battle-action-route) and [BattleActionData](./dataStructures.md#battleactiondata) for details
### Kill
If the player kills an enemy unit or the enemy kills a players unit, in both cases the local client POSTs to `services/battle/killed/{session_key}` and also receives the killed data on `services/game/{session_key}`.
  - See [Battle Killed Route](./serverEndpoints.md#battle-killed-route) and [BattleKilledData](./dataStructures.md#battlekilleddata) for details
  - The server uses these messages to maintain `battle.aliveUnits` and to detect endgame: when the loser's `aliveUnits[user_id]` array reaches zero length, `endgame()` is invoked automatically from this endpoint — it drives the match-end transition, not just verification.
### Query
This I'm very unsure of. From what I understand so far this request is made on each turn. It POSTs the battle ID and turn number to the server which responds with no data, but on the next request to `services/game/{session_key}` all action carried out on that turn are sent (even if previously received). It may be used to ensure it didnt miss any message during the turn?
  - See [Battle Query Route](./serverEndpoints.md#battle-query-route) for details.
### End Game

When the last unit on a team is killed, `endgame()` is triggered automatically from the `/battle/killed` endpoint.

**Server-side flow**:
1. `battle.winner` is **server-derived** — set to the side still holding units (the opponent of the emptied party), **not** the client-supplied `killerparty` (#19). See [`battle-simulation.md`](./battle-simulation.md).
2. Kill counts computed from `aliveUnits`:
   - `winnerKills = loserParty.defs.length` (all loser units are dead)
   - `loserKills = winnerParty.defs.length − aliveUnits[winnerId].length`
3. Renown is computed by `computeRenownAwards()` — additive WIN/KILLS/UNDERDOG/EXPERT/STREAK bonuses, **not** a flat formula (see [`battle-simulation.md`](./battle-simulation.md) / `src/services/battle/renownAwards.ts`; the flat `20 + kills × 3` is now only the `BSF_RENOWN_LEGACY_FORMULA` rollback). New Elo is computed alongside renown.
4. DB writes (`Promise.all`): `addRenown()` for both players plus `saveBattle()` to the `battle` table; the client messages below are pushed only after these resolve
5. Server pushes to each player:
   - `AchievementProgressData` objects (one per `AchievementType` per player; deltas are placeholder 0s — full achievement tracking is future work)
   - `RenownMessage` with real `total` renown earned
   - `BattleFinishedData` with `victoriousTeam`, `total_renown`, and a `rewards[]` array containing KILLS and (for winner) WIN award entries

**Surrender path**: if `/battle/exit` is called while `battle.winner` is still `null`, the server declares the opponent the winner and runs the same `endgame()` flow above before cleaning up — both players still receive `BattleFinishedData` and renown.

After the match, the client POSTs to `services/game/location/{session_key}` — either `loc_strand` (return to menu) or `loc_versus` (rematch/re-queue). Then POSTs to `services/battle/exit/{session_key}` with the `battle_id` to clean up the battle server-side. The server responds with `{ "status": "success", "battle_id": "..." }`.

---

*Last updated: 2026-07-25*
