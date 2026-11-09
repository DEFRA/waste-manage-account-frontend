# pr-review

Reviews a colleague's pull request against the linked Jira story and this repo's standards
(`AGENTS.md`, `doc/rules/`) and produces a report for a human to act on. It never approves,
requests changes or comments on GitHub: two human developers still review and approve every PR,
and this skill exists to make that review faster and better informed.

The agent-facing procedure is in [SKILL.md](SKILL.md); this file is for developers. For a pull
request of your own, use [pr-preflight](../pr-preflight/README.md) instead.

## When to use it

- You have been asked to review a PR and want the mechanical checks done before you read it.
- A PR is large and you want to know which files were read in full and where human judgement is
  most needed.
- You want the story's acceptance criteria mapped to the evidence in the PR before you approve.

## How to start it

| Tool        | How                                                                      |
| ----------- | ------------------------------------------------------------------------ |
| Claude Code | `/pr-review 42` (a PR number, URL or branch name)                        |
| Codex       | `$pr-review` (or pick it from `/skills`), then give the PR number        |
| Either      | Ask in plain words: "review PR 42"; the skill loads from its description |

Have to hand: the PR number, and the Jira story text if the agent cannot read it (it will ask
you to paste the acceptance criteria and will say what it judged against).

## What happens

1. It fetches the PR metadata, diff and CI status with `gh`, counts the generated files (lock
   files, snapshots) and compares the non-generated lines with the size guide in
   `doc/rules/git-workflow.md`.
2. It reads the PR description and the story, lists the acceptance criteria, and applies the
   review lenses that fit the changed files: security, quality, redundancy, testing,
   accessibility, architecture, dependencies, PR hygiene and, for `specs/`, spec. A PR under about
   30 changed lines is reviewed directly instead.
3. It maps each acceptance criterion to its evidence (a test name, or a step of the PR's "How to
   test" section) and a status: met, not met, or not verifiable from the diff.
4. It classifies every finding as blocking (in spec), non-blocking (in spec) or out of scope; the
   last becomes a suggested new Jira story, never a change request. Blocking findings are tagged
   `[confirmed — <how>]` when it reproduced them or `[from reading]` when it did not.
5. It checks the description against the diff, de-duplicates, and records which files it read in
   full, skimmed or did not review.

It reviews from the diff; it checks the branch out only when a finding has to be reproduced, in a
throwaway worktree, and restores your working tree afterwards.

## What you get

A report in chat with a header (files, generated count, CI, spec, size, reviewed, lenses), an
acceptance criteria table, numbered blocking and non-blocking findings with file and line,
suggested new stories with their impact if not addressed, a verdict, and a "Human review focus"
naming two or three places where your judgement is needed. There is no praise section; an empty
findings list is a good outcome.

## What it never does

- Approve, request changes, comment or react on GitHub. If you want findings posted, read the
  report first and ask for exactly those.
- Change code on the colleague's branch.
- Ask for work outside the story's acceptance criteria and the standards on the lines the PR
  touches.

## Afterwards

- Read the "Human review focus" and the files it skimmed or could not verify first; that is where
  the report is least able to help.
- Raise the suggested new stories in the backlog if you agree with their impact.
- Do your own review and approve, request changes or comment yourself; the report informs your
  decision, it is not a substitute for it.
