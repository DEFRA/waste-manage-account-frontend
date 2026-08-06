# waste-manage-account-frontend

GOV.UK frontend service for managing waste accounts, built on Defra's CDP frontend template (Hapi + Nunjucks + govuk-frontend). All work in this repo must follow the [DEFRA software development standards](https://github.com/DEFRA/software-development-standards).

## Detailed standards

The rules below are the always-applicable summary. The full standards, tailored to this repo, live in `doc/rules/` — **read the relevant file before starting the matching kind of task**:

- [javascript-nodejs.md](doc/rules/javascript-nodejs.md) — writing any JS; adding dependencies; Hapi/ESM conventions
- [common-coding.md](doc/rules/common-coding.md) — readability, naming, comments, simplicity; coverage rules
- [git-workflow.md](doc/rules/git-workflow.md) — branching, commit messages, the full PR process
- [security-logging.md](doc/rules/security-logging.md) — secure coding, GitHub Advanced Security, logging and PII rules
- [containers.md](doc/rules/containers.md) — Dockerfile and image changes
- [continuous-integration.md](doc/rules/continuous-integration.md) — workflow changes, action SHA-pinning, Sonar
- [quality-assurance.md](doc/rules/quality-assurance.md) — acceptance criteria, accessibility (WCAG 2.2 AA), test approach

## Reusable skills

Agent-invocable procedures live in `.agents/skills/` in the open Agent Skills format (`SKILL.md`). Codex and GitHub Copilot read that directory natively; Claude Code reads the same skills through the `.claude/skills/` symlinks. When a task matches one of these skills, follow the skill rather than improvising:

- `pr-review` — review a colleague's PR against the linked Jira story and these standards. Findings are reported for a human to act on; the AI never approves, requests changes, or comments.
- `pr-preflight` — pre-flight check of your own PR before requesting human review; may fix mechanical, in-spec blocking findings (new commit, plain push, full gate first).

Both skills enforce scope discipline: AI-suggested changes must be in spec (the linked story's acceptance criteria plus these standards on the lines the PR touches). Valuable out-of-scope findings are raised as suggested new Jira stories, never as changes or change requests on the PR.

## Language and frameworks

- Vanilla JavaScript only. Never introduce TypeScript, type annotations, or `.ts` files — this requires a formally approved exception.
- No front-end frameworks (React, Vue, Angular, etc.). Follow progressive enhancement: pages must work without client-side JavaScript and CSS.
- Use GOV.UK Design System components (govuk-frontend) for all UI. Do not hand-roll components that the Design System already provides.
- Server framework is Hapi — follow existing plugin/route patterns in `src/server`. Templates are Nunjucks.
- ES modules (`import`/`export`) throughout; this package is `"type": "module"`.
- Prefer `async`/`await` over callbacks. Never block the event loop with CPU-heavy work in request handlers.
- No session state on the app server: use the existing yar/catbox (Redis) setup, never in-process session storage tied to one instance.

## Code style

- Linting is neostandard (`npm run lint`) with formatting delegated to Prettier (`npm run format`). Do not modify or extend the neostandard ruleset, and do not fight the formatter — run it.
- Naming: intent-revealing names, no generic names (`p`, `temp`, `v`, `data2`), avoid unexplained domain acronyms. Prefer objects with named keys over positional arrays.
- Keep functions small and named for what they do ("separate in order to name"). Aim for code readable without comments.
- Comments, when needed, explain _why_, not _how_. Never leave commented-out code — git history is the record.
- Simplicity first: no speculative abstraction or premature reuse. Apply the rule of three before abstracting.

## Dependencies

- Use npm only. Pin exact versions in `package.json` — never `^`, `~`, `*` or ranges. The repo `.npmrc` (`save-exact`, `ignore-scripts`, `min-release-age=7`) must not be weakened.
- Vet any new package before adding it (maintenance, popularity, licence, security history) and say why it was chosen. Keep `dependencies` and `devDependencies` correctly separated.
- Use `npm ci` (not `npm install`) in CI and Docker production builds.
- Keep Node on Active LTS as set in `.nvmrc`; do not change the Node version casually.

## Testing and quality

- Every change ships with tests (Vitest). Unit test coverage must stay at or above 90% and must never decrease.
- Run the full pre-commit gate locally before proposing a change: `npm run security-audit && npm run format:check && npm run lint && npm test`.
- Negative cases matter as much as positive ones — test validation failures, unauthorised access, and error paths.
- Server-side validation is required for every form field, with GOV.UK error message/summary patterns.
- All pages must meet WCAG 2.2 AA. Preserve the accessibility behaviour of govuk-frontend components when customising templates.

## Security

- Follow OWASP secure coding practices (quick reference guide v2).
- Never log PII or secrets: no names, addresses, emails, phone numbers, NI numbers, usernames, passwords, tokens, or API keys in log output.
- Logs are structured (ECS format via pino + @elastic/ecs-pino-format). Use the existing logger; never `console.log`. Log levels must stay environment-configurable.
- Never commit credentials, connection strings, or `.env` values. If a secret is ever exposed in git history, treat it as compromised and follow Defra's credential exposure process.
- In GitHub Actions workflows, pin third-party actions to a full commit SHA (with the version as a trailing comment), never a tag or branch.

## Git workflow

- All work happens on a branch — never commit directly to `main`. Main is always shippable.
- Commit messages: imperative mood, capitalised subject ≤50 characters, no trailing period, blank line, then a body explaining _what and why_ (link the Jira story where one exists).
- PRs are small and focused on one change, squash-merged, and the branch deleted after merge.
- Releases follow semantic versioning; the version number lives in `package.json`.

## Docker

- Images extend the Defra parent images (`defradigital/node` / `defradigital/node-development`) and run as the non-root `node` user. Don't add root-level steps without switching back to `node`.
- Production images are immutable: configuration comes from environment variables, never baked-in per-environment values.
