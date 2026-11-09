---
name: pr-preflight
description: >
  Pre-flight check of your own GitHub pull request in this repository before requesting human
  review. Reviews the PR with the same per-PR-scoped lenses as pr-review (security, quality,
  redundancy, testing, accessibility, architecture, dependencies, PR hygiene, spec) against the
  linked
  Jira story and the repo's standards (AGENTS.md and doc/rules/), maps the acceptance criteria to
  evidence, states what it reviewed in full, then fixes the confirmed, mechanical, in-spec
  blocking findings (verified with the repo's full gate, committed as a new commit, plain-pushed
  to the PR's own branch) and reports a checklist of what was fixed and what still needs manual
  attention. Never posts any comment, review, or approval to GitHub. Use whenever asked to
  self-review, pre-review, or check a PR of your own before review — e.g. "review my PR", "is my
  PR ready", "preflight PR #12", "check my pull request before I ask for review". For reviewing
  someone else's PR, use pr-review instead.
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
  (A developer with two GitHub accounts must have `gh` signed in as the one
  that opened the PR.)
- **No PR-record writes on GitHub.** No comments, reviews, approvals,
  reactions, or label/title/description edits. Pushing a fix commit to your own
  head branch is the sole permitted write.
- **Stay in spec.** The spec is: the linked Jira story's acceptance criteria
  (and the spec file named in the PR description, where there is one), plus
  this repo's standards applied to the lines the PR touches. Never fix or add
  anything beyond that — a valuable out-of-scope idea becomes a suggested new
  Jira story in the report, never a change on this branch.
- **Say what you covered.** Record which files you read in full, which you
  skimmed and which you did not review (lock files, generated assets), so the
  reviewer knows where your check was thorough.
- **Confirm before you assert.** You own this branch and can run the gate, so a
  blocking finding should be `confirmed — <how>` (test run, request made,
  command executed) before you fix or report it. Tag anything you could not
  reproduce `from reading`. Never label a finding confirmed without having
  reproduced it.
- **Safe git only.** Fixes go on as a new commit on the PR's head branch —
  never amend, rebase, force-push, or push to any other branch. Respect hooks
  (no `--no-verify`); the pre-commit hook runs the repo gate and that is the
  point of it.
- **No praise, no padding.** An empty findings list is a good outcome.

## Procedure

### 1. Review

1. **Resolve the PR and confirm authorship** (ground rules above). Fetch
   metadata, diff, and CI status with `gh pr view`, `gh pr diff`,
   `gh pr checks`. Count the generated files (lock files such as
   `package-lock.json`, Vitest snapshots, anything marked `linguist-generated`
   in `.gitattributes`) and the non-generated changed lines, and compare with
   the size guide in `doc/rules/git-workflow.md`. An over-budget PR is a
   blocking PR hygiene finding that needs a manual split — do not try to fix
   it.
2. **Establish the spec.** Read the PR description and linked Jira story, and
   list the acceptance criteria for step 5. A title without the `REGEN-NNN: ` prefix or a body without the Jira story key is itself a finding
   (`doc/rules/git-workflow.md` requires one).
3. **Tiny-PR shortcut.** Under ~30 changed lines across at most 2 files:
   review directly, naming the applicable lens(es), and skip the acceptance
   criteria table.
4. **Apply the review lenses** exactly as defined in the `pr-review` skill —
   same lens table, same doc/rules references, same scoping rules (record
   skipped lenses with a reason; when unsure, include the lens). Since this is
   a pre-flight before a human reviews, err toward including a lens on close
   calls: cheaper to catch it now.
5. **Map acceptance criteria to evidence.** Give each criterion the evidence in
   the PR (a test name, or step N of the PR's "How to test" section) and a
   status: met, not met, or not verifiable from the diff. A criterion that is
   not met is blocking; one that is not verifiable goes in the human review
   focus so the reviewer can check it. Skip for Dependabot, docs-only and tiny
   PRs.
6. **Classify every finding**, tagging each blocking one `[confirmed — <how>]`
   or `[from reading]`: **blocking (in spec)** — a maintainer would send it
   back, or it violates a repo standard on lines the PR touches;
   **non-blocking (in spec)** — your discretion; **out of scope** — draft a
   new Jira story instead: title, short description, and the impact of not
   addressing it, ready for the backlog. Stating the consequence alongside
   the benefit gives triage a balanced cost-vs-benefit view.
7. **Check the description against the diff** — mismatched claims are
   blocking. When the code is wrong, fix the code (section 2). When the
   description is wrong, or "How to test" is missing, stale, or could not be
   followed without reading the code, report the corrected text for the author
   to paste — this skill never edits the PR record.
8. **Record coverage and the human focus.** State which files you read in
   full, skimmed and did not review, with reasons. Name two or three places
   where the reviewer's judgement is needed (design, spec fit, accessibility,
   auth or session risk), giving priority to anything you skimmed or could not
   verify.

### 2. Fix what is safely fixable

Fix a blocking finding only when **all** of these hold — otherwise report it
as needing manual attention:

- The finding is **confirmed**, not merely from reading.
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

Security-control choices, architecture/boundary changes, PR splits, and
anything where two plausible fixes disagree are never auto-fixed — the report
explains what is wrong and why it needs a decision.

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
<base> → <head>  •  <files> files (+<adds>/−<dels>, <n> generated)  •  CI: <passing/failing>
Spec: <Jira ref (and spec file, if any) or "no Jira key — add one before requesting review">
Size: <within budget | over budget: <n> non-generated lines — split at <boundary> before requesting review>
Reviewed: <n> of <m> files in full  (skimmed: <files — reason>; not reviewed: <lock files, generated assets — reason>)
Lenses: <applied>  (scoped out: <lens — reason>)
<Pushed fix commit <short-sha> for <N> finding(s). — omit if nothing was fixed>

### Acceptance criteria
| Criterion (from the story)         | Evidence in this PR                     | Status                                       |
| ---------------------------------- | --------------------------------------- | -------------------------------------------- |
| <AC as written>                    | <test name, or step N of How to test>   | met / not met / not verifiable from the diff |

### Blocking (in spec)
1. [FIXED] <file>:<line> [<lens>] [confirmed — <how>] <What was wrong and what the fix changed.>
2. [NEEDS MANUAL FIX] <file>:<line> [<lens>] [confirmed — <how> | from reading] <What is wrong and why it needs your decision.>

### Non-blocking (in spec)
1. <file>:<line> [<lens>] <One sentence.>

### Suggested new stories (out of scope for this PR)
1. <Draft story title>
   <Why it's valuable, where the issue lives.>
   Impact if not addressed: <concrete consequence — risk, cost, or missed benefit.>

### Verdict
<one of:>
- "Ready to request review — no blocking findings."
- "Fixed <N> finding(s) (commit <short-sha>, pushed) — ready to request review."
- "Fixed <N> of <M>; <M−N> need manual attention before requesting review."
- "Not ready: <N> blocking finding(s), none safely auto-fixable."
Human review focus: <two or three places where the reviewer's judgement is needed — paste into the PR description>
```

Omit the "Acceptance criteria" section for Dependabot, docs-only and tiny PRs,
and say so in the `Spec:` line. If some findings were fixed and others weren't,
report both plainly — never imply everything is resolved when it isn't.

## Anti-patterns

- Posting anything to the PR record on GitHub — this skill reports in chat and
  pushes at most one plain fix commit.
- Running it on a PR that isn't yours.
- Fixing something out of spec because it seemed valuable — that's a story
  suggestion, not a commit.
- Fixing a finding you have not confirmed, or labelling one `confirmed`
  without having reproduced it.
- Amending, rebasing, or force-pushing; skipping hooks; pushing anywhere but
  the PR's own head branch.
- Claiming a finding is fixed without the full gate passing on the change.
- Treating a skipped or failed lens as a clean pass, claiming full coverage of
  files you skimmed, or padding findings to look thorough.
