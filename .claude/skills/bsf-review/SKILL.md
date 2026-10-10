---
name: bsf-review
description: Review a BSF change before its pull request opens — a checker agent, plus an agent briefed to disprove when the change touches risky files, run in a new chat from a handoff file, two rounds at most. Use when a review is offered or asked for, or when /stream-done reaches its review step.
---

# Reviewing a change before its pull request opens

**How deep the review goes depends on which files the change touches.** On the committed work, run `node bsf-server/scripts/review-tier.js origin/main` (name the branch's real base if it is not `main`). It prints the tier and the files that set it. The paths are in [`.github/review-tiers.json`](../../../.github/review-tiers.json); the highest tier of any changed file wins.

| Tier | The change touches | Agents | The user reads |
|---|---|---|---|
| **2** | sign-in, battles, any address the game calls, the wire format, the shape of stored data, or deployment | checker and refuter | the diff of those files |
| **1** | anything else | checker | the summary |
| **0** | documents only | checker, with most of its effort on the prose | the summary |

- **The paths set the tier, and only the user may lower it.** Suggest lowering when the change to a tier-2 file is layout or comments only; never decide it. Write their reason in the handoff and the record. Anyone may raise a tier.
- **A client change:** `bsf-client` has no list yet. Tier 2 if it changes what the game sends to the server or reads from it, otherwise tier 1.
- If the script prints `TOOL DID NOT RUN`, fix that first. No tier is not tier 0.

Every change used to get both agents, and reviews grew to about a third of all usage ([the count, and what the tiers save](../../../bsf-server/docs/retrospectives.md#why-review-depth-follows-risk-2026-10-10)). Both agents run on the main model. The checker is one agent because three separate checking agents cost too much ([the 2026-09-14 measurement](../../../bsf-server/docs/retrospectives.md#what-review-rounds-cost-2026-09-14)). The refuter stays separate, because a second view that disagrees with the first is itself a finding.

## 1. Hand the review to a new chat

**If this chat wrote the work, it does not run the review.** By the time the writing chat starts reviewers it typically carries about four times what a new chat starts with, and every later step — fixing what they find included — pays for all of it again ([the measurement](../../../bsf-server/docs/retrospectives.md#what-review-rounds-cost-2026-09-14)). So:

1. Route what this chat learned, using the table in [`bsf-server/CLAUDE.md`](../../../bsf-server/CLAUDE.md) under *Code Review*.
2. Commit the work.
3. Get the tier from the script above.
4. Get the acceptance criteria — the statements, written before the work began, that say how we know it is done. They are under "Acceptance criteria" on the issue (`gh issue view <n> --json body,comments`). **If the issue has none,** draft three to six from its text, each one something a person could check, show them to the user, and post the list they agree as a comment on the issue before going on. Work with no issue: agree them with the user and put them in the pull-request body.
5. Write `%USERPROFILE%\.claude\plans\review-<branch>.md` (a `/` in the branch name becomes `-`), naming:
   - the branch, its base, the worktree folder, and the commit reviewed;
   - the tier, the files that set it, and the user's reason if they lowered it;
   - the issue and its acceptance criteria, word for word;
   - the files;
   - on tier 2, the claims for the refuter (section 3);
   - for each new or changed test, the commit on which it failed without the fix and the assertion that failed — or "no tests changed". Tier 2 needs this; a lower tier may say "not shown";
   - the result of `yarn lint`, `yarn knip`, `yarn dupes` and `yarn format:check` in `bsf-server` on that commit (the counts, or "not run");
   - the draft pull-request body.
6. Stop, and give the user one line to paste into a new chat: `Read %USERPROFILE%\.claude\plans\review-<branch>.md, then run /stream-done.`

**If this chat started from that file,** carry out sections 2 to 6, then go on with `/stream-done` from its Step 2, working through section 7 before its Step 6 commit.

## 2. The checker: one agent, four labelled passes

```
Agent({ subagent_type: "general-purpose", description: "Checker",
  prompt: "Review <branch> at <commit> against <base>, in <worktree>: <files>.
  Report findings under four headings, each with file:line evidence.
  A. Claims against source: check every factual sentence against the code, the
     recorded traffic and the Java reference. Do not trust the document under review.
  B. Consistency: does each statement agree with the other documents that make it,
     and does every link, heading anchor and cited file resolve?
  C. Judgement: correctness, security, edge cases and architecture. <checklist>
  D. Acceptance criteria: for each criterion in <handoff file>, answer met / not met /
     cannot tell, with the evidence. Then name anything the change does that no
     criterion asks for.
  Also, for each new or changed test: does <handoff file> show it failing without
  the fix, and would its assertions still pass on <base>? Flag either gap. Where the
  handoff says 'not shown', judge the second question by reading the test.
  DO NOT REDISCOVER what a tool already settles, and only when <handoff file> gives
  its result on <commit>: unused names, unused inputs and missing returns in src/ (the
  build); type errors in test code (yarn typecheck:test); code layout in src/ and
  test/ (yarn format:check); a function over 15 paths, or over 75 lines in src/ (blank
  lines and comments do not count), and a `let` never reassigned (yarn lint); a line
  over 120 columns that holds no string, template, URL or regex (yarn lint); unused
  files and packages (yarn knip); copied blocks in src/ (yarn dupes). Report one only
  if the tool's own output is wrong. NO tool covers scripts/, .mjs, .ps1, .yml or
  Markdown files, unused exports, or the word caps and size alarm (they run only in CI,
  after the pull request opens). This list does NOT cover passes A and B: whether a
  sentence is true still takes reading the code it describes." })
```

**Why the list is this short:** the W1 audit found 3 of 66 review corrections were mechanical and 65% were prose that needed the code read ([the audit](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/341)). The tools are report-only until wave 7 ([#347](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/347)), so the handoff gives their counts and the checker does not repeat what they found. Keep the list to checks a program really runs; naming one that nothing runs teaches the checker to skip it.

**The server checklist**, for pass C: unhandled promise rejections, missing input validation, type mismatches, auth bypasses, edge cases in matchmaking/battle logic, and protocol compliance with the Fiddler captures under `data/game_captures/extracted/` (a fresh clone holds only `0058_s.txt` there — the rest come from the [`reference-captures` release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/tag/reference-captures)).

**For a client change,** take the checklist and the premises to attack from `bsf-client/CLAUDE.md` under *Code Review*.

**For documentation changes, put most of the review on the prose — but do not skip the tables.** Mistakes land in proportion to how much was written, not to how it was formatted. **Checking the counts is not checking the table** ([the cases](../../../bsf-server/docs/retrospectives.md#where-the-errors-in-the-client-contract-were-2026-08-11)). The failures live in sentences containing *because*, *therefore*, or *cannot happen*, wherever those sentences sit. **Never write a "because" clause you have not traced into the code**, and make every number name its unit.

## 3. The refuter, on tier 2 only: a separate agent, briefed to disprove

The checker asks "does this sentence match the code?" — a question that finds support wherever support exists. It does not ask whether the *situation* the change is built on can happen at all, so a false premise survives it indefinitely ([the case](../../../bsf-server/docs/retrospectives.md#what-only-the-refuter-caught-181)).

Give it named claims, never "the diff":

```
Agent({ subagent_type: "general-purpose", description: "Adversarial review",
  prompt: "Your job is to DISPROVE, not to verify. For each claim below, try to build a case
  where it is false. Answer 'refuted' only when you have a concrete counter-case, and
  'unresolved' when you cannot settle it either way. Go after: negative
  claims ('nothing anywhere does X'), runtime predictions derived from reading static code,
  and any status or severity the author assigned to their own work. Claims: <list them>.
  Report each as refuted / survived / unresolved, with file:line evidence." })
```

On tier 2, start the checker and the refuter in the same message: neither needs the other's answer. For a sign-in or security change, also suggest the user run `/code-review ultra`, a deeper review in the cloud that only they can start.

## 4. Acting on what they find

**Verify the refuter's own findings before acting on them.** It has been confidently wrong, and two reviewers have split over a fact only the source could settle ([both cases](../../../bsf-server/docs/retrospectives.md#the-refuter-can-be-wrong-too)). When two reviewers disagree, that disagreement *is* the finding: resolve it at the source yourself.

**Prefer deleting a wrong explanation to rewriting it.** Measured across three rounds, each correction round introduced about half as many errors as it fixed, and all of that came from replacing wrong sentences with new ones — roughly 11 new lines of prose per error fixed, at about 4 errors per 100 lines of prose. Deleting costs nothing. Where an explanation has been wrong more than once and no decision depends on it, cut it and keep the finding.

Commit the fixes as their own commit.

**Keep a tally as you go**, for the record in section 6: each checker finding ends as fixed or as dismissed (wrong, or not worth acting on); each refuter claim as refuted, survived or unresolved.

## 5. Two rounds at most, and the second reviews only the fixes

**Run a second round only when the first round's fixes wrote new code or new prose.** Fixes that only deleted need none.

Run the checker alone. Brief it with what changed since the reviewed commit (`git diff <reviewed-commit>..HEAD -- . ':(exclude,glob)**/yarn.lock'`; the `glob` form skips the lockfile from either folder, where `':!**/yarn.lock'` misses it inside `bsf-server/`) and the claims those fixes altered. Bring the refuter back only on tier 2, and only when a fix changed one of the claims it was given. Review everything again only when a fix changed what the work rests on.

**There is no third round.** Fix what the second round finds, deleting before rewriting. Then stop and list for the user every item still open, each with its evidence:

- a finding that was not fixed;
- a refuter verdict of "unresolved";
- a disagreement between the two agents that the source did not settle;
- an acceptance criterion that is not met, or that nobody could tell.

For each one the user picks: fix it, file an issue, or dismiss it. The pull request opens only when every item has an answer.

## 6. The review record

Put these five lines in the pull-request body under `## Review record`, in place of the template's comment. **The line starts are fixed**: a check in CI looks for them, and wave 7 ([#347](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/347)) reads these records to decide which checks to keep.

```
## Review record
- Tier: 2 by path (services/auth), rounds: 2
- Checker: 7 findings, 5 fixed, 2 dismissed
- Refuter: 9 claims, 2 refuted, 6 survived, 1 unresolved
- Acceptance criteria (#246): 4 of 4 met
- Left open: none
```

- Below tier 2, the third line is `- Refuter: not run (tier 1)`.
- A lowered tier reads `- Tier: 1, lowered from 2 by the user (layout only), rounds: 1`.
- `Left open` says what the user chose for each item from section 5: `1 filed as #360, 1 dismissed`.

CI also sets a `tier-0`, `tier-1` or `tier-2` label on the pull request from the same path list. The label is what the paths say, so it differs from the record when the user lowered the tier.

## 7. Before the pull request opens

- **Count the body's words:** `node -e "console.log(require('fs').readFileSync(process.argv[1],'utf8').split(/\s+/).filter(Boolean).length)" <file>`. About 250 is the limit for a pull-request body and 120 for a changelog entry; anything longer goes on the issue. The review record and the template's hidden comments do not count toward the 250.
- **Route the third kind of finding** — what the review taught that is not a code change — using the table in `bsf-server/CLAUDE.md` under *Code Review*.
- Push and open the pull request only after the user's `y`.
