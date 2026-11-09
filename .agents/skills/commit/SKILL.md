---
name: commit
description: >
  Commit finished work in this repository as one or more atomic commits with messages in the
  DEFRA style (capitalised imperative subject of at most 50 characters, blank line, the Jira
  story key, then a body saying what and why). Use whenever asked to commit, save, or check in
  changes. Stages explicit paths only, runs the repo gate first and never commits loop artefacts.
allowed-tools: Bash
---

You are committing changes in this repository. Follow the DEFRA pull request process as
recorded in `doc/rules/git-workflow.md` and summarised in `AGENTS.md` ("Git workflow"). Use
plain `git` commands — no MCP servers are needed.

## Commit message format

```
Capitalised imperative subject, 50 characters max

Jira: REGEN-NNN

Why this change is needed and, briefly, what it changes. Wrap at 72 characters.
```

Rules for the message:

1. Separate the subject from the body with a blank line.
2. Limit the subject to 50 characters.
3. Capitalise the subject.
4. Do not end the subject with a period.
5. Use the imperative mood (_Add ability_, not _Added ability_).
6. Use the body to explain _what and why_, not _how_. Name the Jira story key on its own line
   when one exists — a repository autolink reference makes it clickable. Take the key from the
   branch name (`REGEN-150-change-contact-email` gives `REGEN-150`); on a branch with no key,
   ask rather than invent one, and omit the line for work with no story (dependency bumps,
   tooling).
7. Wrap the body at 72 characters.
8. A single-commit PR is squash-merged under its commit subject, so when the branch will have
   only this commit, prefix the subject with the story key: `REGEN-150: Validate the contact
email field`.

## Procedure

1. **Analyse the changes**: `git status` and `git diff` before composing anything.
2. **Atomic commits**: each commit captures one logical change. If the working tree holds
   separable concerns (a refactor _and_ the feature it enables, or two unrelated fixes), produce
   one commit per concern rather than a grab-bag commit.
3. **Stage selectively**: `git add -- <paths>` with explicit paths. Never `git add -A` or
   `git add .` when the diff spans more than one concern.
4. **Never stage loop or local artefacts**: `IMPLEMENTATION_PLAN.md`, `PROGRESS.md`,
   `PROMPT_*.md`, `.ralph/`, `.env`. They are gitignored; if one shows as tracked or modified,
   stop and ask.
5. **Check recent commits** (`git log --oneline -10`) to stay consistent with the branch.
6. **Verify first**: the change must pass the repo gate,
   `npm run security-audit && npm run format:check && npm run lint && npm test`, and coverage
   must not drop below its previous figure (`doc/rules/quality-assurance.md`). If the gate
   fails, fix the cause; never weaken a test or lower coverage to get green.
7. **Commit** with a heredoc so the subject, blank lines and body keep their newlines:

   ```bash
   git commit -m "$(cat <<'MSG'
   Validate the contact email address field

   Jira: REGEN-150

   The form accepted any value and passed it to the accounts API, which
   rejected it with a 400 the user never saw. Validate the field with Joi
   and re-render the page with the GOV.UK error summary and field message.
   MSG
   )"
   ```

8. **Commit immediately** once the message is composed: the user invoked this skill because they
   want a commit. Respect hooks (never `--no-verify`; the pre-commit hook runs the gate), never
   amend or rewrite a pushed commit, and never create an empty commit except the PR-opening one
   described in `doc/rules/git-workflow.md`.

## Quality standards

- No tool signatures or co-author trailers in commit messages; the message carries the subject,
  the story key and the body, nothing else.
- One logical change per commit; split larger diffs into several atomic commits in a single
  invocation.
- Body in sentences, two to five lines; no bullet dumps of file names, which the diff already
  shows.
- Match the branch's style, not its content: do not copy earlier messages.

## Examples

Subject, story key and body (the usual case):

```
Show the signed-in user's name in the header

Jira: REGEN-152

Users could not tell which account they were signed in to. Read the
display name from the session and pass it to the page layout; the
header falls back to a plain "Sign in" link when there is no session.
```

Work with no story:

```
Pin govuk-frontend to 6.6.0

Picks up the fix to error summary focus handling. No template changes;
the pages were checked against the prototype after the upgrade.
```

If the intent or scope of the changes is unclear, ask specific questions before committing.
