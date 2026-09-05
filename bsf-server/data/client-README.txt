Banner Saga Factions — Community Server Client
==============================================

The game was removed from Steam. This archive preserves the original
client (Adobe AIR runtime included — no separate install required).

QUICK START
-----------
Extract this zip anywhere, then open a terminal in the extracted folder and run:

  "The Banner Saga Factions.exe" --steam true --steam_id 123456 --server http://localhost:8082/ --factions --developer

Replace 123456 with any unique number (this is your player ID).
Replace localhost:8082 with the server address if you are connecting remotely.

This command takes you to the main menu. Click the combat option there to
enter the town — that is one click, not a fault. The --developer option at
the end is what stops it going straight in, and in exchange it unlocks every
unit class in the mead house and the promotion screen.

TWO-PLAYER LOCAL TEST (same machine)
-------------------------------------
  "The Banner Saga Factions.exe" --steam true --steam_id 123456,293850 --server http://localhost:8082/ --factions --developer --username test,Pieloaf --versus_start --versus_countdown 0

This one goes straight to the match search and starts looking for an opponent
— it skips the town, because --versus_start is the last of the options that
decide where you land. It also cancels the --developer option before it, so a
two-player launch has none of the extra unit classes.

NOTE: The --versus_start and --versus_countdown 0 flags above are required
when running both clients on the same PC. Without them, one client will get
stuck on the battle loading screen because Windows can only run one copy of
the audio engine at a time — the second client falls back to silent mode and
the first one hangs waiting for a UI event that never fires.

SERVER
------
Self-host the server: https://github.com/Banner-Saga-Factions/BSF-Custom-Server

Requires Node.js 24 or newer. There is no database to install — it is built
into Node. Docker Compose setup included in the repo.

REQUIREMENTS
------------
- Windows (x86 or x64)
- No Steam account required
- No Adobe AIR installation required (runtime is bundled)
