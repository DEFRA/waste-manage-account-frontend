# Spec 001 — Hello World Frontend (waste-manage-account-frontend)

|            |                                       |
| ---------- | ------------------------------------- |
| **Status** | Draft                                 |
| **Author** | Ibrahim Uylas                         |
| **Date**   | 2026-07-21                            |
| **Scope**  | Initial "Hello World" web application |

## 1. Overview

`waste-manage-account-frontend` is a new Node.js web application to be created from the [DEFRA CDP Node.js Frontend Template](https://github.com/DEFRA/cdp-node-frontend-template). For this first iteration the application is a minimal "Hello World" service: it must build, run, and pass all quality gates, and serve a single GOV.UK-styled page. No business functionality is in scope yet.

All work must comply with the [Defra Software Development Standards](https://defra.github.io/software-development-standards/) (source: [DEFRA/software-development-standards](https://github.com/DEFRA/software-development-standards)). Any deviation must be managed as an exception under Defra's architectural governance process.

## 2. Goals

1. Bootstrap the project from the CDP node frontend template, renamed to `waste-manage-account-frontend`.
2. Serve a single "Hello World" page at `/` using GOV.UK Frontend styling via Nunjucks.
3. Retain the template's health check endpoint (`/health`) for CDP platform compatibility.
4. Pass linting, formatting, and unit tests locally and in CI.
5. Provide a standards-compliant README.

## 3. Non-Goals

- Any waste-management business logic, forms, or journeys.
- Authentication, sessions beyond template defaults, or API integrations.
- Deployment to a CDP environment (the project should remain deployable, but actual deployment is out of scope).
- Performance, penetration, or high-availability testing (deferred until real functionality exists).

## 4. Technology Stack (inherited from the template)

The template's stack is used as-is; do not swap components without an approved exception.

| Concern          | Choice                                                                                                    | Standard/Rationale                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Runtime          | Node.js Active LTS (per template `.nvmrc`, managed with nvm)                                              | Defra Node.js standards: stay on Active LTS, never behind Maintenance LTS                |
| Server framework | Hapi                                                                                                      | Defra standard server framework; keep to a commercially supported major version          |
| Language         | Vanilla JavaScript, ES modules                                                                            | Defra JS standards: no TypeScript without exemption; ESM is the default module system    |
| Templating       | Nunjucks + GOV.UK Frontend (GOV.UK Design System components)                                              | Frontend frameworks (React/Vue/Angular) are prohibited; progressive enhancement required |
| Styling          | SCSS                                                                                                      | Template default                                                                         |
| Build            | Vite (+ Babel)                                                                                            | Template default                                                                         |
| Testing          | Vitest                                                                                                    | Template default                                                                         |
| HTTP client      | Undici (with ProxyAgent support)                                                                          | Template default                                                                         |
| Session/cache    | Catbox — CatboxRedis in production, CatboxMemory locally (`SESSION_CACHE_ENGINE`)                         | Node standards: no session state on the app server; use distributed cache                |
| Lint/format      | ESLint with neostandard, Stylelint, Prettier                                                              | Defra JS standards: neostandard, unmodified ruleset, `noStyle` disabled                  |
| Hooks            | Husky git hooks (`npm run git:hooks`)                                                                     | Template default                                                                         |
| Containers       | Dockerfile (development and production targets), Docker Compose (Redis, MongoDB, Floci for AWS emulation) | Template default                                                                         |

## 5. Functional Requirements

### FR1 — Hello World page

- `GET /` returns HTTP 200 with an HTML page rendered by Nunjucks.
- The page uses the GOV.UK Frontend page template (header, footer, skip link) and displays the heading **"Hello World"** in `govuk-heading-xl` (or equivalent Design System pattern).
- The page must be fully functional without client-side JavaScript (progressive enhancement).

### FR2 — Health check

- `GET /health` (as provided by the template) returns HTTP 200 with a success payload. Do not remove or alter it — CDP relies on it.

### FR3 — Error pages

- Unknown routes return the template's standard GOV.UK-styled 404 page; server errors return the standard 500 page.

## 6. Non-Functional Requirements

### NFR1 — Accessibility

- The page must meet WCAG 2.1 AA (Defra QA standards). Using unmodified GOV.UK Frontend components satisfies this for the Hello World page; verify with an automated check (e.g. axe) as part of the test run.

### NFR2 — Code quality

- `npm run lint` (ESLint/neostandard + Stylelint) and Prettier formatting checks pass with zero errors. The neostandard ruleset must not be extended or modified.
- Unit tests (Vitest) cover the home route and health route; all tests pass via `npm test`.

### NFR3 — Dependency and supply-chain hygiene

- npm only; both `package.json` and `package-lock.json` committed; `npm ci` in CI/production builds.
- `.npmrc` in the repo root with: `save-exact=true`, `ignore-scripts=true`, `min-release-age=7` (Defra Node.js security settings).
- Dependabot (or npm audit in CI) enabled for automated dependency checks.

### NFR4 — Logging

- Use the template's structured logging as-is (do not replace with `console.log`).

### NFR5 — Configuration

- All configuration via environment variables (e.g. `PORT`, `SESSION_CACHE_ENGINE`). No secrets in the repository — ever. If a credential is exposed, follow Defra's credential exposure process.

## 7. Project Setup

1. Create the repository from the template (GitHub "Use this template" or CDP portal self-service), named `waste-manage-account-frontend`.
2. Rename all template identifiers (`cdp-node-frontend-template` → `waste-manage-account-frontend`) in `package.json`, Docker files, compose files, and config.
3. `nvm use` (respect `.nvmrc`), then `npm install` and `npm run git:hooks`.
4. Verify locally: `npm run dev` serves the app on port 3000; `npm test` and `npm run lint` pass.
5. Verify Docker: development and production images build and run (`docker build`, `docker run -p 3000:3000`); `docker compose up --build -d` starts the full local stack.

## 8. Version Control & Workflow

- Git repository in the Defra GitHub organisation (central management standard).
- `main` is protected: required status checks (lint + test) and at least one approving review before merge; no direct pushes.
- Work happens on short-lived feature branches merged via pull request (Defra PR process).
- Releases are tagged using semantic versioning (`v0.1.0` for the Hello World release) before any deployment, and the version number is present in `package.json`.

## 9. Testing & CI

- **Unit tests (Vitest):** home route returns 200 and contains "Hello World"; health route returns 200; error routes render correct status pages.
- **CI (GitHub Actions, from template):** on every PR run `npm ci`, lint, format check, and tests; SonarCloud quality gate must pass.
- Manual check: page renders correctly in GOV.UK-supported browsers with JavaScript disabled.
- Broader QA (performance/JMeter, penetration, HA testing) is explicitly deferred — see Non-Goals.

## 10. README (per Defra README standards)

The repository README (Markdown, at root) must include: product description (what the service will become and what this repo is), prerequisites, setup instructions, how to run in development, how to run tests, branching approach, contribution/PR instructions, and licensing.

## 11. Licensing

Open Government Licence v3.0, retaining the attribution: "Contains public sector information licensed under the Open Government Licence v3.0."

## 12. Acceptance Criteria

- [ ] Repo created from `cdp-node-frontend-template`, renamed throughout.
- [ ] `GET /` renders a GOV.UK-styled "Hello World" page; works without client-side JS.
- [ ] `GET /health` returns 200.
- [ ] `npm run lint` and `npm test` pass; CI green; SonarCloud gate passes.
- [ ] `.npmrc` security settings present; lockfile committed; Dependabot enabled.
- [ ] `main` branch protected with required checks and review.
- [ ] README meets Defra README standards; OGL v3 licence and attribution present.
- [ ] `v0.1.0` tagged.

## 13. References

- Template: https://github.com/DEFRA/cdp-node-frontend-template
- Standards (source): https://github.com/DEFRA/software-development-standards
- Standards (site): https://defra.github.io/software-development-standards/
  - Node.js standards, JavaScript standards, Version control standards, README standards, Quality assurance and test standards
- GOV.UK Design System: https://design-system.service.gov.uk/
