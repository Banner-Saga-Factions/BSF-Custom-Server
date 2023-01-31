# Banner Saga Factions Custom Server

A project to reverse engineer and emulate the Banner Saga Factions offical game servers. Written in TypeScript

---

## Work Flow

### Data Sources

I use [Fiddler Classic](https://www.telerik.com/fiddler/fiddler-classic) to capture game network data and then reference that to see what is sent between game server and client. I've uploaded captures (some partial, some complete) from 3 different matches to [`data/game_captures/`](/data/game_captures/).

It can also be useful to look at the client side code to see how the recieved data is handled to understand what its for and also to see where the data comes from that is sent to the server. The game client code can be viewed using [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler)

And finally if you see nothing wrong on the server and no errors in network traffic it can be useful to check the client logs which, on Windows, are located in `%AppData%/TheBannerSagaFactions\Local Store\logs` with `A-0.log.txt` being the most recent session logs.

### Setup

After cloning the repo, run `npm i` in the repository directory to install dependencies.

### Testing
To start the server run `npm run run`. This will run the server with `ts-node-dev` which will automatically restart the server when you make changes.

To test the game against the custom server:
Launch the game from the `win32` subdirectory of your banner saga factions directory (e.g. `F:\Steam\steamapps\common\the banner saga factions\win32`)

Run this command to launch the game: `& '.\The Banner Saga Factions.exe' --steam --steam_id 293850,123456 --server http://localhost:3000 --username a,b`

Some More Launch Args:

| Launch Arguments    | Params                 | Explanation |
| ------------------- | ---------------------- |-------------|
| `--steam`| | Tells the game client to "use" steam even if steamworks isn't running (This is required to bypass some authentication checks)|
| `--factions`| | Should tell the game to launch into factions and not go to a weird menu although doesn't always work |
|`--stead_id`| Array<steam_id> | Overrides default steam id. Required to run game without steam. Note: Passing two comma separated steam_ids creates two game clients in the same window; very useful for testing. **Must have a matching number of user names.**
|`--username`| Array<user_name> | Required for loading multiple clients in a single window. Comma separated. |
|`--server`| Server URL | Used to point the game client to a different game server |
|`--developer`||Enable a developer overlay menu. (Doesn't work when playing on official servers.) |
|`--debug`||Enables debug logging (more verbose than default logging) |

There are many more launch arguments althought these are the ones required to use custom servers, bypass steam checks and open multiple game clients for testing. I may document the rest of the options at a later date.

### Banner Saga Factions Developer Overlay
![Banner Saga Factions Developer Overlay](https://user-images.githubusercontent.com/49878076/198406430-f9885dc1-6cf9-4a87-9203-414e10dd013a.png)

If anyone would like to contribute feel free to make a PR with your contribution and can update this README marking off what you did or tagging it as work in progress **[WIP]** if not complete. Any help would be greatly appreciated. You can find me on Discord in the [Banner Saga Discord Server](https://discord.gg/Jf3FNpV8gv) as `@Pieloaf#1999`

See development notes [here](docs/README.md)

---
## Task List

Game Functionality


- [ ] Core Functionality
  - [x] Pseudo Login System
    - placeholder until user database established 
  - [x] Global Chat
  - [x] Queueing
  - [ ] Dequeuing :large_blue_diamond:
  - [ ] Matchmaking :large_blue_diamond:
    - It works enough to get into game but needs a **lot** of work see [here](src/queue.ts)
  - [ ] Battle
    - [x] Ready Units
    - [x] Deplot Units
    - [x] Sync Clients
    - [x] Handle Actions and Movement
    - [ ] Handle Match End :large_orange_diamond:
    - [ ] In Battle Chat :large_blue_diamond:
    - [ ] Handling Surrenders/Disconnects/Unusual behaviour :question:
    - [ ] Map Rotation :large_blue_diamond:
- [ ] Other
  - [ ] Proving Grounds
    - [ ] Changing Party :large_blue_diamond:
    - [ ] Upgrading Units :large_blue_diamond:
  - [ ] Mead House
    - [ ] Purchasing New Units :large_blue_diamond:
  - [ ] Great Hall
    - [ ] Weekly Tournament :red_circle:
    - [ ] Friends Battles
       - This uses Steam's friends system so not sure what to do with this. Might be best just to leave it out as it is now, by just setting friend data to an empty array for all user accounts
  - [ ] Anticheat and Data Verification :shit:
  - [ ] Login Client :red_circle:
- [ ] Bonus
  - [ ] Map Selection :large_orange_diamond:
  - [ ] Local VS :large_orange_diamond:

---

### Difficulty Estimates

| Difficulty Estimate | Icon                   |
| ------------------- | ---------------------- |
| Easy                | :large_blue_diamond:   |
| Medium              | :large_orange_diamond: |
| Hard                | :red_circle:           |
| NO!                 | :shit:                 |
| Unkown              | :question:             |

Auxiliary Tasks
  
 In order of priority:

- Database Stuff
  - Setting up databases for user accounts, battles, sessions, game units, tournaments, etc... There's a lot 
  
- Documentation
  - which I have not done very well so far...
  
- Data Handling Refactoring
  - This was not thought about very well before starting and as a result some of the data sharing between modules could use some refactoring and clean up.



