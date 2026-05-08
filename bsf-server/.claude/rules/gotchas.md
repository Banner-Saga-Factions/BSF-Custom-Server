# Key Gotchas

- **`first.json` is cached at module load** — changes require server restart.
- **Session key `"11"`** is the hardcoded bypass for unauthenticated login — any other value requires a valid session.
- **Express strips the `/services` prefix** inside `ServiceRouter` — path checks must use `/session/...` not `/services/session/...`.
- **"News of the Banner" popup** is client-side, not server-triggered. Fix by copying `global_0.sol` → `global_1.sol` (patching byte 25 from `0x30` → `0x31`) in `%AppData%\TheBannerSagaFactions\Local Store\#SharedObjects\app.game.air.swf\`.
- `daily_login_streak` in the DB is **not auto-updated** by the server.
- `roster_rows` is kept in sync by `saveRoster()` — both `roster_json` and `roster_rows` are updated atomically in a single `UPDATE`.
- `accounts.json` is only used as a username fallback — all actual account data comes from MySQL.
- **32-bit account IDs in all in-game data**: `Session.account_id = user_id >= 76561197960265728 ? user_id - 76561197960265728 : user_id`. The original BSF server used small DB account IDs; the game client constructs entity strings as `{account_id}+{index}+{unit_id}`. Using full 64-bit Steam IDs causes each client to compute different entity strings for the same player, diverging the DJB state hash at turn 0. The login response, `party.user`, `team`, `user_id` in all battle messages, and `aliveUnits` keys all use `account_id`. The DB still stores the full 64-bit Steam ID (`session.user_id` / `steam_id_str`).
- **Session keys are 32 hex chars (128 bits)** since 2026-05-08 (issue #53). Pre-2026-05-08 sessions were 16 chars / 64 bits — don't write code that hardcodes the older width.
