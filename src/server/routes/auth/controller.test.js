import { vi } from 'vitest'
import { load } from 'cheerio'

import { createServer } from '#/server/server.js'
import {
  signInController,
  signInOidcController,
  signOutController,
  signOutOidcController,
  signedOutController
} from './controller.js'
import {
  mockOidcDiscovery,
  oidcDiscoveryDocument
} from '#/test-helpers/mock-oidc-discovery.js'

vi.mock('#/server/auth/verify-token.js', () => ({
  verifyToken: vi.fn()
}))
vi.mock('#/server/auth/get-permissions.js', () => ({
  getPermissions: vi.fn()
}))
vi.mock('#/server/auth/get-sign-out-url.js', () => ({
  getSignOutUrl: vi.fn()
}))
vi.mock('#/server/auth/state.js', () => ({
  validateState: vi.fn()
}))

const { verifyToken } = await import('#/server/auth/verify-token.js')
const { getPermissions } = await import('#/server/auth/get-permissions.js')
const { getSignOutUrl } = await import('#/server/auth/get-sign-out-url.js')
const { validateState } = await import('#/server/auth/state.js')

function createFakeCache() {
  const store = new Map()
  return {
    set: vi.fn(async (key, value) => store.set(key, value)),
    get: vi.fn(async (key) => store.get(key) ?? null),
    drop: vi.fn(async (key) => store.delete(key))
  }
}

function createFakeToolkit() {
  const toolkit = {
    view: vi.fn(() => toolkit),
    redirect: vi.fn(() => toolkit),
    code: vi.fn(() => toolkit)
  }
  return toolkit
}

describe('#signInController', () => {
  test('Should require the defra-id strategy', () => {
    expect(signInController.options.auth).toBe('defra-id')
  })

  test('Should redirect to the default landing page', () => {
    const h = createFakeToolkit()

    signInController.handler({}, h)

    expect(h.redirect).toHaveBeenCalledWith('/')
  })
})

describe('#signInOidcController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('Should use the defra-id strategy in try mode', () => {
    expect(signInOidcController.options.auth).toEqual({
      strategy: 'defra-id',
      mode: 'try'
    })
  })

  test('Should render the unauthorised view when bell did not authenticate the request', async () => {
    const h = createFakeToolkit()
    const request = { auth: { isAuthenticated: false } }

    await signInOidcController.handler(request, h)

    expect(h.view).toHaveBeenCalledWith('unauthorised/index', {
      pageTitle: 'You could not be signed in',
      heading: 'You could not be signed in',
      message: 'You have not been signed in. Please try signing in again.'
    })
    expect(h.code).toHaveBeenCalledWith(401)
    expect(verifyToken).not.toHaveBeenCalled()
  })

  test('Should write the session to cache, set the auth cookie, and redirect to the stored redirect', async () => {
    const cache = createFakeCache()
    const cookieAuthSet = vi.fn()
    const yarGet = vi.fn().mockReturnValue('/somewhere')
    const h = createFakeToolkit()

    verifyToken.mockResolvedValueOnce({
      sessionId: 'session-1',
      roles: ['waste-operator']
    })
    getPermissions.mockReturnValueOnce(['user', 'waste-operator'])

    const request = {
      auth: {
        isAuthenticated: true,
        credentials: {
          token: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
          idToken: 'id-token',
          profile: { displayName: 'Ada Lovelace' }
        }
      },
      server: { app: { cache } },
      cookieAuth: { set: cookieAuthSet },
      yar: { get: yarGet }
    }

    await signInOidcController.handler(request, h)

    expect(verifyToken).toHaveBeenCalledWith('id-token')
    expect(cache.set).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        scope: ['user', 'waste-operator'],
        profile: { displayName: 'Ada Lovelace' }
      })
    )
    expect(cookieAuthSet).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(yarGet).toHaveBeenCalledWith('redirect', true)
    expect(h.redirect).toHaveBeenCalledWith('/somewhere')
  })

  test('Should generate a session id when the token has no sessionId claim', async () => {
    const cache = createFakeCache()
    const h = createFakeToolkit()

    verifyToken.mockResolvedValueOnce({})
    getPermissions.mockReturnValueOnce(['user'])

    const request = {
      auth: {
        isAuthenticated: true,
        credentials: {
          token: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
          idToken: 'id-token',
          profile: {}
        }
      },
      server: { app: { cache } },
      cookieAuth: { set: vi.fn() },
      yar: { get: vi.fn().mockReturnValue(null) }
    }

    await signInOidcController.handler(request, h)

    expect(cache.set).toHaveBeenCalledTimes(1)
    const [sessionId] = cache.set.mock.calls[0]
    expect(sessionId).toEqual(expect.any(String))
    expect(sessionId.length).toBeGreaterThan(0)
    expect(h.redirect).toHaveBeenCalledWith('/')
  })
})

describe('#signOutController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('Should use the session strategy in try mode', () => {
    expect(signOutController.options.auth).toEqual({
      strategy: 'session',
      mode: 'try'
    })
  })

  test('Should drop the cached session, clear the cookie, and redirect to the end-session URL when authenticated', async () => {
    const cache = createFakeCache()
    await cache.set('session-1', { idToken: 'the-id-token' })
    const cookieAuthClear = vi.fn()
    const h = createFakeToolkit()

    getSignOutUrl.mockResolvedValueOnce(
      'https://defra-id.example/logout?state=abc'
    )

    const request = {
      auth: {
        isAuthenticated: true,
        credentials: { sessionId: 'session-1' }
      },
      server: { app: { cache } },
      cookieAuth: { clear: cookieAuthClear }
    }

    await signOutController.handler(request, h)

    expect(cache.get).toHaveBeenCalledWith('session-1')
    expect(cache.drop).toHaveBeenCalledWith('session-1')
    expect(cookieAuthClear).toHaveBeenCalledWith()
    expect(getSignOutUrl).toHaveBeenCalledWith(request, 'the-id-token')
    expect(h.redirect).toHaveBeenCalledWith(
      'https://defra-id.example/logout?state=abc'
    )
  })

  test('Should clear the cookie and still redirect to the end-session URL when not authenticated', async () => {
    const cache = createFakeCache()
    const cookieAuthClear = vi.fn()
    const h = createFakeToolkit()

    getSignOutUrl.mockResolvedValueOnce('https://defra-id.example/logout')

    const request = {
      auth: { isAuthenticated: false },
      server: { app: { cache } },
      cookieAuth: { clear: cookieAuthClear }
    }

    await signOutController.handler(request, h)

    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.drop).not.toHaveBeenCalled()
    expect(cookieAuthClear).toHaveBeenCalledWith()
    expect(getSignOutUrl).toHaveBeenCalledWith(request, undefined)
    expect(h.redirect).toHaveBeenCalledWith('https://defra-id.example/logout')
  })
})

describe('#signOutOidcController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('Should use the session strategy in try mode', () => {
    expect(signOutOidcController.options.auth).toEqual({
      strategy: 'session',
      mode: 'try'
    })
  })

  test('Should drop the cached session, clear the cookie, and redirect home when the state is valid', async () => {
    const cache = createFakeCache()
    await cache.set('session-1', {})
    const cookieAuthClear = vi.fn()
    const h = createFakeToolkit()

    validateState.mockReturnValueOnce(true)

    const request = {
      query: { state: 'the-state' },
      auth: {
        isAuthenticated: true,
        credentials: { sessionId: 'session-1' }
      },
      server: { app: { cache } },
      cookieAuth: { clear: cookieAuthClear }
    }

    await signOutOidcController.handler(request, h)

    expect(validateState).toHaveBeenCalledWith(request, 'the-state')
    expect(cache.drop).toHaveBeenCalledWith('session-1')
    expect(cookieAuthClear).toHaveBeenCalledWith()
    expect(h.redirect).toHaveBeenCalledWith('/auth/signed-out')
  })

  test('Should fail safe (clear cookie, redirect to the signed-out page, no throw) when the state is tampered or missing and no session remains', async () => {
    const cache = createFakeCache()
    const cookieAuthClear = vi.fn()
    const h = createFakeToolkit()

    validateState.mockReturnValueOnce(false)

    const request = {
      query: {},
      auth: { isAuthenticated: false },
      server: { app: { cache } },
      cookieAuth: { clear: cookieAuthClear }
    }

    await expect(
      signOutOidcController.handler(request, h)
    ).resolves.not.toThrow()

    expect(cache.drop).not.toHaveBeenCalled()
    expect(cookieAuthClear).toHaveBeenCalledWith()
    expect(h.redirect).toHaveBeenCalledWith('/auth/signed-out')
  })

  test('Should still drop a lingering cached session even when the state check fails', async () => {
    const cache = createFakeCache()
    await cache.set('session-1', {})
    const cookieAuthClear = vi.fn()
    const h = createFakeToolkit()

    validateState.mockReturnValueOnce(false)

    const request = {
      query: { state: 'tampered' },
      auth: {
        isAuthenticated: true,
        credentials: { sessionId: 'session-1' }
      },
      server: { app: { cache } },
      cookieAuth: { clear: cookieAuthClear }
    }

    await signOutOidcController.handler(request, h)

    expect(cache.drop).toHaveBeenCalledWith('session-1')
    expect(cookieAuthClear).toHaveBeenCalledWith()
    expect(h.redirect).toHaveBeenCalledWith('/auth/signed-out')
  })
})

describe('#signedOutController', () => {
  test('Should be publicly accessible', () => {
    expect(signedOutController.options.auth).toEqual({ mode: 'try' })
  })

  test('Should render the signed-out confirmation view', () => {
    const h = createFakeToolkit()

    signedOutController.handler({}, h)

    expect(h.view).toHaveBeenCalledWith('signed-out/index', {
      pageTitle: 'You have signed out',
      heading: 'You have signed out'
    })
  })
})

describe('#authRoutes', () => {
  let server

  beforeAll(async () => {
    mockOidcDiscovery()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('GET /auth/sign-in should redirect into the bell authorize flow', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/auth/sign-in'
    })

    expect(statusCode).toBe(302)
    const location = new URL(headers.location)
    expect(location.origin + location.pathname).toBe(
      oidcDiscoveryDocument.authorization_endpoint
    )
  })

  test('GET /auth/sign-out should redirect to the end-session URL', async () => {
    getSignOutUrl.mockResolvedValueOnce(
      'https://defra-id.example/logout?state=abc'
    )

    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/auth/sign-out'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('https://defra-id.example/logout?state=abc')
  })

  test('GET /auth/sign-out-oidc should redirect to the signed-out confirmation page', async () => {
    validateState.mockReturnValueOnce(false)

    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/auth/sign-out-oidc'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('/auth/signed-out')
  })

  test('GET /auth/signed-out should render the confirmation page', async () => {
    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: '/auth/signed-out'
    })

    expect(statusCode).toBe(200)
    const $ = load(result)
    expect($('h1').text()).toContain('You have signed out')
  })
})
