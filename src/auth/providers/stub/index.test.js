import { afterEach, describe, expect, test, vi } from 'vitest'

import { getStubUsers } from './users.js'

function fakeRequest(overrides = {}) {
  return {
    query: {},
    payload: {},
    logger: { warn: vi.fn() },
    yar: { set: vi.fn(), get: vi.fn(), reset: vi.fn(), clear: vi.fn() },
    ...overrides
  }
}

describe('StubProvider (unit)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function importFresh(envOverrides = {}) {
    for (const [key, value] of Object.entries(envOverrides)) {
      vi.stubEnv(key, value)
    }
    vi.resetModules()
    return import('./index.js')
  }

  describe('enabled', () => {
    test('reflects config.auth.stubEnabled', async () => {
      const { StubProvider } = await importFresh({
        AUTH_STUB_ENABLED: 'true'
      })
      expect(StubProvider.enabled()).toBe(true)
    })

    test('is false when the stub is disabled', async () => {
      const { StubProvider } = await importFresh({
        AUTH_STUB_ENABLED: 'false'
      })
      expect(StubProvider.enabled()).toBe(false)
    })
  })

  describe('beginLogin', () => {
    test('returns the chooser view/context and writes a CSRF token to the session', async () => {
      const { StubProvider } = await importFresh()
      const request = fakeRequest({ query: { returnTo: '/dashboard' } })

      const result = StubProvider.beginLogin(request)

      expect(result.view).toBe('auth/stub-login')
      expect(result.context.users).toStrictEqual(getStubUsers())
      expect(result.context.returnTo).toBe('/dashboard')
      expect(result.context.defraIdAvailable).toBe(false)
      expect(request.yar.set).toHaveBeenCalledWith(
        'stubCsrf',
        result.context.csrfToken
      )
    })

    test('falls back returnTo to / on an open-redirect attempt (H-5)', async () => {
      const { StubProvider } = await importFresh()
      const request = fakeRequest({
        query: { returnTo: 'https://evil.example' }
      })

      const result = StubProvider.beginLogin(request)

      expect(result.context.returnTo).toBe('/')
    })

    test('defraIdAvailable is true once real Defra ID credentials are also configured', async () => {
      const { StubProvider } = await importFresh({
        DEFRA_ID_DISCOVERY_URL:
          'https://idp.example/.well-known/openid-configuration',
        DEFRA_ID_CLIENT_ID: 'client-id',
        DEFRA_ID_CLIENT_SECRET: 'client-secret',
        DEFRA_ID_SERVICE_ID: 'service-id'
      })

      const result = StubProvider.beginLogin(fakeRequest())

      expect(result.context.defraIdAvailable).toBe(true)
    })
  })

  describe('completeLogin', () => {
    test('rejects a request with no payload at all', async () => {
      const { StubProvider } = await importFresh()
      const request = fakeRequest({
        payload: undefined,
        yar: { get: vi.fn(() => undefined) }
      })

      expect(() => StubProvider.completeLogin(request)).toThrow(/csrf/i)
    })

    test('rejects a missing CSRF token', async () => {
      const { StubProvider } = await importFresh()
      const request = fakeRequest({
        payload: { userId: 'amina-khan' },
        yar: { get: vi.fn(() => undefined) }
      })

      expect(() => StubProvider.completeLogin(request)).toThrow(/csrf/i)
    })

    test('rejects a CSRF token that does not match the session', async () => {
      const { StubProvider } = await importFresh()
      const request = fakeRequest({
        payload: { csrfToken: 'wrong', userId: 'amina-khan' },
        yar: { get: vi.fn(() => 'the-real-token') }
      })

      expect(() => StubProvider.completeLogin(request)).toThrow(/csrf/i)
    })

    test('rejects an unknown user id', async () => {
      const { StubProvider } = await importFresh()
      const request = fakeRequest({
        payload: { csrfToken: 'token-1', userId: 'does-not-exist' },
        yar: { get: vi.fn(() => 'token-1') }
      })

      expect(() => StubProvider.completeLogin(request)).toThrow(
        /unknown stub user/i
      )
    })

    test('resolves the chosen user profile on a valid CSRF token', async () => {
      const { StubProvider } = await importFresh()
      const [amina] = getStubUsers()
      const request = fakeRequest({
        payload: { csrfToken: 'token-1', userId: amina.id },
        yar: { get: vi.fn(() => 'token-1') }
      })

      const result = StubProvider.completeLogin(request)

      expect(result).toStrictEqual({ profile: amina.profile })
    })
  })

  describe('logoutRedirectUrl', () => {
    test('always resolves null — a stub session has no federated round trip', async () => {
      const { StubProvider } = await importFresh()

      await expect(
        StubProvider.logoutRedirectUrl({
          idToken: 'anything',
          request: fakeRequest()
        })
      ).resolves.toBeNull()
    })
  })

  describe('extraRoutes — /auth/defra-id', () => {
    test('rethrows a non-DiscoveryError raised by DefraIdProvider.beginLogin', async () => {
      // The /auth/defra-id route only exists once DefraIdProvider.enabled()
      // is true (WI-4b: extraRoutes() now gates it the same way router.js
      // used to, so it 404s rather than hitting an unconfigured provider).
      const { StubProvider } = await importFresh({
        DEFRA_ID_DISCOVERY_URL:
          'https://idp.example/.well-known/openid-configuration',
        DEFRA_ID_CLIENT_ID: 'client-id',
        DEFRA_ID_CLIENT_SECRET: 'client-secret',
        DEFRA_ID_SERVICE_ID: 'service-id'
      })
      const { DefraIdProvider } = await import('../defra-id/index.js')
      const unexpected = new Error('boom')
      const originalBeginLogin = DefraIdProvider.beginLogin
      DefraIdProvider.beginLogin = vi.fn().mockRejectedValue(unexpected)

      try {
        const defraIdRoute = StubProvider.extraRoutes().find(
          (route) => route.path === '/auth/defra-id'
        )

        await expect(defraIdRoute.handler(fakeRequest(), {})).rejects.toBe(
          unexpected
        )
      } finally {
        DefraIdProvider.beginLogin = originalBeginLogin
      }
    })
  })
})

describe('StubProvider.extraRoutes (mounted on a real server)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // AUTH_STUB_ENABLED=false keeps plugins/router.js from also registering
  // /auth/stub/login and /auth/defra-id, leaving those paths free for the
  // extraRoutes() under test — this suite is standing in for the router
  // wiring that lands in the next work item (spec-003 WI-4 Phase 5). With the
  // stub off, validateConfig() requires a real Defra ID provider to be
  // configured, so those values are stubbed by default too.
  async function setupServer(envOverrides = {}) {
    vi.stubEnv('AUTH_STUB_ENABLED', 'false')
    vi.stubEnv(
      'DEFRA_ID_DISCOVERY_URL',
      'https://idp.example/.well-known/openid-configuration'
    )
    vi.stubEnv('DEFRA_ID_CLIENT_ID', 'client-id')
    vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'client-secret')
    vi.stubEnv('DEFRA_ID_SERVICE_ID', 'service-id')
    for (const [key, value] of Object.entries(envOverrides)) {
      vi.stubEnv(key, value)
    }
    vi.resetModules()
    const { createServer: freshCreateServer } =
      await import('../../../server.js')
    const { StubProvider } = await import('./index.js')
    const { getProfile } = await import('../../core/session.js')

    const freshServer = await freshCreateServer()
    freshServer.route(StubProvider.extraRoutes())
    freshServer.route({
      method: 'GET',
      path: '/test-session/profile/get',
      options: { auth: false },
      handler: (request) => ({ profile: getProfile(request) ?? null })
    })
    await freshServer.initialize()
    return freshServer
  }

  function sessionCookie(res) {
    return res.headers['set-cookie']?.[0]?.split(';')[0]
  }

  function csrfTokenFrom(payload) {
    return payload.match(/name="csrfToken" value="([^"]+)"/)?.[1]
  }

  test('GET renders every stub user and a CSRF token', async () => {
    server = await setupServer()

    const res = await server.inject('/auth/stub/login')

    expect(res.statusCode).toBe(200)
    for (const user of getStubUsers()) {
      expect(res.payload).toContain(user.profile.name)
    }
    expect(csrfTokenFrom(res.payload)).toBeTruthy()
  })

  test('POST with a bad CSRF token is rejected (403)', async () => {
    server = await setupServer()

    const res = await server.inject({
      method: 'POST',
      url: '/auth/stub/login',
      payload: { userId: 'amina-khan' }
    })

    expect(res.statusCode).toBe(403)
  })

  test('POST with no body at all is rejected (403)', async () => {
    server = await setupServer()

    const res = await server.inject({ method: 'POST', url: '/auth/stub/login' })

    expect(res.statusCode).toBe(403)
  })

  test('POST with a valid CSRF token regenerates the session and redirects to returnTo', async () => {
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

    const [amina] = getStubUsers()
    const profileRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie: newCookie }
    })
    expect(profileRes.result.profile).toStrictEqual(amina.profile)
  })

  test('GET /auth/defra-id delegates to DefraIdProvider and 302s when configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authorization_endpoint: 'https://idp.example/authorize',
            token_endpoint: 'https://idp.example/token',
            end_session_endpoint: 'https://idp.example/logout',
            jwks_uri: 'https://idp.example/jwks',
            issuer: 'https://idp.example/tenant/'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )
    server = await setupServer({
      DEFRA_ID_DISCOVERY_URL:
        'https://idp.example/.well-known/openid-configuration',
      DEFRA_ID_CLIENT_ID: 'client-id',
      DEFRA_ID_CLIENT_SECRET: 'client-secret',
      DEFRA_ID_SERVICE_ID: 'service-id'
    })

    const res = await server.inject('/auth/defra-id')

    expect(res.statusCode).toBe(302)
    const location = new URL(res.headers.location)
    expect(location.origin + location.pathname).toBe(
      'https://idp.example/authorize'
    )
  })

  test('GET /auth/defra-id renders the sign-in-unavailable page on a discovery failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused'))
    )
    server = await setupServer()

    const res = await server.inject('/auth/defra-id')

    expect(res.statusCode).toBe(502)
    expect(res.payload).toContain('sign-in')
  })
})
