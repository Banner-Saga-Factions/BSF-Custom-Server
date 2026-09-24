---
name: bsf-review
description: Review a BSF change before its pull request opens — one checker agent with three labelled passes plus one agent briefed to disprove, run in a new chat from a handoff file. Use when a review is offered or asked for, or when /stream-done reaches its review step.
---

# Reviewing a change before its pull request opens

**Two agents, both on the main model: a checker and a refuter.** Each review agent costs about 0.7M tokens, most of it spent reading what the others read too ([the measurement](../../../bsf-server/docs/retrospectives.md#what-review-rounds-cost-2026-09-14)), so the three checking roles that used to be separate agents are now three passes in one. The refuter stays separate, because a second view that disagrees with the first is itself a finding.

## 1. Hand the review to a new chat

**If this chat wrote the work, it does not run the review.** By the time the writing chat starts reviewers it typically carries about three times what a new chat starts with (a median of 174k tokens against 61k, measured 2026-09-24), and every later step — fixing what they find included — pays for all of it again. So:

1. Route what this chat learned, using the table in [`bsf-server/CLAUDE.md`](../../../bsf-server/CLAUDE.md) under *Code Review*.
2. Commit the work.
3. Write `%USERPROFILE%\.claude\plans\review-<branch>.md` (a `/` in the branch name becomes `-`), naming:
   - the branch, its base, the worktree folder, and the commit reviewed;
   - the files;
   - the claims for the refuter (section 3);
   - for each new or changed test, the commit on which it failed without the fix and the assertion that failed — or "no tests changed";
   - the draft pull-request body.
4. Stop, and give the user one line to paste into a new chat: `Read %USERPROFILE%\.claude\plans\review-<branch>.md, then run /stream-done.`

**If this chat started from that file,** carry out sections 2 to 6.

## 2. The checker: one agent, three labelled passes

```
Agent({ subagent_type: "general-purpose", description: "Checker",
  prompt: "Review <branch> at <commit> against <base>, in <worktree>: <files>.
  Report findings under three headings, each with file:line evidence.
  A. Claims against source: check every factual sentence against the code, the
     recorded traffic and the Java reference. Do not trust the document under review.
  B. Consistency: does each statement agree with the other documents that make it,
     and does every link, heading anchor and cited file resolve?
  C. Judgement: correctness, security, edge cases and architecture. <checklist>
  Also, for each new or changed test: does <handoff file> show it failing without
  the fix, and would its assertions still pass on <base>? Flag either gap." })
```

**The server checklist**, for pass C: unhandled promise rejections, missing input validation, type mismatches, auth bypasses, edge cases in matchmaking/battle logic, and protocol compliance with the Fiddler captures under `data/game_captures/extracted/` (a fresh clone holds only `0058_s.txt` there — the rest come from the [`reference-captures` release](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/releases/tag/reference-captures)).

**For a client change,** take the checklist and the premises to attack from `bsf-client/CLAUDE.md` under *Code Review*.

**For documentation changes, put most of the review on the prose — but do not skip the tables.** Mistakes land in proportion to how much was written, not to how it was formatted. **Checking the counts is not checking the table** ([the cases](../../../bsf-server/docs/retrospectives.md#where-the-errors-in-the-client-contract-were-2026-08-11)). The failures live in sentences containing *because*, *therefore*, or *cannot happen*, wherever those sentences sit. **Never write a "because" clause you have not traced into the code**, and make every number name its unit.

## 3. The refuter: a separate agent, briefed to disprove

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

Start the checker and the refuter in the same message: neither needs the other's answer. For a sign-in or security change, also suggest the user run `/code-review ultra`, a deeper review in the cloud that only they can start.

## 4. Acting on what they find

**Verify the refuter's own findings before acting on them.** It has been confidently wrong, and two reviewers have split over a fact only the source could settle ([both cases](../../../bsf-server/docs/retrospectives.md#the-refuter-can-be-wrong-too)). When two reviewers disagree, that disagreement *is* the finding: resolve it at the source yourself.

**Prefer deleting a wrong explanation to rewriting it.** Measured across three rounds, each correction round introduced about half as many errors as it fixed, and all of that came from replacing wrong sentences with new ones — roughly 11 new lines of prose per error fixed, at about 4 errors per 100 lines of prose. Deleting costs nothing. Where an explanation has been wrong more than once and no decision depends on it, cut it and keep the finding.

Commit the fixes as their own commit.

## 5. A second round reviews the fixes, not the whole change

Run the checker alone. Brief it with what changed since the reviewed commit (`git diff <reviewed-commit>..HEAD -- . ':(exclude,glob)**/yarn.lock'`; the `glob` form skips the lockfile from either folder, where `':!**/yarn.lock'` misses it inside `bsf-server/`) and the claims those fixes altered. Bring the refuter back only when a fix changed one of the claims it was given. Review everything again only when a fix changed what the work rests on.

## 6. Before the pull request opens

- **Count the body's words:** `node -e "console.log(require('fs').readFileSync(process.argv[1],'utf8').split(/\s+/).filter(Boolean).length)" <file>`. About 250 is the limit for a pull-request body and 120 for a changelog entry; anything longer goes on the issue.
- **Route the third kind of finding** — what the review taught that is not a code change — using the table in `bsf-server/CLAUDE.md` under *Code Review*.
- Push and open the pull request only after the user's `y`.
