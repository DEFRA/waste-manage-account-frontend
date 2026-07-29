---
name: write-tests
description: Use this skill when writing or modifying tests in this repository — unit tests, route tests, auth/integration tests, or when a test fails in CI but passes locally. It captures the project's Vitest conventions, the canned-user and mock-IdP helpers, and the environment-stubbing gotchas (Redis in CI, rate limiting, fresh imports).
---

Tests run with Vitest: `npm test` (`TZ=UTC NODE_ENV=test`, with v8 coverage) or `npm run test:watch`. The Defra bar: **coverage ≥ 90% and never decreasing** — a change that lowers coverage is not mergeable.

## Conventions

- **Colocate** tests as `<file>.test.js` next to the source file. Cross-cutting integration tests live in `test/` (e.g. `test/auth-integration.test.js`).
- `describe` blocks name the behaviour and cite the spec requirement where one exists (e.g. `'GET / — deny by default outside NODE_ENV=test (FR-3)'`). Test names state observable behaviour, not implementation.
- **Testing pyramid**: prefer a unit test on the module over a route test, and a route test over a full integration test — push detection as low as it will go. Pure functions (like `validateConfig`) are tested with literal inputs, no server.
- `clearMocks` is on globally; still `vi.unstubAllEnvs()` in `afterEach` when you stub env vars.

## Route tests — the house pattern

```js
import { afterEach, describe, expect, test } from 'vitest'
import { createServer } from '../server.js'

describe('GET /thing', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('returns 200 with an HTML page', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/thing')

    expect(res.statusCode).toBe(200)
  })
})
```

- Always `server.inject()` — never bind a real port.
- Always stop the server in `afterEach` exactly as above.

## Auth in tests — three modes, pick deliberately

1. **`NODE_ENV=test` bypass (default)**: every injected request is signed in as the canned *Test Operator* user (`src/auth/testing/users.js`). Select a different canned user with a header: `headers: { 'x-test-user-type': 'no-org-operator' }`.
2. **Stub provider**: for testing the stub login chooser itself (`src/routes/auth/stub.test.js`).
3. **Mock IdP** (`test/helpers/mock-idp.js`): for end-to-end OIDC flow tests — real discovery, token exchange, RS256/JWKS verification against an in-process IdP. Use for provider integration tests only; it is the same mock `npm run demo` uses.

## Environment-stubbing gotchas (the CI-only failure traps)

`src/config/index.js` and `server.js` read `process.env` **at import time**, so simulating a non-test environment requires stub + module reset + fresh import:

```js
vi.stubEnv('NODE_ENV', 'production')
vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
// CRITICAL: NODE_ENV=production defaults the session cache to Redis.
// CI runners have no Redis — initialize() would hang/fail there while
// passing on a laptop running Redis. Always pin the cache to memory:
vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
vi.resetModules()
const { createServer } = await import('../server.js')
```

Also remember:

- `SESSION_SECRET` (≥ 32 chars) is required whenever `NODE_ENV` is not `test` — stub it or `validateConfig` throws at boot.
- **Rate limiting** is effectively off under `NODE_ENV=test` (max defaults to `MAX_SAFE_INTEGER`) so suites can hammer `/auth/*`. To test rate limiting itself, opt back in with an explicit `AUTH_RATE_LIMIT_MAX` (see `src/plugins/rate-limit.test.js`).
- Time-sensitive assertions: the suite runs under `TZ=UTC` — never assume local time.

## Accessibility tests

Every user-facing page gets an automated **axe-core** check (WCAG 2.1 A/AA) — follow the existing axe pattern (jsdom + axe-core over the injected HTML). Axe catches only a subset of WCAG; flag anything needing manual accessibility review in the PR.

## What not to do

- Don't weaken or delete a failing test to get green — fix the code or renegotiate the requirement in the PR.
- Don't mock modules this repo owns when a real instance is cheap (prefer `server.inject` over mocking plugins).
- Don't put credentials or real personal data in fixtures — canned users use `example.test` addresses.
