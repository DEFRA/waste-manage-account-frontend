<!-- Title: imperative mood, capitalised, 50 characters, no trailing period. See doc/rules/git-workflow.md. -->

## Why

<!-- Why this change is needed and briefly what it does. Not a copy of the story. -->

Jira: https://eaflood.atlassian.net/browse/REGEN-NNN
Spec: specs/NNN-slug.md <!-- or "none" -->

## What changed

- <!-- One bullet per behaviour change, not per file -->

## How to test

<!-- Everything QA or another developer needs to verify this change without reading the code.
     Required for any behaviour, schema or configuration change. For a docs-only or tooling PR,
     replace this section with "No behaviour change: <reason>". -->

**Environment:** <!-- Local: `npm run dev` at http://localhost:3000, or the Compose stack (`docker compose up --build -d`); and/or the CDP environment -->
**Preconditions:** <!-- Redis and the DEFRA ID stub running (`docker compose up -d redis cdp-defra-id-stub`); a test user registered in the stub (README, "DEFRA ID authentication"); session data or feature state needed; new configuration keys or environment variables (src/config/config.js) -->
**Test user:** <!-- Which stub user to sign in as (role, organisation, enrolment); never real DEFRA ID credentials -->

### Steps

1. <!-- Page or URL to visit and what to do. Expected: the content, status code or redirect -->
2. <!-- Negative case: invalid or missing input shows the GOV.UK error summary and the field's error message; a signed-out user is redirected to sign-in; a forbidden action gets the right error page -->
3. <!-- Accessibility: tab through the page (focus visible, order logical, nothing unreachable) and run axe (browser extension or axe DevTools) with no new violations; the page still works with JavaScript and CSS disabled -->

### Automated tests

- <!-- Vitest files covering this change, for example src/server/auth/refresh-tokens.test.js -->

### Not covered

- <!-- What needs a human: exploratory areas, screen reader checks, supported browsers and mobile, CDP-only configuration -->

## Checklist

- [ ] Full gate run locally: `npm run security-audit && npm run format:check && npm run lint && npm test`
- [ ] Tests added or updated; coverage at or above 90% and not decreased
- [ ] Every new form field has server-side validation with the GOV.UK error message and error summary
- [ ] Pages meet WCAG 2.2 AA and work without client-side JavaScript and CSS
- [ ] No PII or secrets in code, logs or test data
- [ ] README or spec updated where behaviour or setup changed
- [ ] New dependencies pinned to exact versions, with the reason for choosing them in the description
