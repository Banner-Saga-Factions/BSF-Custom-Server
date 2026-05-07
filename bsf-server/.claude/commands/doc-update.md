Document all code changes since the last git push to origin.

## Step 1: Diff Against Origin

Run these commands to understand what changed:
```
git log origin/HEAD..HEAD --oneline
git diff origin/HEAD..HEAD --stat
git diff origin/HEAD..HEAD -- src/ launch-game-1p.ps1 launch-game-2p.ps1 start-server.bat
git diff HEAD --stat
git diff HEAD -- src/
```

Read the actual diff output carefully — not just the filenames.

## Step 2: Categorize Changes

Separate changes into:
- **Code changes** (src/, scripts) — these need CHANGELOG entries
- **Doc changes** (docs/, CLAUDE.md) — note but don't double-document
- **Config changes** (.env.example, docker-compose.yml) — include if user-facing
- **Tool/IDE changes** (.claude/) — skip

## Step 3: Read Current CHANGELOG

Read `CHANGELOG.md` to find:
- The most recent section header (insertion point is just after it)
- The formatting conventions used

## Step 4: Draft the Entry

Draft a new CHANGELOG section. Guidelines:
- Header format: `### <emoji> <Stream Name or Fix Name>` — match existing style
- Each bullet explains the "what was broken / what it does now", not just "changed X to Y"
- Include root cause for bug fixes
- Include any DB migration steps if schema changed
- Include operational notes (e.g. server restart required, env var needed)

Show the draft to the user. Do not write anything until approved.

## Step 5: Write and Confirm

After approval, write to `CHANGELOG.md`. Confirm the section was inserted correctly by reading back the surrounding lines.
