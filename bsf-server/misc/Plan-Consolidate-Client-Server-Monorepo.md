# Plan: Collapse the client submodule into a single monorepo (`BSF`)

> Status: **Not started** — drafted 2026-06-05, to be executed in a later session.

## Context

`bsf-client/` is currently a **git submodule** pointing at `Banner-Saga-Factions/BSF-Client`,
while `bsf-server/` is a plain folder inside the parent repo `Banner-Saga-Factions/BSF-Custom-Server`.
This two-repo + submodule arrangement is the root of recurring maintenance pain:

- The client's pinned commit `31597b07` exists on the org remote only as `refs/pull/9/head`
  (PR #9), **not** on a branch — so a fresh `git submodule update --init` only works because GitHub
  still serves that PR-head SHA on demand. If PR #9 is closed/pruned, clones break.
- The Spearman feature spans **both** client and server, so it had to be split into a server branch
  (`Spearman-As-Axeman-Promotion`) **and** a separate client PR (#9) — they can drift and must land
  in the right order.
- For a solo/tiny-team project, submodules are pure overhead; they only pay off across teams with
  independent release cycles.

**Outcome:** one repo, `Banner-Saga-Factions/BSF`, with `bsf-server/` and `bsf-client/` as plain
folders. No `.gitmodules`, no pinned SHA, no submodule fetch. The root `README.md` already calls this
"a monorepo with two components" (line 11) — this change makes that literally true.

## Decisions (confirmed with user)

- **Client history:** drop the files in fresh (no `git subtree`). The client's 23 tracked files come
  in as a normal folder; its old commit history stays in the archived `BSF-Client` repo.
- **Repo name:** rename `BSF-Custom-Server` → `BSF`. GitHub auto-redirects the old URL; we update the
  active doc links.

## What gets imported

The client tracks **23 files** at commit `31597b07` (= PR #9 head = the in-flight Spearman client
changes). The heavy `_decompiled/` tree, `_build/`, `*.swf`, `*.air`, `*.p12` (the signing key), and
`zeno-notes.md` are all gitignored, so they do **not** come along — only the `src/` patches, `scripts/`,
`META-INF/`, `docs/`, `misc/` data, and the client's own `.gitignore`.

## Branch strategy

Do this on the **current `Spearman-As-Axeman-Promotion` branch**, as new commits on top.
Rationale: that branch already edits `.gitmodules` (the `eltaino1` → org URL fix) and bumps the client
gitlink, so a separate consolidation branch off `main` would **conflict** on those exact files. Doing
the consolidation here lets it cleanly supersede both (`.gitmodules` is deleted, the gitlink is
replaced by real files), and the Spearman feature lands as one coherent client+server change.

> If picking this up later and the branch has already merged: branch off `main` instead — there will
> be no `.gitmodules` conflict because the URL fix will already be in `main`.

---

## Step A — Restructure: submodule → plain folder (local, on current branch)

**What:** Export the client's tracked files, delete the submodule wiring, drop the files back as a
normal `bsf-client/` folder, commit.

**Why:** Removes the entire submodule mechanism (the source of the fragility).

**Tradeoff:** The combined git log won't show the client's past commits (they remain in the archived
`BSF-Client` repo). This was the chosen "simple" option.

Pre-check, then execute. Commands shown bash-style; PowerShell notes inline:

```bash
# 0. Confirm the submodule is clean and at the intended commit
git -C bsf-client status --short          # expect empty
git -C bsf-client rev-parse HEAD          # expect 31597b07...

# 1. Export ONLY the tracked files at HEAD to a temp dir (excludes _decompiled/, signing key, etc.)
#    bash:
mkdir -p "$TMPDIR/bsf-client-export" && git -C bsf-client archive HEAD | tar -x -C "$TMPDIR/bsf-client-export"
#    PowerShell equivalent:
#      $dst = "$env:TEMP\bsf-client-export"; New-Item -ItemType Directory -Force $dst
#      git -C bsf-client archive --format=zip -o "$env:TEMP\bsf-client.zip" HEAD
#      Expand-Archive "$env:TEMP\bsf-client.zip" -DestinationPath $dst

# 2. Tear down the submodule
git submodule deinit -f -- bsf-client
git rm -f bsf-client                      # removes the gitlink AND the .gitmodules section
rm -rf .git/modules/bsf-client            # PowerShell: Remove-Item -Recurse -Force .git\modules\bsf-client
git rm -f .gitmodules 2>/dev/null || true # ensure the (now-empty) .gitmodules is gone

# 3. Recreate bsf-client/ as a plain folder — copy dotfiles too (e.g. .gitignore!)
mkdir bsf-client && cp -a "$TMPDIR/bsf-client-export/." bsf-client/
#    PowerShell: Copy-Item "$env:TEMP\bsf-client-export\*" bsf-client\ -Recurse -Force

# 4. Stage + sanity-check + commit
git add bsf-client .gitmodules
git status                                # expect ~23 new files under bsf-client/, .gitmodules deleted
git commit
```

After this, the client's nested `.gitignore` keeps `_decompiled/` / builds / `*.p12` ignored exactly
as before if `decompile.ps1` is re-run.

## Step B — Documentation scrub (separate local commit)

Two find-replace patterns across the docs; commit separately from Step A for a clean diff.

**Pattern 1 — submodule wording → monorepo folder.** Behavior-describing files first:
- Root `CLAUDE.md` — "frontend ... git submodule of Banner-Saga-Factions/BSF-Client" → plain folder.
- `bsf-server/CLAUDE.md` — same "submodule" wording in the repo-structure section.
- `bsf-client/CLAUDE.md` — "Parent repo: `../` tracks this repo as a git submodule" → "part of the BSF monorepo".
- `bsf-server/CONTRIBUTING.md` — **lines 34, 37, 44–50**: drop the `--recurse-submodules` /
  `git submodule update --init` block; reword "a git **submodule** pointing at the game-client repo".
- Root `README.md` — **lines 39–43**: remove the `--recurse-submodules` "Server + client source"
  block (client is now just a folder); keep the "monorepo" line (now accurate).
- `bsf-server/docs/Development.md` and `bsf-server/docs/Deployment.md` — submodule setup mentions.
- Lower priority (sweep if convenient): `bsf-client/docs/*.md`, `bsf-client/README.md`,
  `bsf-server/.claude/rules/gotchas.md` if it asserts submodule layout.

**Pattern 2 — URL rename `BSF-Custom-Server` → `BSF`** (15 files contain it). Update the **active**
docs: root `README.md`, `bsf-server/README.md`, `bsf-server/CONTRIBUTING.md`,
`bsf-server/docs/{Development,Deployment,dataStructures,Community-Insights}.md`,
`bsf-server/data/client-README.txt`, `bsf-client/{README.md,docs/architecture.md,docs/build-workflow.md}`.
Historical files under `bsf-server/misc/` (plans, regression/review notes) can keep the old URL —
GitHub redirects them — or be swept in the same replace pass. (Do **not** rewrite `CHANGELOG.md` history.)

## Step C — GitHub-side actions (outward-facing — get explicit go before each)

These are public, hard-to-reverse, and affect anyone who has the repos:

1. **Rename** `Banner-Saga-Factions/BSF-Custom-Server` → `BSF` (repo Settings). GitHub keeps a
   redirect from the old name, so existing clones/links keep working. *Verify `Banner-Saga-Factions/BSF`
   isn't already taken first.*
2. **Update the local remote** (optional — redirect works regardless):
   `git remote set-url origin https://github.com/Banner-Saga-Factions/BSF.git`
3. **Close client PR #9** without merging — its changes (commit `31597b07`) are now imported into the
   monorepo, so merging it on the client repo would be redundant.
4. **Archive** `Banner-Saga-Factions/BSF-Client` (make read-only) — keep it as the historical home of
   the client's commit history and an optional public client-download mirror. *Do this last, after
   confirming the import is correct on the monorepo.*

Can be done via the GitHub web UI, or with `gh` (one authorization per action).

## Verification

1. **Build + tests unchanged** (run locally per project convention):
   `cd bsf-server; yarn build; yarn test` — must still pass (no server code changed → green expected).
2. **CI:** `ci.yml` already checks out without submodules and only builds `bsf-server/`, so it is
   unaffected — confirm the PR's `build-and-test` check goes green.
3. **Fresh-clone smoke test** (the whole point):
   `git clone https://github.com/Banner-Saga-Factions/BSF.git` into a scratch dir — confirm
   `bsf-client/` is populated with the 23 files immediately, with **no** submodule step and **no**
   `.gitmodules`.
4. **path-rot CI:** after the rename, the workflow also scans the newly-in-repo `bsf-client/docs/*`.
   Confirm no stale `BSF-Custom-Server` citations remain in active `.md`/`.ts` (the Step B sweep
   should clear these).
5. Grep the tree for leftover `submodule` / `--recurse-submodules` / `.gitmodules` references and
   confirm only historical `CHANGELOG.md` / `misc/` mentions remain.

## Rollback

Steps A/B are ordinary commits — revert with `git revert` (or reset the branch) before push if
anything looks wrong. Step C is the only hard-to-undo part: the GitHub rename is reversible (rename
back), but **defer archiving `BSF-Client` until the monorepo is verified**, since you want the source
intact while validating.
