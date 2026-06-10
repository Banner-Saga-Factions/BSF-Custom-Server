# BSF Project Root Guide

## Repository Structure

- **Backend:** `./bsf-server` (Node.js/TypeScript)
- **Frontend:** `./bsf-client` (ActionScript/AIR, git submodule of `Banner-Saga-Factions/BSF-Client`)
- **Reference codebases:** `%USERPROFILE%\Code\bsf-refs\` (read-only, outside repo — see below)

## Coordination Protocol

1. **Verify Boundaries:** Before changing a server endpoint, search `bsf-client/src/` for the matching `URLLoader` or `URLRequest` to ensure the data structures match.
2. **Context Switching:** When focusing on a specific repo, use the internal `CLAUDE.md` within that directory for specific build/test commands.
3. **Database Truth:** The SQLite schema in `bsf-server/src/db/schema.sql` is the source of truth for all persistent data shared between client and server.

## Shell & Command Output

- The user's default shell is **PowerShell** (Windows). When suggesting commands for the user to run, write them in PowerShell-friendly form (e.g. `;` for sequencing instead of `&&`, `$env:VAR=...` for env vars).
- For long-running or verbose local-dev commands — `yarn build`, `yarn test`, `yarn dev`, `start-server.bat`, `yarn test:coverage` — **prompt the user to run them locally** and paste back relevant output, rather than invoking them via the Bash/PowerShell tool. This avoids loading multi-thousand-line compiler/test output into the conversation context.
- Continue running short, low-output commands directly: `sqlite3` queries, `git status`/`git log`, file edits, single-file `Read`/`Grep`, etc.

## Documentation Path Style

- In documentation (Markdown files, comments, READMEs, plans, changelog entries), write Windows paths using standard `%VARIABLE%` environment variables instead of hardcoded user-specific paths.
  - Good: `%USERPROFILE%\Code\bsf-refs\client-2013-as3`, `%APPDATA%\BSF`, `%LOCALAPPDATA%\...`
  - Bad: `C:\Users\rleyb\Code\bsf-refs\client-2013-as3`
- This keeps docs portable across machines/users and avoids leaking the current username into committed files.

## Cross-Repo Doc Links

When a Markdown link in one published repo (`bsf-server` or `bsf-client`) targets a file in the other, write it in **dual-link** form so it works locally (Ctrl+click in VS Code) **and** on github.com (where each repo is viewed in isolation, with no sibling on disk):

```
`<path>` ([local](<relative-path>) | [GitHub](https://github.com/Banner-Saga-Factions/<repo>/<blob|tree>/<branch>/<path>))
```

- **Why**: relative paths like `../../bsf-server/...` resolve under the parent BSF/ checkout but 404 on github.com — the standalone repo has no sibling.
- **`[local]`** keeps Ctrl+click navigation working in VS Code; **`[GitHub]`** is what github.com readers follow.
- **Files use `/blob/<branch>/`**; **directories use `/tree/<branch>/`**.
- **Branch is the _other_ repo's default**: `BSF-Custom-Server` → `main`, `BSF-Client` → `master`.
- If the file doesn't exist on the other side, drop the reference — don't ship a link that 404s in either context.

Example (from `bsf-client/docs/wire-protocol.md`):

```markdown
See `bsf-server/docs/protocol-cross-reference.md` ([local](../../bsf-server/docs/protocol-cross-reference.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/blob/main/bsf-server/docs/protocol-cross-reference.md)).
```

Reference: BSF-Client issue #6 / PR #10 converted the existing docs to this pattern.

## Reference Codebases

Read-only reference material lives outside the BSF repo at `%USERPROFILE%\Code\bsf-refs\`. None of these are built or shipped; they exist to help reverse-engineer client behavior, understand the wire protocol, and port original-server features.

For the pinned `server-2013-java` SHA, top-7 highest-value Java paths, and integration-plan entry point, see [`REFERENCE.md`](./REFERENCE.md). For the route-by-route map of each `bsf-server` route to its Java `*Svc.java` counterpart, see [`bsf-server/docs/protocol-cross-reference.md`](./bsf-server/docs/protocol-cross-reference.md).

| Path | What it is | When to consult |
|------|-----------|-----------------|
| `bsf-refs\client-2013-as3\` | Original 2013-era ActionScript source Stoic shared (385 .as files, multi-module Java-style layout under `game/code/client/lib.engine.core/src/` and `lib.game/src/`) | **Default reference for AS3** — 97% of overlapping classes are signature-equivalent to the shipped client and the original code is much more readable than the decompile |
| `bsf-refs\client-decompiled-as3\` | JPEXS decompile of the shipped SWF v1.10.51 (1,113 .as files; flat layout: `engine/`, `game/`, `tbs/`, `lib/`, plus `GameMainAir.as`, `AneFixer.as`) | Use for code added after 2013 (732 files don't exist in 2013), or to verify any of the 12 files in the stale-list below |
| `bsf-refs\client-swf-and-ane\` | Raw `app.game.air.swf` + extracted ANE scripts (decompile inputs) | Rarely read directly; needed to regenerate the decompile |
| `bsf-refs\server-2013-java\` | Original 2013-era Java server Stoic shared (175 .java files, MySQL schema 88, Maven `pom.xml`) | When integrating or porting original-server features — see `bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md` |

### Prefer 2013 source over decompile, except for 12 stale files

Pass-2 signature comparison (2026-05-16) found 369 of 381 overlapping files are byte-equivalent in API surface. The exceptions — files Stoic actually modified after 2013, where the 2013 source is **stale** and the decompile is authoritative:

- **`engine/battle/fsm/`** (4) — `BattleFsmConfig`, `BattleTurnOrder`, `BattleStateDeploy`, `BattleStateInit`
- **`engine/battle/board/`** (3) — `BattleBoard`, `BattleBoardView`, `EntityFlyText`
- **`engine/battle/ability/effect/op/model/Op.as`** (1)
- **`engine/entity/def/`** (2) — `EntityDef`, `EntityClassDefList`
- **`game/cfg/`** (2) — `GameConfig`, `AccountInfoDefVars`

Pattern: post-2013 changes were exclusively gameplay iteration (battle internals, entity defs, game config). Core utils, the protocol layer (`tbs/srv/...`), JSON serialization, stats, and session-state code are all unchanged. Comparison artifacts saved to `%USERPROFILE%\Code\bsf-refs-compare\`.
