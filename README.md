# Banner Saga Factions Custom Server

A typescript project to reverse engineer and emulate the Banner Saga Factions offical game servers.

---

## Work Flow

I use [Fiddler Classic](https://www.telerik.com/fiddler/fiddler-classic) to capture game network data and then reference that to see what is sent between game server and client. I've uploaded captures (some partial, some complete) from 3 different matches to [`data/game_captures/`](/data/game_captures/).

It can also be useful to look at the client side code to see how the recieved data is handled to understand what its for and also to see where the data comes from that is sent to the server. The game client code can be viewed using [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler)

And finally if you see nothing wrong on the server and no errors in network traffic it can be useful to check the client logs which, on Windows, are located in `%AppData%/TheBannerSagaFactions\Local Store\logs` with `A-0.log.txt` being the most recent session logs.

If anyone would like to contribute feel free to make a PR with your contribution and can update this README marking off what you did or tagging it as work in progress **[WIP]** if not complete. Any help would be greatly appreciated. You can find me on Discord in the [Banner Saga Discord Server](https://discord.gg/Jf3FNpV8gv) as `@Pieloaf#1999`

---

### Note: 
Before contributing, bear in mind this was not thought about very well before starting. As a result some of the data sharing between modules could use some refactoring and clean up, so thats also a task to be done but its not a part of the functionality of the game so its not on the main list. If some of the data handling seems bad or inefficient feel free to open an issue or make a PR with a fix.

---

## Task List

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
    - [ ] Sync Clients :large_orange_diamond: **[WIP - Pieloaf]** 
    - [ ] Handle Actions and Movement :large_orange_diamond: **[WIP - Pieloaf]**
    - [ ] Handle Match End :large_orange_diamond:
    - [ ] In Battle Chat :large_blue_diamond:
    - [ ] Handling Surrenders/Disconnects/Unusual behaviour :question:
- [ ] Other
  - [ ] Proving Grounds
    - [ ] Changing Party :large_blue_diamond:
    - [ ] Upgrading Units :large_blue_diamond:
  - [ ] Mead House
    - [ ] Purchasing New Units :large_blue_diamond:
  - [ ] Great Hall
    - [ ] Weekly Tournament :red_circle:
    - [ ] Map Rotation :large_blue_diamond:
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




