import { afterEach, describe, expect, test, vi } from 'vitest'

import { getStubUsers } from '../../auth/providers/stub/users.js'

const DEFRA_ID_ENV = {
  DEFRA_ID_DISCOVERY_URL:
    'https://idp.example/.well-known/openid-configuration',
  DEFRA_ID_CLIENT_ID: 'client-id',
  DEFRA_ID_CLIENT_SECRET: 'client-secret',
  DEFRA_ID_SERVICE_ID: 'service-id'
}

function discoveryDocument(overrides = {}) {
  return {
    authorization_endpoint: 'https://idp.example/authorize',
    token_endpoint: 'https://idp.example/token',
    end_session_endpoint: 'https://idp.example/logout',
    jwks_uri: 'https://idp.example/jwks',
    issuer: 'https://idp.example/tenant/',
    ...overrides
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

// config and session.js are read/created at import time, so exercising a
// stub-config combination needs a fresh module graph per test (same idiom
// as login.test.js/session.test.js). The temporary profile-reading route is
// added from the *same* fresh graph the server itself uses, so it reads the
// same session.js module instance stub.js writes into.
async function setupServer(envOverrides = {}) {
  vi.stubEnv('AUTH_STUB_ENABLED', 'true')
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const { createServer: freshCreateServer } = await import('../../server.js')
  const { getProfile } = await import('../../auth/core/session.js')

  const server = await freshCreateServer()
  server.route({
    method: 'GET',
    path: '/test-session/profile/get',
    options: { auth: false },
    handler: (request) => ({ profile: getProfile(request) ?? null })
  })
  await server.initialize()
  return server
}

function sessionCookie(res) {
  return res.headers['set-cookie']?.[0]?.split(';')[0]
}

function csrfTokenFrom(payload) {
  return payload.match(/name="csrfToken" value="([^"]+)"/)?.[1]
}

describe('GET/POST /auth/stub/login (FR-6 stub chooser)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('renders every stub user and a CSRF token, with no Defra ID button when unconfigured', async () => {
    server = await setupServer()

    const res = await server.inject('/auth/stub/login')

    expect(res.statusCode).toBe(200)
    for (const user of getStubUsers()) {
      expect(res.payload).toContain(user.profile.name)
    }
    expect(csrfTokenFrom(res.payload)).toBeTruthy()
    expect(res.payload).not.toContain('Sign in with Defra ID')
  })

  test('shows the Defra ID escape-hatch button when real credentials are also configured', async () => {
    server = await setupServer(DEFRA_ID_ENV)

    const res = await server.inject('/auth/stub/login')

    expect(res.payload).toContain('Sign in with Defra ID')
  })

  test('rejects a POST with a missing CSRF token', async () => {
    server = await setupServer()

    const res = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      payload: { userId: 'amina-khan', returnTo: '/' }
    })

    expect(res.statusCode).toBe(403)
  })

  test('rejects a POST with no body at all', async () => {
    server = await setupServer()

    const res = await server.inject({
      method: 'POST',
      url: '/auth/stub/login'
    })

    expect(res.statusCode).toBe(403)
  })

  test('rejects a POST with a CSRF token that does not match the session', async () => {
    server = await setupServer()

    const getRes = await server.inject('/auth/stub/login')
    const cookie = sessionCookie(getRes)

    const res = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      headers: { cookie },
      payload: { csrfToken: 'not-the-real-token', userId: 'amina-khan' }
    })

    expect(res.statusCode).toBe(403)
  })

  test('rejects a POST selecting an unknown user', async () => {
    server = await setupServer()

    const getRes = await server.inject('/auth/stub/login')
    const cookie = sessionCookie(getRes)
    const csrfToken = csrfTokenFrom(getRes.payload)

    const res = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      headers: { cookie },
      payload: { csrfToken, userId: 'does-not-exist' }
    })

    expect(res.statusCode).toBe(400)
  })

  test('a valid CSRF token writes the selected user profile into a regenerated session and redirects to returnTo', async () => {
    server = await setupServer()

    const getRes = await server.inject('/auth/stub/login?returnTo=%2Fdashboard')
    const oldCookie = sessionCookie(getRes)
    const csrfToken = csrfTokenFrom(getRes.payload)

    const postRes = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      headers: { cookie: oldCookie },
      payload: { csrfToken, userId: 'amina-khan', returnTo: '/dashboard' }
    })

    expect(postRes.statusCode).toBe(302)
    expect(postRes.headers.location).toBe('/dashboard')

    const newCookie = sessionCookie(postRes)
    expect(newCookie).not.toBe(oldCookie)

    const profileRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie: newCookie }
    })
    const [amina] = getStubUsers()
    expect(profileRes.result.profile).toStrictEqual(amina.profile)

    // The pre-regeneration cookie must not resurrect the new profile either.
    const oldProfileRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie: oldCookie }
    })
    expect(oldProfileRes.result.profile).toBeNull()
  })

  test('H-5: falls back to / when the posted returnTo is an open-redirect attempt', async () => {
    server = await setupServer()

    const getRes = await server.inject('/auth/stub/login')
    const cookie = sessionCookie(getRes)
    const csrfToken = csrfTokenFrom(getRes.payload)

    const res = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      headers: { cookie },
      payload: {
        csrfToken,
        userId: 'amina-khan',
        returnTo: 'https://evil.example'
      }
    })

    expect(res.headers.location).toBe('/')
  })

  test('the CSRF token is single-use: replaying the same POST is rejected', async () => {
    server = await setupServer()

    const getRes = await server.inject('/auth/stub/login')
    const cookie = sessionCookie(getRes)
    const csrfToken = csrfTokenFrom(getRes.payload)
    const submit = () =>
      server.inject({
        method: 'POST',
        url: '/auth/stub/login',
        headers: { cookie },
        payload: { csrfToken, userId: 'amina-khan' }
      })

    const first = await submit()
    expect(first.statusCode).toBe(302)

    const replay = await submit()
    expect(replay.statusCode).toBe(403)
  })

  test('stub routes are absent (404) when AUTH_STUB_ENABLED is false', async () => {
    server = await setupServer({
      AUTH_STUB_ENABLED: 'false',
      ...DEFRA_ID_ENV
    })

    expect((await server.inject('/auth/stub/login')).statusCode).toBe(404)
    expect(
      (await server.inject({ method: 'POST', url: '/auth/stub/login' }))
        .statusCode
    ).toBe(404)
    expect((await server.inject('/auth/defra-id')).statusCode).toBe(404)
  })
})

describe('GET /auth/defra-id (FR-6 real-provider escape hatch)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('is absent (404) when the stub is enabled but no real credentials are configured', async () => {
    server = await setupServer()

    const res = await server.inject('/auth/defra-id')

    expect(res.statusCode).toBe(404)
  })

  test('initiates the real OIDC flow when the stub is enabled and credentials are configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(discoveryDocument()))
    )
    server = await setupServer(DEFRA_ID_ENV)

    const res = await server.inject('/auth/defra-id')

    expect(res.statusCode).toBe(302)
    const location = new URL(res.headers.location)
    expect(location.origin + location.pathname).toBe(
      'https://idp.example/authorize'
    )
    expect(location.searchParams.get('client_id')).toBe('client-id')
  })
})
