Complete the post-stream workflow in strict order. Do not skip or reorder steps.

## Step 1: Hand Off the Code Review

Ask: "Do you want the review that *Size the review to the change* in `bsf-server/CLAUDE.md` calls for?"

If yes and this chat wrote the work: follow *Review in a new chat* in that file. Route what this chat learned, commit, write the handoff file (a `/` in the branch name becomes `-`), then give the user this line and stop:

`Read %USERPROFILE%\.claude\plans\review-<branch>.md, then run /stream-done.`

If this chat started from that handoff, the answer is already yes: run the reviewers it names — a refuter is always one of them — check each finding at the source, commit the fixes as their own commit, and route the third kind of finding, all before Step 2.

## Step 2: Confirm Tests Passed

Ask the user: "Have you tested these changes? Describe what you tested and confirm it passed before we continue."

Wait for confirmation. Do not proceed until the user explicitly confirms tests passed.

## Step 3: Surface What Changed

Run `git diff origin/HEAD..HEAD --stat` and `git diff HEAD --stat` to show all committed-but-not-pushed and uncommitted changes. Summarize in plain language what code areas changed and what each change does.

## Step 4: Draft CHANGELOG Entry

Read `CHANGELOG.md` to understand the current format and find the insertion point (after the most recent stream section).

Draft a new CHANGELOG section covering all changes from Step 3. Follow the existing format:
- Use an emoji header matching the stream type (🔑 auth, ⚔️ battle, 🔧 fix, 🗄️ DB, etc.)
- Bullet points explaining what changed and why — focus on the "what was wrong / what it does now" not just "changed X to Y"
- Group related changes under bold subheadings if there are many

Show the draft to the user and ask for approval before writing anything.

## Step 5: Write Documentation

After user approves the draft, write it to `CHANGELOG.md`.

## Step 6: Commit

Stage all modified source and doc files (exclude `.claude/settings*.json` — the personal one is git-ignored now and will not be staged anyway). Create a commit with this format:

```
<type>: <short description>

<2-3 sentence summary of what changed and why>

Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```

Show the commit message to the user for approval before committing.

## Step 7: Offer to Push

Ask if the user wants to push to origin.
