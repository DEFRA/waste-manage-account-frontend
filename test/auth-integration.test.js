import { afterEach, describe, expect, test, vi } from 'vitest'

import { startMockIdp } from './helpers/mock-idp.js'

// Spec §13 integration layer: unlike the route-level unit tests (which stub
// `fetch` by exact URL), this suite drives the app against a real loopback
// HTTP server (test/helpers/mock-idp.js) — discovery, the authorize redirect,
// the token exchange, and JWKS verification all go over a genuine network
// call, exercising the app's real OIDC code path end to end with no stub.
//
// config, discovery's/verify-token's module-level caches, and session.js are
// all read/created at import time, so every server needs a fresh module
// graph (same idiom as login.test.js/callback.test.js); NODE_ENV is stubbed
// away from 'test' so the FR-6 auto-auth bypass is off and the real
// session-cookie-driven auth scheme runs, exactly as it would in production.
async function setupServer(idp, envOverrides = {}) {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ENVIRONMENT', 'local')
  vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
  // No external network for session state either (spec §11.3): the default
  // NODE_ENV=production cache engine is Redis, which this suite doesn't need.
  vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
  vi.stubEnv('AUTH_STUB_ENABLED', 'false')
  vi.stubEnv('DEFRA_ID_DISCOVERY_URL', idp.discoveryUrl)
  vi.stubEnv('DEFRA_ID_CLIENT_ID', 'integration-test-client')
  vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'integration-test-secret')
  vi.stubEnv('DEFRA_ID_SERVICE_ID', 'integration-test-service')
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const { createServer: freshCreateServer } = await import('../src/server.js')

  const server = await freshCreateServer()
  await server.initialize()
  return server
}

function sessionCookie(res) {
  return res.headers['set-cookie']?.[0]?.split(';')[0]
}

// Drives GET /auth/login -> real POST to the mock IdP's /authorize (persona
// picker submission) -> back to the app's redirect_uri, exactly as a browser
// hop would, without ever needing a real listener at that redirect_uri: the
// code/state pair is read straight off the mock IdP's Location header and
// fed into /auth/callback via inject.
async function driveAuthorize(server, idp, { personaId, tamper, loginPath }) {
  const loginRes = await server.inject(loginPath ?? '/auth/login')
  expect(loginRes.statusCode).toBe(302)

  const authorizeUrl = new URL(loginRes.headers.location)
  const preAuthCookie = sessionCookie(loginRes)

  const body = new URLSearchParams(authorizeUrl.searchParams)
  body.set('personaId', personaId)
  if (tamper) {
    body.set('tamper', 'true')
  }

  const authorizeResponse = await fetch(idp.authorizeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual'
  })
  expect(authorizeResponse.status).toBe(302)

  const callbackLocation = new URL(authorizeResponse.headers.get('location'))
  return {
    preAuthCookie,
    callbackQuery: `state=${callbackLocation.searchParams.get('state')}&code=${callbackLocation.searchParams.get('code')}`
  }
}

async function login(server, idp, { personaId, tamper, loginPath } = {}) {
  const { preAuthCookie, callbackQuery } = await driveAuthorize(server, idp, {
    personaId,
    tamper,
    loginPath
  })

  return server.inject({
    url: `/auth/callback?${callbackQuery}`,
    headers: { cookie: preAuthCookie }
  })
}

describe('auth integration: full journey against the mock Defra ID (§13)', () => {
  let idp
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    await idp?.stop()
    idp = undefined
    vi.unstubAllEnvs()
  })

  test('authorize -> callback -> session -> logout', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    const callbackRes = await login(server, idp, { personaId: 'amina-khan' })
    expect(callbackRes.statusCode).toBe(302)
    expect(callbackRes.headers.location).toBe('/')

    const sessionCookieValue = sessionCookie(callbackRes)
    expect(sessionCookieValue).toBeDefined()

    const homeRes = await server.inject({
      url: '/',
      headers: { cookie: sessionCookieValue }
    })
    expect(homeRes.statusCode).toBe(200)
    expect(homeRes.payload).toContain('Amina Khan')
    expect(homeRes.payload).toContain('amina.khan@example.test')
    expect(homeRes.payload).toContain('Acme Recycling Ltd')

    const logoutRes = await server.inject({
      url: '/auth/logout',
      headers: { cookie: sessionCookieValue }
    })
    expect(logoutRes.statusCode).toBe(302)
    const endSessionUrl = new URL(logoutRes.headers.location)
    expect(endSessionUrl.origin + endSessionUrl.pathname).toBe(idp.logoutUrl)
    expect(endSessionUrl.searchParams.get('id_token_hint')).toBeTruthy()
    expect(endSessionUrl.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:3000/auth/signed-out'
    )

    const postLogoutCookie = sessionCookie(logoutRes)
    expect(postLogoutCookie).not.toBe(sessionCookieValue)

    const afterLogoutRes = await server.inject({
      url: '/',
      headers: { cookie: postLogoutCookie }
    })
    expect(afterLogoutRes.statusCode).toBe(302)
    expect(afterLogoutRes.headers.location).toBe('/auth/login?returnTo=%2F')
  })

  test('state mismatch is rejected without an exchange succeeding', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    const { preAuthCookie, callbackQuery } = await driveAuthorize(server, idp, {
      personaId: 'ben-carter'
    })
    const tamperedQuery = callbackQuery.replace(
      /state=[^&]+/,
      'state=wrong-state'
    )

    const res = await server.inject({
      url: `/auth/callback?${tamperedQuery}`,
      headers: { cookie: preAuthCookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
  })

  test('replaying a callback URL is rejected (single-use state)', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    const { preAuthCookie, callbackQuery } = await driveAuthorize(server, idp, {
      personaId: 'ben-carter'
    })

    const first = await server.inject({
      url: `/auth/callback?${callbackQuery}`,
      headers: { cookie: preAuthCookie }
    })
    expect(first.statusCode).toBe(302)
    expect(first.headers.location).toBe('/')

    const replay = await server.inject({
      url: `/auth/callback?${callbackQuery}`,
      headers: { cookie: preAuthCookie }
    })
    expect(replay.statusCode).toBe(302)
    expect(replay.headers.location).toBe('/auth/login')
  })

  test('an IdP error param is handled without attempting an exchange', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    const loginRes = await server.inject('/auth/login')
    const preAuthCookie = sessionCookie(loginRes)
    const state = new URL(loginRes.headers.location).searchParams.get('state')

    const res = await server.inject({
      url: `/auth/callback?state=${state}&error=access_denied`,
      headers: { cookie: preAuthCookie }
    })

    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('Sign-in was not completed')
  })

  test('returnTo=https://evil.example is ignored end to end', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    const callbackRes = await login(server, idp, {
      personaId: 'amina-khan',
      loginPath: `/auth/login?returnTo=${encodeURIComponent('https://evil.example')}`
    })

    expect(callbackRes.statusCode).toBe(302)
    expect(callbackRes.headers.location).toBe('/')
  })

  test('a tampered id_token is rejected', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    const callbackRes = await login(server, idp, {
      personaId: 'chidi-okoro',
      tamper: true
    })

    expect(callbackRes.statusCode).toBe(302)
    expect(callbackRes.headers.location).toBe('/auth/login')
  })

  test('org-guarded route: member gets 200', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    const callbackRes = await login(server, idp, { personaId: 'amina-khan' })
    const cookie = sessionCookie(callbackRes)

    const res = await server.inject({
      url: '/organisation/org-acme',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('org-acme')
  })

  test('org-guarded route: non-member gets 403', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    // Ben Carter belongs only to org-gamma, not org-acme.
    const callbackRes = await login(server, idp, { personaId: 'ben-carter' })
    const cookie = sessionCookie(callbackRes)

    const res = await server.inject({
      url: '/organisation/org-acme',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(403)
  })

  test('org-guarded route: a user with an unknown/absent link gets 403 (fails closed)', async () => {
    idp = await startMockIdp()
    server = await setupServer(idp)

    // Chidi Okoro has no organisation relationships at all.
    const callbackRes = await login(server, idp, { personaId: 'chidi-okoro' })
    const cookie = sessionCookie(callbackRes)

    const res = await server.inject({
      url: '/organisation/org-acme',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('auth integration: stub login (FR-6)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('GET renders the chooser, POST with a valid CSRF token establishes a session', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'local')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
    vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
    vi.stubEnv('AUTH_STUB_ENABLED', 'true')
    vi.resetModules()
    const { createServer: freshCreateServer } = await import('../src/server.js')
    server = await freshCreateServer()
    await server.initialize()

    const chooserRes = await server.inject('/auth/stub/login')
    expect(chooserRes.statusCode).toBe(200)
    const cookie = sessionCookie(chooserRes)
    const csrfMatch = chooserRes.payload.match(
      /name="csrfToken" value="([^"]+)"/
    )
    expect(csrfMatch).toBeTruthy()

    const submitRes = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      headers: { cookie },
      payload: { csrfToken: csrfMatch[1], userId: 'ben-carter', returnTo: '/' }
    })
    expect(submitRes.statusCode).toBe(302)
    expect(submitRes.headers.location).toBe('/')

    const sessionCookieValue = sessionCookie(submitRes)
    const homeRes = await server.inject({
      url: '/',
      headers: { cookie: sessionCookieValue }
    })
    expect(homeRes.statusCode).toBe(200)
    expect(homeRes.payload).toContain('Ben Carter')
  })

  test('POST without a CSRF token is rejected with 403 and establishes no session', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'local')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
    vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
    vi.stubEnv('AUTH_STUB_ENABLED', 'true')
    vi.resetModules()
    const { createServer: freshCreateServer } = await import('../src/server.js')
    server = await freshCreateServer()
    await server.initialize()

    const chooserRes = await server.inject('/auth/stub/login')
    const cookie = sessionCookie(chooserRes)

    const res = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      headers: { cookie, accept: 'application/json' },
      payload: { userId: 'ben-carter', returnTo: '/' }
    })

    expect(res.statusCode).toBe(403)
  })

  test('stub routes are absent (404) when the stub is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'local')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
    vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
    vi.stubEnv('AUTH_STUB_ENABLED', 'false')
    vi.stubEnv(
      'DEFRA_ID_DISCOVERY_URL',
      'https://idp.example/.well-known/openid-configuration'
    )
    vi.stubEnv('DEFRA_ID_CLIENT_ID', 'client-id')
    vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'client-secret')
    vi.stubEnv('DEFRA_ID_SERVICE_ID', 'service-id')
    vi.resetModules()
    const { createServer: freshCreateServer } = await import('../src/server.js')
    server = await freshCreateServer()
    await server.initialize()

    const res = await server.inject('/auth/stub/login')

    expect(res.statusCode).toBe(404)
  })
})

describe('auth integration: x-test-user-type bypass (FR-6)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  // No env stubbing here: NODE_ENV=test is already set by the test script,
  // so this exercises the real, unmodified default module graph — the same
  // one every other business-route test in the repo relies on.
  test('selects a different canned user for a full protected page', async () => {
    const { createServer } = await import('../src/server.js')
    server = await createServer()
    await server.initialize()

    const res = await server.inject({
      url: '/',
      headers: { 'x-test-user-type': 'multi-org-operator' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('Multi Org Operator')
    expect(res.payload).toContain('Beta Waste Ltd')
  })
})
