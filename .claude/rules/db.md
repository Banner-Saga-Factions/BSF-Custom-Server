---
paths:
  - "src/db/**"
---

# Database Rules

- Always use the `query<T>()` or `queryOne<T>()` helpers from `src/db/connection.ts`. Never access the raw mysql2 pool directly.
- `session.accountData` is the **in-memory source of truth** for the session lifetime. Update it immediately after any write — do not re-query the DB to refresh it.
- DB writes in endgame (`addRenown`, `saveBattleResult`) are fire-and-forget inside `Promise.all` — they must not block the response to the client.
- `saveRoster()` must update both `roster_json` and `roster_rows` in a single `UPDATE` statement — never update one without the other.
- The `accounts` table stores the full 64-bit Steam ID in `steam_id`. All in-game references use the 32-bit `account_id` (`steam_id - 76561197960265728` for Steam users).
