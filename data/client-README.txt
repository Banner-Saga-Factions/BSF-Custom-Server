Banner Saga Factions — Community Server Client
==============================================

The game was removed from Steam in 2016. This archive preserves the original
client (Adobe AIR runtime included — no separate install required).

QUICK START
-----------
Extract this zip anywhere, then open a terminal in the extracted folder and run:

  "The Banner Saga Factions.exe" --steam true --steam_id 123456 --server http://localhost:8082/ --factions --developer

Replace 123456 with any unique number (this is your player ID).
Replace localhost:8082 with the server address if you are connecting remotely.

TWO-PLAYER LOCAL TEST (same machine)
-------------------------------------
  "The Banner Saga Factions.exe" --steam true --steam_id 123456,293850 --server http://localhost:8082/ --factions --developer --username test,Pieloaf --versus_start --versus_countdown 0

SERVER
------
Self-host the server: https://github.com/Banner-Saga-Factions/BSF-Custom-Server

Requires Node.js 18+ and MySQL 8. Docker Compose setup included in the repo.

REQUIREMENTS
------------
- Windows (x86 or x64)
- No Steam account required
- No Adobe AIR installation required (runtime is bundled)
