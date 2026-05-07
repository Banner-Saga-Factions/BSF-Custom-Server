Complete the post-stream workflow in strict order. Do not skip or reorder steps.

## Step 1: Offer Code Review

Ask: "Do you want me to spawn a code reviewer to check the changes for correctness, security, and edge cases?"

If yes, run:

```
Agent({ subagent_type: "general-purpose", description: "Code review", prompt: "Review the changes in <files> for correctness, security, and edge cases. Look for: unhandled promise rejections, missing input validation, type mismatches, auth bypasses, edge cases in matchmaking/battle logic, and protocol compliance with the Fiddler captures in data/game_captures/." })
```

Wait for the review to complete before continuing.

## Step 2: Confirm Tests Passed

Ask the user: "Have you tested these changes? Describe what you tested and confirm it passed before we continue."

Wait for confirmation. Do not proceed until the user explicitly confirms tests passed.

## Step 3: Surface What Changed

Run `git diff origin/HEAD..HEAD --stat` and `git diff HEAD --stat` to show all committed-but-not-pushed and uncommitted changes. Summarize in plain language what code areas changed and what each change does.

## Step 4: Draft CHANGELOG Entry

Read `CHANGELOG.md` to understand the current format and find the insertion point (after the most recent stream section).

Draft a new CHANGELOG section covering all changes from Step 2. Follow the existing format:
- Use an emoji header matching the stream type (🔑 auth, ⚔️ battle, 🔧 fix, 🗄️ DB, etc.)
- Bullet points explaining what changed and why — focus on the "what was wrong / what it does now" not just "changed X to Y"
- Group related changes under bold subheadings if there are many

Show the draft to the user and ask for approval before writing anything.

## Step 5: Write Documentation

After user approves the draft, write it to `CHANGELOG.md`.

## Step 7: Commit

Stage all modified source and doc files (exclude `.claude/settings*.json`, `.claude/settings.local.json`). Create a commit with this format:

```
<type>: <short description>

<2-3 sentence summary of what changed and why>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Show the commit message to the user for approval before committing.

## Step 8: Offer to Push

Ask if the user wants to push to origin.
