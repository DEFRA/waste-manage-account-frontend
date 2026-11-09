# Git workflow: version control, commits and pull requests

Adapted for this repo from the DEFRA [version control standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/version_control_standards.md) and [pull requests process](https://github.com/DEFRA/software-development-standards/blob/master/docs/processes/pull_requests.md). Last synced 9 November 2026.

## Version control standards

- All code is held in the Defra GitHub organisation.
- `main` is protected by repository rulesets: two approving reviews (GitHub states this when a PR is opened; a new push dismisses stale approvals and the latest push needs an approval from someone other than its author), all review threads resolved, the `Run Pull Request Checks` status check up to date with `main`, signed commits, and no force pushes or deletion. No direct commits to `main`, ever.
- All releases are tagged before deployment, use [semantic versioning](https://semver.org/), and include a commit updating the version number in `package.json`.

## Pull request process

Goals: focused PRs, simple reviews, a clean commit history, and respect for reviewers' time.

1. **Always on a branch.** However small the change: `git checkout -b REGEN-NNN-short-slug`, for example `REGEN-150-change-contact-email`. The DEFRA process uses a plain descriptive name; this repo prefixes the Jira story key so the PR title and the story can be read from the branch. Dependabot branches are exempt.
2. **Start with an empty commit** (`git commit --allow-empty`) using this template:

   ```text
   50 character limited title

   Jira story key of the originating story or bug, e.g. REGEN-NNN

   Description covering why we're making this change, and briefly what the change is.
   ```

   Cover **the actual change you intend to make**, not a repeat of the backlog story — the Jira story key provides that context.

3. **Push immediately and open the PR** (`git push -u origin REGEN-NNN-short-slug`) so the proposed change is visible from the start. Title it `REGEN-NNN: summary` — imperative, 50 characters at most including the key — and fill in `.github/PULL_REQUEST_TEMPLATE.md`, which GitHub offers in place of the commit message; the empty commit still carries the why in the history. Assign yourself, open the PR as a draft until it is ready, and complete the "How to test" section before you request review.
4. **Code, committing frequently.** Interim messages can be informal but keep `WIP` noise to a minimum — they're visible in the PR.
5. **Keep your branch up to date** with `git rebase origin/main` (preferred over merge, to keep the PR history clean). Never rebase or force-push a branch someone else is working on.
6. **Keep the PR small.** One story slice per PR — a PR that mixes a new page, a configuration change and a refactor is three PRs. Size guide: at most about 800 non-generated changed lines (generated means lock files such as `package-lock.json` and Vitest snapshots); above that, split before asking for review. The `pr-review` and `pr-preflight` skills flag a PR over the guide with a suggested split point. The figure was proposed in November 2026 and the team can revise it here.
7. **Get it reviewed.** Two other developers must review and approve before merge — GitHub enforces two approving reviews on `main`. AI review (the `pr-review` and `pr-preflight` skills) prepares for the human review and never replaces or approves it.
8. **Squash and merge**, rewording the combined text into a single clean commit message, then **delete the branch**. GitHub names the squash commit after the PR title when the PR has several commits, but after the commit subject when it has only one: give a single commit the same `REGEN-NNN: ` prefix.

## Pull request description

The description follows `.github/PULL_REQUEST_TEMPLATE.md`:

- **Why**: why the change is needed and briefly what it does, with the Jira story key (a repository autolink reference makes it clickable) and the spec file where one exists. Not a copy of the story.
- **What changed**: one bullet per behaviour change, not per file.
- **How to test**: everything QA or another developer needs to verify the change without reading the code — the environment (`npm run dev` or the Compose stack), preconditions such as Redis, the DEFRA ID stub and a registered test user, numbered steps as pages or URLs with the expected content, the validation errors and error summary, an accessibility check (keyboard navigation and axe), the Vitest files that cover the change, and what still needs a human. Required for any behaviour, schema or configuration change; `No behaviour change: <reason>` is acceptable for a docs-only or tooling PR.
- **Checklist**: the gate (`npm run security-audit && npm run format:check && npm run lint && npm test`), tests and coverage, server-side validation and accessibility, no PII or secrets, docs updated, dependencies pinned.

This is how the repo meets the DEFRA [quality assurance standard](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/quality_assurance_standards.md)'s expectation that each story's testing is documented alongside the story. The `pr-review` and `pr-preflight` skills check that "How to test" is present, matches the diff and could be followed without reading the code.

## Commit message rules

1. Separate subject from body with a blank line
2. Limit the subject line to 50 characters
3. Capitalise the subject line
4. Do not end the subject line with a period
5. Use the imperative mood in the subject line (_Add ability_, not _Added ability_)
6. Use the body to explain _what and why_, not _how_, and name the Jira story key where one exists

Source: [How to write a Git commit message](https://chris.beams.io/posts/git-commit/). The `commit` skill in `.agents/skills/commit` produces this format.
