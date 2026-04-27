# Plan: New Developer Onboarding Improvements

## Context

Documentation cleanup was completed in the prior session (root README created, Development.md pruned, ARCHITECTURE.md updated, Community-Insights.md created). The remaining gap: a brand-new developer still faces friction — no single linear path from clone to first test, unannotated `.env.example`, no "gotchas" in developer-facing docs, and ARCHITECTURE.md doesn't explain *why* key design decisions were made. User approved 6 targeted fixes.

## Changes

### 1. Create `CONTRIBUTING.md` (new file, repo root)

Single-page linear onboarding: clone → prerequisites → `.env` → DB init → build → first test. Ends with a link to `docs/Development.md` for everything else.

Sections:
- Prerequisites (Node 18+, MySQL 8+, Yarn)
- Clone + install
- `.env` setup (with link to `.env.example`, note about JWT_SECRET being required)
- DB init (CREATE DATABASE + schema.sql command)
- Build + start (`yarn build` then `start-server.bat`)
- Verify with `test-2p-match.bat` (what passing output looks like)
- Where to go next (docs table linking to ARCHITECTURE.md, Development.md, etc.)

### 2. Annotate `.env.example`

Add inline comments to every variable:

```
# MySQL connection — default matches a local MySQL 8 install with no password
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=bsf

# REQUIRED — server throws at startup if missing. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=replace-with-a-strong-random-secret

# Optional — only needed if enabling Discord OAuth login path (currently ~90% implemented)
DISCORD_CLIENT_ID=your_discord_app_client_id
DISCORD_CLIENT_SECRET=your_discord_app_client_secret
DISCORD_REDIRECT_URI=http://localhost:8082/login/discord/oauth-callback
```

### 3. Add expected `test-2p-match.bat` output to `docs/Development.md`

The bat already has good self-labeling ([OK]/[FAIL]) but Development.md doesn't show a developer what a clean run looks like. Add a "Expected output (passing)" block in the Two-Player Local Test section showing the 6-step output truncated to key lines.

Location: `docs/Development.md` — inside the "Two-Player Local Test" section, after the Option B description.

### 4. Add "Key Gotchas for New Developers" section to `docs/Development.md`

CLAUDE.md already has these gotchas (for Claude Code). Surface the human-relevant subset in Development.md. Placement: after "Key Files to Know" table, before IDE Setup.

Gotchas to include:
- `first.json` cached at module load — changes require server restart (not just hot-reload)
- `start-server.bat` vs `yarn dev` — when to use each and why (stale builds)
- Session key `"11"` is the hardcoded login bypass — expected, not a bug
- 32-bit `account_id` vs 64-bit Steam ID — where each is used and why mixing them causes hash divergence
- `data/acc.json` is the default roster for new accounts — blank units usually means a missing `name` field here
- `session.accountData` is the in-memory truth during a session — DB writes are async but in-memory is updated immediately

### 5. Restructure `docs/Development.md` top-level section order

Current order is somewhat scattered. Reorder to match a developer's actual workflow:
1. Local Setup (already first — keep)
2. Testing (move up — currently after Build & Compile)
3. Debug Tips (keep near testing)
4. Build & Compile (move down — reference, not first thing)
5. Key Files to Know (keep)
6. Key Gotchas (new — add here)
7. Known Issues (keep near end)
8. Development Status (keep at end)
9. Useful Resources / IDE Setup / Troubleshooting (keep at end)

Note: This is a section reorder only — no content changes to individual sections beyond what's in items 3 and 4 above.

### 6. Add "Key Design Decisions" to `docs/ARCHITECTURE.md`

New subsection under the Overview, after the Original Stoic stack comparison table. Explains the *why* behind the three most surprising choices a new developer will encounter:

**Why HTTP long-polling instead of WebSockets?**
The game client is a Flash/AIR app compiled to speak HTTP. WebSockets require client-side code changes in ActionScript. Long-polling is the path of least resistance and handles the BSF player scale (dozens of concurrent users) fine.

**Why 32-bit `account_id` instead of full 64-bit Steam ID?**
The game client constructs entity ID strings as `{account_id}+{index}+{unit_id}` and both clients must produce identical strings to agree on the DJB hash. Original BSF used small DB account IDs; when the custom server passed full 64-bit Steam IDs, both clients computed different entity strings for the same player, diverging at turn 0. The fix: subtract the Steam base (76561197960265728) from any ID ≥ that value.

**Why in-memory sessions/battles instead of a persistent store?**
Simplicity for a small player base. The trade-off: server restart clears all active sessions and in-flight battles. Redis is the documented future path (see Future Improvements). Not worth the complexity now.

---

## Files Modified

| File | Action |
|---|---|
| `CONTRIBUTING.md` | Create (new) |
| `.env.example` | Edit — add inline comments |
| `docs/Development.md` | Edit — reorder sections, add gotchas, add test output |
| `docs/ARCHITECTURE.md` | Edit — add Key Design Decisions subsection |

## Verification

1. Read `CONTRIBUTING.md` top to bottom as a stranger — can you clone and get a passing `test-2p-match.bat` run following only that file?
2. `yarn build` — must compile clean (no file changes that touch `.ts` source)
3. `test-2p-match.bat` — should show 6 [OK] lines and the PASS banner
4. Diff `.env.example` — comments only, no value changes

---

*Created with [Claude Code](https://claude.ai/code)*
