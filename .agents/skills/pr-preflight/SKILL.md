---
name: pr-preflight
description: >
  Pre-flight check of your own GitHub pull request in this repository before requesting human
  review. Reviews the PR with the same per-PR-scoped lenses as pr-review (security, quality,
  redundancy, testing, accessibility, architecture, PR hygiene) against the linked Jira story and
  the repo's standards (AGENTS.md and doc/rules/), then fixes the mechanical in-spec blocking
  findings it is confident about (verified with the repo's full gate, committed as a new commit,
  plain-pushed to the PR's own branch) and reports a checklist of what was fixed and what still
  needs manual attention. Never posts any comment, review, or approval to GitHub. Use whenever
  asked to self-review, pre-review, or check a PR of your own before review — e.g. "review my
  PR", "is my PR ready", "preflight PR #12", "check my pull request before I ask for review".
  For reviewing someone else's PR, use pr-review instead.
---

# PR preflight

You are checking **your own** pull request before a human colleague spends time
reviewing it. The goal is that the reviewer finds nothing you could have caught
yourself. This is a private pre-flight check: nothing is ever posted to the PR
on GitHub — no comments, reviews, approvals, or reactions. The one thing that
may leave the machine is a fix commit pushed to the PR's own branch, under the
rules below.

This skill is tool-agnostic: it assumes only a shell with `git` and the `gh`
CLI. If your tool supports subagents you may run the review lenses in parallel;
otherwise work through them in order.

## Ground rules

- **Confirm the PR is yours before anything else.** Compare the PR's
  `author.login` against `gh api user --jq .login`. If they differ, stop and
  point to `pr-review` instead — never push fixes to a branch you don't own.
- **No PR-record writes on GitHub.** No comments, reviews, approvals,
  reactions, or label/title/description edits. Pushing a fix commit to your own
  head branch is the sole permitted write.
- **Stay in spec.** The spec is: the linked Jira story's acceptance criteria,
  plus this repo's standards applied to the lines the PR touches. Never fix or
  add anything beyond that — a valuable out-of-scope idea becomes a suggested
  new Jira story in the report, never a change on this branch.
- **Safe git only.** Fixes go on as a new commit on the PR's head branch —
  never amend, rebase, force-push, or push to any other branch. Respect hooks
  (no `--no-verify`); the pre-commit hook runs the repo gate and that is the
  point of it.
- **No praise, no padding.** An empty findings list is a good outcome.

## Procedure

### 1. Review

1. **Resolve the PR and confirm authorship** (ground rules above). Fetch
   metadata, diff, and CI status with `gh pr view`, `gh pr diff`,
   `gh pr checks`.
2. **Establish the spec.** Read the PR description and linked Jira story. No
   Jira link is itself a finding (`doc/rules/git-workflow.md` requires one).
3. **Tiny-PR shortcut.** Under ~30 changed lines across at most 2 files:
   review directly, naming the applicable lens(es).
4. **Apply the review lenses** exactly as defined in the `pr-review` skill —
   same lens table, same doc/rules references, same scoping rules (record
   skipped lenses with a reason; when unsure, include the lens). Since this is
   a pre-flight before a human reviews, err toward including a lens on close
   calls: cheaper to catch it now.
5. **Classify every finding**: **blocking (in spec)** — a maintainer would
   send it back, or it violates a repo standard on lines the PR touches;
   **non-blocking (in spec)** — your discretion; **out of scope** — draft a
   new Jira story instead (title + short description, ready for the backlog).
6. **Check the description against the diff** — mismatched claims are
   blocking; fix the description or the code, whichever is wrong.

### 2. Fix what is safely fixable

Fix a blocking finding only when **all** of these hold — otherwise report it
as needing manual attention:

- The fix is **mechanical**: a one- or few-line correction whose shape is
  obvious from the finding (wrong assertion, missing null check, swapped
  arguments, wrong config value, missing negative test of an existing
  pattern) — not a redesign, new abstraction, or multi-file ripple.
- It is **in spec** — it makes the PR meet the story and the standards, and
  nothing more.
- It requires **no judgment call you haven't already made** in this PR: don't
  invent a new validation policy, error message, or security control; do
  reuse the pattern already present nearby.
- You would make the identical edit if the author (you, earlier) were watching
  and said "just fix it".

Security-control choices, architecture/boundary changes, and anything where
two plausible fixes disagree are never auto-fixed — the report explains what
is wrong and why it needs a decision.

**Applying fixes:**

1. Get onto the PR's head branch at its current head (check out or use a
   worktree; stash unrelated local changes first and restore them after).
2. Make the edits per finding.
3. **Verify with the repo's own gate** before committing:
   `npm run security-audit && npm run format:check && npm run lint && npm test`
   — and confirm coverage has not dropped below its previous figure, not just
   above 90% (`doc/rules/quality-assurance.md`). If a fix fails the gate,
   revert that edit and report the finding as unfixed, with what you tried.
4. Commit as a **new commit** following `doc/rules/git-workflow.md` (≤50-char
   imperative subject, body explaining what and why — note it was caught in
   self-review). Plain `git push` to the PR's head branch.
5. Record the new head SHA for the report.

## Report format

```
### PR <number>: <title>  (preflight)
<base> → <head>  •  <files> files (+<adds>/−<dels>)  •  CI: <passing/failing>
Spec: <Jira ref or "no Jira link — add one before requesting review">
Lenses: <applied>  (scoped out: <lens — reason>)
<Pushed fix commit <short-sha> for <N> finding(s). — omit if nothing was fixed>

### Blocking (in spec)
1. [FIXED] <file>:<line> [<lens>] <What was wrong and what the fix changed.>
2. [NEEDS MANUAL FIX] <file>:<line> [<lens>] <What is wrong and why it needs your decision.>

### Non-blocking (in spec)
1. <file>:<line> [<lens>] <One sentence.>

### Suggested new stories (out of scope for this PR)
1. <Draft story title>
   <Why it's valuable, where the issue lives.>

### Verdict
<one of:>
- "Ready to request review — no blocking findings."
- "Fixed <N> finding(s) (commit <short-sha>, pushed) — ready to request review."
- "Fixed <N> of <M>; <M−N> need manual attention before requesting review."
- "Not ready: <N> blocking finding(s), none safely auto-fixable."
```

If some findings were fixed and others weren't, report both plainly — never
imply everything is resolved when it isn't.

## Anti-patterns

- Posting anything to the PR record on GitHub — this skill reports in chat and
  pushes at most one plain fix commit.
- Running it on a PR that isn't yours.
- Fixing something out of spec because it seemed valuable — that's a story
  suggestion, not a commit.
- Amending, rebasing, or force-pushing; skipping hooks; pushing anywhere but
  the PR's own head branch.
- Claiming a finding is fixed without the full gate passing on the change.
- Treating a skipped or failed lens as a clean pass, or padding findings to
  look thorough.
