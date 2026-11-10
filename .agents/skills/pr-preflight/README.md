# pr-preflight

Checks your own pull request before you ask a colleague to review it, with the same lenses and
report format as [pr-review](../pr-review/README.md), then fixes the confirmed, mechanical,
in-spec blocking findings it is sure about and reports what it fixed and what still needs you.
Nothing is posted to GitHub; the one thing that leaves your machine is a fix commit pushed to
your own branch.

The agent-facing procedure is in [SKILL.md](SKILL.md); this file is for developers. For a
colleague's pull request, use pr-review instead.

## When to use it

- Your PR is ready and you want the reviewer to find nothing you could have caught yourself.
- You have pushed a last change and want the gate, the coverage figure and the description
  checked again before requesting review.
- You want the "Human review focus" and the acceptance criteria table to paste into the PR for
  the reviewer.

## How to start it

| Tool        | How                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------- |
| Claude Code | `/pr-preflight 42` (a PR number, URL or branch name)                                          |
| Codex       | `$pr-preflight` (or pick it from `/skills`), then give the PR number                          |
| Either      | Ask in plain words: "is my PR ready", "preflight PR 42"; the skill loads from its description |

Have to hand: the PR number, and `gh` signed in as the account that opened the PR. The skill
compares the PR author with `gh api user` and stops if they differ.

## What happens

1. It confirms the PR is yours, fetches metadata, diff and CI status, counts generated files and
   compares the PR with the size guide in `doc/rules/git-workflow.md`. An over-budget PR is
   reported for a manual split, never split for you.
2. It reads the description and the story, lists the acceptance criteria, applies the review
   lenses, maps each criterion to its evidence, and classifies and tags every finding as
   pr-review does. Because it owns the branch it can run the gate, so blocking findings are
   expected to be `[confirmed — <how>]`.
3. It checks the description against the diff. When the code is wrong it fixes the code; when the
   description or "How to test" is wrong or missing, it gives you corrected text to paste, because
   it never edits the PR record.
4. It fixes a blocking finding only when the finding is confirmed, the fix is mechanical, in spec
   and needs no judgement call you have not already made. Fixes are verified with the full gate
   (`npm run security-audit && npm run format:check && npm run lint && npm test`, coverage not
   below its previous figure), committed as one new commit with the `commit` skill and
   plain-pushed to the PR's branch. Anything else is reported as needing your decision.

## What you get

A report in chat with the same header, acceptance criteria table and findings as pr-review, each
blocking finding marked `[FIXED]` or `[NEEDS MANUAL FIX]`, the SHA of any fix commit, a verdict
("Ready to request review", "Fixed N of M", "Not ready") and a "Human review focus" worded to paste
into the PR description.

## What it never does

- Post a comment, review, approval or reaction, or edit the PR title, labels or description.
- Run on a PR that is not yours, or push to any branch but the PR's own.
- Amend, rebase or force-push, skip hooks, or fix a finding it has not confirmed.
- Fix something out of spec because it seemed valuable; that becomes a suggested new story.

## Afterwards

- Paste the corrected description text and the "Human review focus" into the PR.
- Resolve the `[NEEDS MANUAL FIX]` findings, run the gate, and push.
- Request review; the reviewer may run pr-review on the result.
