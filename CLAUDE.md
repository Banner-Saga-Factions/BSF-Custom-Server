# BSF Project Root Guide

## Repository Structure

- **Backend:** `./bsf-server` (Node.js/TypeScript)
- **Frontend:** `./bsf-client` (ActionScript/AIR)

## Coordination Protocol

1. **Verify Boundaries:** Before changing a server endpoint, search `bsf-client/src/` for the matching `URLLoader` or `URLRequest` to ensure the data structures match.
2. **Context Switching:** When focusing on a specific repo, use the internal `CLAUDE.md` within that directory for specific build/test commands.
3. **Database Truth:** The SQLite schema in `bsf-server/src/db/schema.sql` is the source of truth for all persistent data shared between client and server.
