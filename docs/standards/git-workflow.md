# Git workflow: version control, commits and pull requests

Adapted for this repo from the DEFRA [version control standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/version_control_standards.md) and [pull requests process](https://github.com/DEFRA/software-development-standards/blob/master/docs/processes/pull_requests.md). Last synced 30 July 2026.

## Version control standards

- All code is held in the Defra GitHub organisation.
- `main` is protected with required status checks and approving reviews. No direct commits to `main`, ever.
- All releases are tagged before deployment, use [semantic versioning](https://semver.org/), and include a commit updating the version number in `package.json`.

## Pull request process

Goals: focused PRs, simple reviews, a clean commit history, and respect for reviewers' time.

1. **Always on a branch.** However small the change: `git checkout -b <short-descriptive-branch-name>`.
2. **Start with an empty commit** (`git commit --allow-empty`) using this template:

   ```text
   50 character limited title

   Link to originating story/bug in Jira

   Description covering why we're making this change, and briefly what the change is.
   ```

   Cover **the actual change you intend to make**, not a repeat of the backlog story — the Jira link provides that context.

3. **Push immediately and open the PR** (`git push -u origin <branch>`) so the proposed change is visible from the start. GitHub will populate the PR from the empty commit. Assign yourself.
4. **Code, committing frequently.** Interim messages can be informal but keep `WIP` noise to a minimum — they're visible in the PR.
5. **Keep your branch up to date** with `git rebase origin/main` (preferred over merge, to keep the PR history clean).
6. **Get it reviewed.** At least one other developer must review and approve before merge.
7. **Squash and merge**, rewording the combined text into a single clean commit message, then **delete the branch**.

## Commit message rules

1. Separate subject from body with a blank line
2. Limit the subject line to 50 characters
3. Capitalise the subject line
4. Do not end the subject line with a period
5. Use the imperative mood in the subject line (_Add ability_, not _Added ability_)
6. Use the body to explain _what and why_, not _how_

Source: [How to write a Git commit message](https://chris.beams.io/posts/git-commit/).
