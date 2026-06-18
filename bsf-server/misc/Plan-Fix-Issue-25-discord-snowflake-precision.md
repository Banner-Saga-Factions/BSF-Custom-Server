# Plan: Fix #25 — Discord Snowflake IDs lose precision via `parseInt`
**Repo:** BSF-Custom-Server · **Labels:** bug, P1, security · **Complexity:** Medium

> **✅ RESOLVED 2026-06-18** (branch `fix/discord-snowflake-precision-25`). Shipped the recommended approach: the exact Discord ID string flows end-to-end, `Session.steam_id_str` was generalized to `external_id_str`, and `/session` derives the 32-bit in-game `account_id` via `BigInt(id) & 0x3fffffff`. Removed the `parseInt` precision-reject (M-6 stopgap) from both the OAuth callback and `/session`. (#34 — the `steam_id_str` imprecise init — was already closed in Wave 0/PR #127; this only generalizes that field to `external_id_str`.) Tests in `discord.test.ts` (exact-string round-trip + two-colliding-IDs → two accounts); build + suite green; a real-DB `/session` smoke test confirmed a 19-digit id persists intact.

## Problem
Discord Snowflakes can exceed `Number.MAX_SAFE_INTEGER`; `parseInt(decoded.discord_id, 10)` before `addSession` stores a lossy `session.user_id`, used for DB lookups. Two users could collide onto one account.

## Files likely to change
- `src/services/auth/discord.ts` — ~lines 96, 122.
- `src/services/auth/auth.ts` — `Session` (add `discord_id_str` or generalize `steam_id_str` → `external_id_str`); constructor (#34 overlaps here).
- `src/db/account.ts` — wherever the external id reaches account lookup/creation.

## Recommended approach
Keep IDs as strings end-to-end, mirroring `steam_id_str`. Prefer generalizing to `external_id_str` (one precise-identity field) over adding a parallel `discord_id_str`, unless Steam/Discord must coexist on one session. Fold in #34's constructor cleanup (initialize the precise string field once, at the point the original string exists).

## Tests
- Login with a >2^53 Snowflake string → session and DB row keyed on the exact string; round-trip preserves all digits.
- Two distinct large Snowflakes differing only in low bits → two distinct accounts.

## Sequencing
Before client #2 (Discord OAuth token auth) goes live to real users. Closes #34 as a side effect if done as above.
