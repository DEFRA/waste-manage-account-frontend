import { vi } from 'vitest'

import { createServer } from '#/server/server.js'
import { signInController, signInOidcController } from './controller.js'
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

const { verifyToken } = await import('#/server/auth/verify-token.js')
const { getPermissions } = await import('#/server/auth/get-permissions.js')

function createFakeCache() {
  const store = new Map()
  return {
    set: vi.fn(async (key, value) => store.set(key, value)),
    get: vi.fn(async (key) => store.get(key) ?? null)
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
      heading: 'You could not be signed in'
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
})
