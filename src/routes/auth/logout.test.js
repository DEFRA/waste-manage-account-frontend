import { afterEach, describe, expect, test, vi } from 'vitest'

const DISCOVERY_URL = 'https://idp.example/.well-known/openid-configuration'
const END_SESSION_ENDPOINT = 'https://idp.example/logout'

function discoveryDocument(overrides = {}) {
  return {
    authorization_endpoint: 'https://idp.example/authorize',
    token_endpoint: 'https://idp.example/token',
    end_session_endpoint: END_SESSION_ENDPOINT,
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

// config, discovery's module-level cache, and session.js are all read/created
// at import time, so a real (stub-off) flow needs a fresh module graph per
// test (same idiom as login.test.js/callback.test.js).
async function setupServer(envOverrides = {}) {
  vi.stubEnv('AUTH_STUB_ENABLED', 'false')
  vi.stubEnv('DEFRA_ID_DISCOVERY_URL', DISCOVERY_URL)
  vi.stubEnv('DEFRA_ID_CLIENT_ID', 'client-id')
  vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('DEFRA_ID_SERVICE_ID', 'service-id')
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const { createServer: freshCreateServer } = await import('../../server.js')
  const { getProfile, setIdToken, setProfile } =
    await import('../../auth/session.js')

  const server = await freshCreateServer()
  // Seeds a signed-in session the way /auth/callback (real login) or the
  // stub login would, and exposes what's left afterwards so /auth/logout is
  // exercised as a black box.
  server.route([
    {
      method: 'POST',
      path: '/test-session/sign-in',
      options: { auth: false },
      handler: (request) => {
        setProfile(request, { id: 'user-1', email: 'user-1@example.test' })
        if (request.payload?.idToken) {
          setIdToken(request, request.payload.idToken)
        }
        return { sessionId: request.yar.id }
      }
    },
    {
      method: 'GET',
      path: '/test-session/profile/get',
      options: { auth: false },
      handler: (request) => ({
        profile: getProfile(request) ?? null,
        sessionId: request.yar.id
      })
    }
  ])
  await server.initialize()
  return server
}

function sessionCookie(res) {
  return res.headers['set-cookie']?.[0]?.split(';')[0]
}

async function signIn(server, payload = {}) {
  const res = await server.inject({
    method: 'POST',
    url: '/test-session/sign-in',
    payload
  })
  return { cookie: sessionCookie(res), sessionId: res.result.sessionId }
}

describe('GET /auth/logout (FR-5)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('a real (id_token) session is destroyed locally and redirects to the end-session endpoint with id_token_hint and post_logout_redirect_uri', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(discoveryDocument()))
    )
    server = await setupServer()
    const { cookie } = await signIn(server, {
      idToken: 'the-id-token'
    })

    const res = await server.inject({
      url: '/auth/logout',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    const location = new URL(res.headers.location)
    expect(location.origin + location.pathname).toBe(END_SESSION_ENDPOINT)
    expect(location.searchParams.get('id_token_hint')).toBe('the-id-token')
    expect(location.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:3000/auth/signed-out'
    )

    // Server-side session state is gone: the old cookie's cache entry was
    // dropped by reset(), so replaying it finds an empty store.
    const oldCookieRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie }
    })
    expect(oldCookieRes.result.profile).toBeNull()

    const newCookie = sessionCookie(res)
    expect(newCookie).not.toBe(cookie)
    const newCookieRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie: newCookie }
    })
    expect(newCookieRes.result.profile).toBeNull()
  })

  test('a stub session (no id_token) is destroyed locally and redirects straight to /auth/signed-out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    server = await setupServer()
    const { cookie } = await signIn(server)

    const res = await server.inject({
      url: '/auth/logout',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/signed-out')
    expect(fetchMock).not.toHaveBeenCalled()

    const profileRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie }
    })
    expect(profileRes.result.profile).toBeNull()
  })

  test('no session at all redirects straight to /auth/signed-out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    server = await setupServer()

    const res = await server.inject('/auth/logout')

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/signed-out')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a discovery document with no end_session_endpoint falls back to /auth/signed-out', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(discoveryDocument({ end_session_endpoint: undefined }))
        )
    )
    server = await setupServer()
    const { cookie } = await signIn(server, { idToken: 'the-id-token' })

    const res = await server.inject({
      url: '/auth/logout',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/signed-out')
  })

  test('a discovery failure still destroys the local session and falls back to /auth/signed-out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused'))
    )
    server = await setupServer()
    const { cookie } = await signIn(server, { idToken: 'the-id-token' })

    const res = await server.inject({
      url: '/auth/logout',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/signed-out')

    const profileRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie }
    })
    expect(profileRes.result.profile).toBeNull()
  })
})

describe('GET /auth/signed-out', () => {
  test('renders 200 unauthenticated', async () => {
    vi.stubEnv('AUTH_STUB_ENABLED', 'false')
    vi.stubEnv('DEFRA_ID_DISCOVERY_URL', DISCOVERY_URL)
    vi.stubEnv('DEFRA_ID_CLIENT_ID', 'client-id')
    vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'client-secret')
    vi.stubEnv('DEFRA_ID_SERVICE_ID', 'service-id')
    vi.resetModules()
    const { createServer: freshCreateServer } = await import('../../server.js')
    const server = await freshCreateServer()
    await server.initialize()

    try {
      const res = await server.inject('/auth/signed-out')

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.payload).toContain('You have signed out')
      expect(res.payload).toContain('Sign in again')
    } finally {
      await server.stop()
      vi.unstubAllEnvs()
    }
  })
})
