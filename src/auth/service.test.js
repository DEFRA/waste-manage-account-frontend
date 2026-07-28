import { afterEach, describe, expect, test, vi } from 'vitest'

const DEFRA_ID_ENV = {
  AUTH_STUB_ENABLED: 'false',
  DEFRA_ID_DISCOVERY_URL:
    'https://idp.example/.well-known/openid-configuration',
  DEFRA_ID_CLIENT_ID: 'client-id',
  DEFRA_ID_CLIENT_SECRET: 'client-secret',
  DEFRA_ID_SERVICE_ID: 'service-id'
}

function fakeRequest(overrides = {}) {
  return {
    query: {},
    payload: {},
    logger: { warn: vi.fn(), info: vi.fn() },
    yar: { set: vi.fn(), get: vi.fn(), reset: vi.fn(), clear: vi.fn() },
    ...overrides
  }
}

// config and the DefraIdProvider/registry singletons are all read/created at
// import time, so each scenario needs a fresh module graph (same idiom as
// providers/stub/index.test.js) — this also gives each test its own
// DefraIdProvider object to monkey-patch without leaking into others.
async function importFresh(envOverrides = {}) {
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const service = await import('./service.js')
  const { DefraIdProvider } = await import('./providers/defra-id/index.js')
  return { service, DefraIdProvider }
}

describe('auth/service', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('beginLogin', () => {
    test('dispatches to the stub chooser URL when it is the default provider, without calling any provider', async () => {
      const { service, DefraIdProvider } = await importFresh({
        AUTH_STUB_ENABLED: 'true'
      })
      DefraIdProvider.beginLogin = vi.fn()

      const result = await service.beginLogin(
        fakeRequest({ query: { returnTo: '/dashboard' } })
      )

      expect(result).toStrictEqual({
        redirectUrl: '/auth/stub/login?returnTo=%2Fdashboard'
      })
      expect(DefraIdProvider.beginLogin).not.toHaveBeenCalled()
    })

    test('dispatches straight to the default provider and returns its BeginResult on success', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const beginResult = { redirectUrl: 'https://idp.example/authorize?x=1' }
      DefraIdProvider.beginLogin = vi.fn().mockResolvedValue(beginResult)

      const result = await service.beginLogin(fakeRequest())

      expect(result).toBe(beginResult)
    })

    test('maps a DiscoveryError to the "sign-in unavailable" BeginResult and audits it', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const { DiscoveryError } = await import('./clients/oidc/discovery.js')
      DefraIdProvider.beginLogin = vi
        .fn()
        .mockRejectedValue(new DiscoveryError('unreachable'))
      const request = fakeRequest()

      const result = await service.beginLogin(request)

      expect(result).toStrictEqual({
        view: 'auth/sign-in-unavailable',
        statusCode: 502
      })
      expect(request.logger.warn).toHaveBeenCalled()
    })

    test('rethrows a non-DiscoveryError raised by the provider', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const unexpected = new Error('boom')
      DefraIdProvider.beginLogin = vi.fn().mockRejectedValue(unexpected)

      await expect(service.beginLogin(fakeRequest())).rejects.toBe(unexpected)
    })
  })

  describe('completeLogin', () => {
    function requestWithPreAuth(preAuth, overrides = {}) {
      return fakeRequest({
        query: { state: preAuth.state, code: 'auth-code' },
        yar: {
          get: vi.fn(() => preAuth),
          set: vi.fn(),
          reset: vi.fn(),
          clear: vi.fn()
        },
        ...overrides
      })
    }

    test('fails closed to /auth/login with no pre-auth session (e.g. a replayed callback)', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      DefraIdProvider.completeLogin = vi.fn()

      const request = fakeRequest({ query: { state: 's', code: 'c' } })
      const result = await service.completeLogin(request)

      expect(result).toStrictEqual({ redirectUrl: '/auth/login' })
      expect(DefraIdProvider.completeLogin).not.toHaveBeenCalled()
    })

    test('fails closed to /auth/login on a state mismatch without calling the provider', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      DefraIdProvider.completeLogin = vi.fn()
      const request = requestWithPreAuth(
        { state: 'expected' },
        { query: { state: 'wrong', code: 'auth-code' } }
      )

      const result = await service.completeLogin(request)

      expect(result).toStrictEqual({ redirectUrl: '/auth/login' })
      expect(DefraIdProvider.completeLogin).not.toHaveBeenCalled()
    })

    test('renders the cancelled page on an IdP error param without calling the provider', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      DefraIdProvider.completeLogin = vi.fn()
      const request = requestWithPreAuth(
        { state: 'state-1' },
        { query: { state: 'state-1', error: 'access_denied' } }
      )

      const result = await service.completeLogin(request)

      expect(result).toStrictEqual({ view: 'auth/sign-in-cancelled' })
      expect(DefraIdProvider.completeLogin).not.toHaveBeenCalled()
    })

    test('fails closed to /auth/login when code is missing without calling the provider', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      DefraIdProvider.completeLogin = vi.fn()
      const request = requestWithPreAuth(
        { state: 'state-1' },
        { query: { state: 'state-1' } }
      )

      const result = await service.completeLogin(request)

      expect(result).toStrictEqual({ redirectUrl: '/auth/login' })
      expect(DefraIdProvider.completeLogin).not.toHaveBeenCalled()
    })

    test('happy path: writes the verified profile into a regenerated session and redirects to returnTo', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const profile = { id: 'user-1' }
      DefraIdProvider.completeLogin = vi
        .fn()
        .mockResolvedValue({ profile, idToken: 'the-id-token' })
      const request = requestWithPreAuth({
        state: 'state-1',
        returnTo: '/dashboard'
      })

      const result = await service.completeLogin(request)

      expect(result).toStrictEqual({ redirectUrl: '/dashboard' })
      expect(request.yar.reset).toHaveBeenCalled()
      expect(request.yar.set).toHaveBeenCalledWith('profile', profile)
      expect(request.yar.set).toHaveBeenCalledWith('idToken', 'the-id-token')
    })

    test('each typed client error maps to its own failure class and fails closed', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const { DiscoveryError } = await import('./clients/oidc/discovery.js')
      const { TokenExchangeError } =
        await import('./clients/oidc/token-endpoint.js')
      const { TokenVerificationError } =
        await import('./clients/oidc/verify-token.js')

      for (const error of [
        new DiscoveryError('x'),
        new TokenExchangeError('x'),
        new TokenVerificationError('x')
      ]) {
        DefraIdProvider.completeLogin = vi.fn().mockRejectedValue(error)
        const request = requestWithPreAuth({ state: 'state-1' })

        const result = await service.completeLogin(request)

        expect(result).toStrictEqual({ redirectUrl: '/auth/login' })
      }
    })

    test('rethrows an unrecognised error raised by the provider', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const unexpected = new Error('boom')
      DefraIdProvider.completeLogin = vi.fn().mockRejectedValue(unexpected)
      const request = requestWithPreAuth({ state: 'state-1' })

      await expect(service.completeLogin(request)).rejects.toBe(unexpected)
    })
  })

  describe('logout', () => {
    test('destroys the session and redirects straight to /auth/signed-out when there is no id_token', async () => {
      const { service } = await importFresh(DEFRA_ID_ENV)
      const request = fakeRequest()

      const result = await service.logout(request)

      expect(result).toStrictEqual({ redirectUrl: '/auth/signed-out' })
      expect(request.yar.reset).toHaveBeenCalled()
    })

    test('destroys the session and follows the federated end-session URL when an id_token exists', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      DefraIdProvider.logoutRedirectUrl = vi
        .fn()
        .mockResolvedValue('https://idp.example/logout?x=1')
      const request = fakeRequest({
        yar: {
          get: vi.fn((key) => (key === 'idToken' ? 'the-id-token' : undefined)),
          set: vi.fn(),
          reset: vi.fn(),
          clear: vi.fn()
        }
      })

      const result = await service.logout(request)

      expect(result).toStrictEqual({
        redirectUrl: 'https://idp.example/logout?x=1'
      })
      expect(request.yar.reset).toHaveBeenCalled()
    })

    test('falls back to /auth/signed-out on a discovery failure, session already destroyed', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const { DiscoveryError } = await import('./clients/oidc/discovery.js')
      DefraIdProvider.logoutRedirectUrl = vi
        .fn()
        .mockRejectedValue(new DiscoveryError('unreachable'))
      const request = fakeRequest({
        yar: {
          get: vi.fn((key) => (key === 'idToken' ? 'the-id-token' : undefined)),
          set: vi.fn(),
          reset: vi.fn(),
          clear: vi.fn()
        }
      })

      const result = await service.logout(request)

      expect(result).toStrictEqual({ redirectUrl: '/auth/signed-out' })
    })

    test('rethrows a non-DiscoveryError raised by the provider', async () => {
      const { service, DefraIdProvider } = await importFresh(DEFRA_ID_ENV)
      const unexpected = new Error('boom')
      DefraIdProvider.logoutRedirectUrl = vi.fn().mockRejectedValue(unexpected)
      const request = fakeRequest({
        yar: {
          get: vi.fn((key) => (key === 'idToken' ? 'the-id-token' : undefined)),
          set: vi.fn(),
          reset: vi.fn(),
          clear: vi.fn()
        }
      })

      await expect(service.logout(request)).rejects.toBe(unexpected)
    })
  })

  describe('respond', () => {
    function fakeToolkit() {
      const response = { code: vi.fn() }
      response.code.mockReturnValue(response)
      return {
        redirect: vi.fn((url) => ({ redirect: url })),
        view: vi.fn(() => response),
        response
      }
    }

    test('redirects when the result carries a redirectUrl', async () => {
      const { service } = await importFresh()
      const h = fakeToolkit()

      service.respond(h, { redirectUrl: '/dashboard' })

      expect(h.redirect).toHaveBeenCalledWith('/dashboard')
      expect(h.view).not.toHaveBeenCalled()
    })

    test('renders the view with context and no status code by default', async () => {
      const { service } = await importFresh()
      const h = fakeToolkit()

      service.respond(h, { view: 'auth/sign-in-cancelled' })

      expect(h.view).toHaveBeenCalledWith('auth/sign-in-cancelled', {})
      expect(h.response.code).not.toHaveBeenCalled()
    })

    test('sets the status code when the result specifies one', async () => {
      const { service } = await importFresh()
      const h = fakeToolkit()

      service.respond(h, {
        view: 'auth/sign-in-unavailable',
        context: { foo: 'bar' },
        statusCode: 502
      })

      expect(h.view).toHaveBeenCalledWith('auth/sign-in-unavailable', {
        foo: 'bar'
      })
      expect(h.response.code).toHaveBeenCalledWith(502)
    })
  })
})
