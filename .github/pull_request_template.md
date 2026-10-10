## Summary

<!--
Plain-English: what changed and why. Aim for clear and easy for humans to understand. Avoid function names and file paths in the summary itself — put those in commit bodies.
-->

## Acceptance criteria

<!--
How we know this is done. If the issue lists them, write "On #42" and nothing more.
With no issue, list them here: one statement per line that somebody could check, written before the work began.
-->

## Test plan

- [ ] `yarn test` passes (paste count: NNN/NNN)
- [ ] If client-visible behaviour changed: ran `test-2p-match.bat` and pasted the `[OK]` block below (Windows + local rig only — skip if N/A)
- [ ] If any file was moved or deleted: ran the path-citation grep from `bsf-server/CONTRIBUTING.md` § "Path-citation audit" — no stale citations remain
- [ ] `CHANGELOG.md` updated with a plain-English entry (or N/A — internal-only / docs-only)

## Review record

<!--
If a review ran before this pull request opened, replace this comment with its five lines.
Leave the comment as it is if none ran. The lines must start as shown: a check counts them.

- Tier: 2 by path (services/auth), rounds: 2
- Checker: 7 findings, 5 fixed, 2 dismissed
- Refuter: 9 claims, 2 refuted, 6 survived, 1 unresolved
- Acceptance criteria (#42): 4 of 4 met
- Left open: none
-->

## Dependencies

None.

<!--
If this PR can't be merged until another PR is merged first, replace "None"
with `Depends on #123`, using the other PR's number.
-->

## Related issues

None.

<!--
If this PR addresses a GitHub issue, replace "None" with `Closes #42` to
auto-close it on merge into `main`, or `Refs #42` to link without closing.
Full list of closing keywords and caveats is in `bsf-server/CONTRIBUTING.md`
§ "Linking PRs to issues".
-->
