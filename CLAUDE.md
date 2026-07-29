# Project rules — waste-manage-account-frontend

GOV.UK frontend for the Defra waste management account service: Hapi +
Nunjucks + GOV.UK Frontend, server-rendered, Defra ID (OIDC) sign-in.
All work follows the
[Defra Software Development Standards](https://defra.github.io/software-development-standards/).
These are the hard rules; the skills in `.claude/skills/` hold the detailed
recipes — use them.

## Hard rules (never break these)

- **Vanilla JavaScript only.** No TypeScript, no React/Vue/Angular, no
  client-side rendering. Pages are server-rendered Nunjucks using GOV.UK
  Design System components and must work with JavaScript disabled
  (progressive enhancement).
- **neostandard stays unmodified.** Never weaken or disable its rules in
  `eslint.config.js`; project additions (like the auth-layer import zones)
  may only add rules.
- **Never commit to `main`.** All work on short-lived branches, merged by
  reviewed PR, kept current with `rebase` (never merge `main` in), squashed
  on merge. Conventional-commit messages (`feat:`, `fix:`, ...).
- **Coverage ≥ 90% and never decreasing** — `npm test` enforces thresholds;
  never lower them, and never delete/weaken a failing test to get green.
- **No secrets in the repo, ever.** Configuration is env vars only; secrets
  get no defaults. New config touches all five places: `src/config/index.js`,
  `src/config/validate.js` (+ its tests), `.env.example`, the README table.
- **Never log PII or secrets** (names, emails, tokens, session ids). Use the
  pino logger, never `console.log`, and `src/auth/core/audit.js` for
  security events.
- **Auth is deny-by-default.** Every route except `/health` and `/public/*`
  requires a session; guards fail closed (403, never a silent fallback).
  Respect the auth layer boundaries: routes → `auth/service.js` only, never
  providers/clients directly (lint enforces this).
- **`.npmrc` settings are non-negotiable** (`save-exact`, `ignore-scripts`,
  `min-release-age`). npm only; exact versions; no postinstall reliance.
- **WCAG 2.1 A/AA** for every page: GOV.UK components, server-side
  validation, an axe-core test per page.

## Commands

- `npm run dev` — dev server (build assets first: `npm run build:frontend`)
- `npm test` — full suite with coverage gate (`TZ=UTC NODE_ENV=test`)
- `npm run lint` / `npm run format:check` — must pass before any commit

## Detailed recipes (skills in `.claude/skills/`)

`new-route` (page/route/view/tests scaffold) · `write-tests` (Vitest
conventions and env-stubbing gotchas) · `commit` (conventional commits)
