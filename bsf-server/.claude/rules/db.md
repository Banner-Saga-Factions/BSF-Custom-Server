---
paths:
  - "src/db/**"
---

# Database Rules

- Always use the `query<T>()` or `queryOne<T>()` helpers from `src/db/connection.ts`. Never access the raw mysql2 pool directly.
- `session.accountData` is the **in-memory source of truth** for the session lifetime. Update it immediately after any write — do not re-query the DB to refresh it.
- DB writes in endgame (`addRenown`, `saveBattleResult`) are fire-and-forget inside `Promise.all` — they must not block the response to the client.
- `saveRoster()`, `saveRosterAndSpendRenown()`, and `saveRosterAndParty()` update **only** `roster_json` (and renown/party_ids as applicable). They must **never** touch `roster_rows`. Only `expandBarracks()` and `upsertAccount()` may write `roster_rows` — it is barracks **capacity**, not unit count. Writing the unit count here silently reverts paid `/roster/unlock` expansions.
- The `accounts` table stores the full 64-bit Steam ID in `steam_id`. All in-game references use the 32-bit `account_id` (`steam_id - 76561197960265728` for Steam users).
