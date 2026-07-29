import { afterEach, describe, expect, test, vi } from 'vitest'

import { createServer } from '../server.js'

describe('GET / (Hello World, FR1)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('returns 200 with an HTML page', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/')

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
  })

  test('renders "Hello World" in a govuk-heading-xl heading', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/')

    expect(res.payload).toMatch(
      /<h1 class="govuk-heading-xl">\s*Hello World\s*<\/h1>/
    )
  })

  test('renders the GOV.UK page furniture: skip link, header, and footer', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/')

    expect(res.payload).toContain('govuk-skip-link')
    expect(res.payload).toContain('govuk-header')
    expect(res.payload).toContain('govuk-footer')
  })

  test('works without client-side JavaScript (no required script tags)', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/')

    // Progressive enhancement: the page content must be fully server-rendered,
    // so "Hello World" is present in the raw HTML regardless of any scripts.
    expect(res.payload).toContain('Hello World')
  })
})

describe('GET / — protected home content (spec §11.3)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('shows the signed-in user, their relationships, and current organisation', async () => {
    server = await createServer()
    await server.initialize()

    // Default NODE_ENV=test canned user (test-users.js): Test Operator,
    // a single relationship to org-1 which is also their current one.
    const res = await server.inject('/')

    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('Test Operator')
    expect(res.payload).toContain('operator@example.test')
    expect(res.payload).toContain('Acme Recycling Ltd')
  })

  test('shows a Sign out link in the header', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/')

    expect(res.payload).toMatch(/href="\/auth\/logout"[^>]*>\s*Sign out/)
  })

  test('a user with no relationships sees a friendly empty state', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject({
      url: '/',
      headers: { 'x-test-user-type': 'no-org-operator' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('You are not linked to any organisations.')
    expect(res.payload).toContain('No current organisation is set.')
  })
})

describe('Header account navigation — unauthenticated pages (FR-5)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('a public page rendered without a session shows a Sign in link', async () => {
    server = await createServer()
    await server.initialize()

    // /auth/signed-out is public and never sets isAuthenticated in its view
    // context, so the layout must fall back to "Sign in".
    const res = await server.inject('/auth/signed-out')

    expect(res.statusCode).toBe(200)
    expect(res.payload).toMatch(/href="\/auth\/login"[^>]*>\s*Sign in/)
    expect(res.payload).not.toContain('Sign out')
  })
})

describe('GET / — deny by default outside NODE_ENV=test (FR-3)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
  })

  test('redirects an unauthenticated browser request to /auth/login with returnTo', async () => {
    // config.isTest and server.js read process.env at import time, so
    // simulating a real (non-test) environment means stubbing env then
    // reimporting fresh (same idiom as validate.test.js / session.test.js).
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
    // NODE_ENV=production defaults the session cache to Redis, which would
    // make server.initialize() dial a real Redis (absent on CI runners) —
    // this test is about the redirect, so keep the cache in-memory.
    vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
    vi.resetModules()
    const { createServer: freshCreateServer } = await import('../server.js')

    server = await freshCreateServer()
    await server.initialize()

    const res = await server.inject('/')

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login?returnTo=%2F')
  })
})
