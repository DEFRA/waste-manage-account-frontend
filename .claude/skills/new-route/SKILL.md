---
name: new-route
description: Use this skill when adding a new page, route, or endpoint to this service — any new URL path, Hapi route, or Nunjucks view. It walks through the house pattern for route + view + registration + tests so the result matches the Defra standards (progressive enhancement, WCAG 2.1 AA, auth-by-default) and the project's layered architecture.
---

Follow this recipe end to end — a route is not done until every step, including the tests, is in place. The hard rules behind these steps live in the project's `CLAUDE.md` and the [Defra Software Development Standards](https://defra.github.io/software-development-standards/).

## 1. Route handler — `src/routes/<name>.js`

Export a plain Hapi route object (see `src/routes/home.js` and `src/routes/organisation.js` for the pattern):

```js
export const thing = {
  method: 'GET',
  path: '/thing',
  handler(request, h) {
    return h.view('thing', {
      /* view model */
    })
  }
}
```

- **Auth is on by default.** The default `session` strategy protects every route, so `request.auth.credentials` is the verified user profile — do not add per-route auth config for protected pages. Only a deliberately public route (like `/health`) opts out with `options: { auth: false }`, and that choice needs a comment saying why.
- **Layer boundaries** (enforced by `eslint.config.js` `import/no-restricted-paths`): routes may import from `src/auth/service.js` and `src/auth/core/`, but never from `src/auth/providers/` or `src/auth/clients/`. If you need provider behaviour, go through `service.js`.
- Organisation-scoped pages must **fail closed**: use the guard pattern from `src/auth/core/guards.js` / `src/routes/organisation.js` (unknown or non-member organisation → 403, never a silent fallback).
- Handlers stay thin — parsing, guarding, view-model building. Anything reusable belongs in a module with its own tests.

## 2. Register it — `src/plugins/router.js`

Add the imported route to the `routes` array. Nothing else: no conditionals in the router (provider-conditional routes come via `extraRoutes()`).

## 3. View — `src/views/<name>.njk`

```njk
{% extends "layouts/page.njk" %}

{% block pageTitle %}Thing – {{ serviceName }} – GOV.UK{% endblock %}

{% block content %}
  <h1 class="govuk-heading-xl">Thing</h1>
  ...
{% endblock %}
```

- Use **GOV.UK Design System** components/classes only (`govuk-heading-xl`, `govuk-body`, `govuk-list`, macros from `govuk/components/...`). No custom CSS unless truly necessary (then it goes in `src/client/stylesheets/`).
- **Progressive enhancement is mandatory**: the page must be complete and functional with JavaScript disabled. No client-side rendering, no framework.
- Page title format: `<Page> – {{ serviceName }} – GOV.UK`.
- Forms: POST with server-side validation and GOV.UK error summary/message components; re-render with errors, never rely on client validation.
- Set `isAuthenticated: true` in the view context only when the route reads the session (drives the Sign in/Sign out nav in `layouts/page.njk`).

## 4. Tests — colocated `src/routes/<name>.test.js`

Follow `src/routes/home.test.js`; see the `write-tests` skill for the full conventions. Minimum coverage for a new page:

- 200 + `text/html` for the happy path via `server.inject()`
- Key content is present in the raw server-rendered HTML (progressive enhancement proof)
- GOV.UK page furniture renders (skip link, header, footer)
- Auth behaviour: unauthenticated request redirects to `/auth/login?returnTo=...` (use the `vi.stubEnv('NODE_ENV', 'production')` + fresh-import idiom — and remember `SESSION_CACHE_ENGINE=memory`)
- Any guard paths (403s) and empty states
- **axe-core accessibility check** of the rendered page (WCAG 2.1 A/AA) — follow the existing axe test pattern in the suite

## 5. Before opening the PR

`npm run lint`, `npm run format:check`, `npm test` all green locally (the Husky hooks enforce this anyway), coverage has not dropped below 90%, and the README is updated if the route changes user-visible behaviour or configuration.
