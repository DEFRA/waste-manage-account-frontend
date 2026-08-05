import { vi } from 'vitest'

import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { getBellOptions, getCookieOptions, validateSession } from './auth.js'
import { refreshTokens } from '#/server/auth/refresh-tokens.js'
import {
  mockOidcDiscovery,
  oidcDiscoveryDocument
} from '#/test-helpers/mock-oidc-discovery.js'

vi.mock('#/server/auth/refresh-tokens.js', () => ({
  refreshTokens: vi.fn()
}))

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function buildIdToken(claims) {
  return [
    toBase64Url({ alg: 'RS256', typ: 'JWT' }),
    toBase64Url(claims),
    'signature'
  ].join('.')
}

function createFakeYar() {
  const store = new Map()
  return {
    set: (key, value) => store.set(key, value),
    get: (key) => store.get(key)
  }
}

function createFakeCache(entries = {}) {
  const store = new Map(Object.entries(entries))
  return {
    get: vi.fn(async (key) => store.get(key) ?? null),
    set: vi.fn(async (key, value) => store.set(key, value)),
    drop: vi.fn(async (key) => store.delete(key))
  }
}

function createFakeRequest(cache) {
  return { server: { app: { cache } } }
}

describe('#getBellOptions', () => {
  afterEach(() => {
    config.set('defraId.pkceEnabled', false)
    config.set('defraId.policy', '')
    config.set('defraId.responseMode', '')
    config.set('defraId.scopes', ['openid', 'offline_access'])
  })

  const oidcConfig = {
    authorizationEndpoint: 'https://defra-id.example/authorize',
    tokenEndpoint: 'https://defra-id.example/token',
    jwksUri: 'https://defra-id.example/.well-known/jwks.json',
    endSessionEndpoint: 'https://defra-id.example/logout'
  }

  test('Should wire the provider endpoints and scope from OIDC discovery', () => {
    const options = getBellOptions(oidcConfig)

    expect(options.provider.auth).toBe(oidcConfig.authorizationEndpoint)
    expect(options.provider.token).toBe(oidcConfig.tokenEndpoint)
    expect(options.provider.scope).toEqual(['openid', 'offline_access'])
    expect(options.provider.useParamsAuth).toBe(true)
    expect(options.clientId).toBe(config.get('defraId.clientId'))
    expect(options.isSecure).toBe(config.get('session.cookie.secure'))
  })

  test('Should request the scopes configured for a real tenant', () => {
    config.set('defraId.scopes', [
      'openid',
      'offline_access',
      config.get('defraId.clientId')
    ])

    const options = getBellOptions(oidcConfig)

    expect(options.provider.scope).toEqual([
      'openid',
      'offline_access',
      config.get('defraId.clientId')
    ])
  })

  test('Should omit pkce when defraId.pkceEnabled is false', () => {
    config.set('defraId.pkceEnabled', false)

    const options = getBellOptions(oidcConfig)

    expect(options.provider.pkce).toBeUndefined()
  })

  test('Should set provider.pkce to S256 when defraId.pkceEnabled is true', () => {
    config.set('defraId.pkceEnabled', true)

    const options = getBellOptions(oidcConfig)

    expect(options.provider.pkce).toBe('S256')
  })

  test('Should store a safe redirect in yar and return the callback URL', () => {
    const options = getBellOptions(oidcConfig)
    const yar = createFakeYar()
    const request = { query: { redirect: '/somewhere' }, yar }

    const location = options.location(request)

    expect(yar.get('redirect')).toBe('/somewhere')
    expect(location).toBe(
      `${config.get('defraId.callbackBaseUrl')}/auth/sign-in-oidc`
    )
  })

  test('Should fall back to the default landing path for an unsafe redirect', () => {
    const options = getBellOptions(oidcConfig)
    const yar = createFakeYar()
    const request = { query: { redirect: 'https://evil.example' }, yar }

    options.location(request)

    expect(yar.get('redirect')).toBe('/')
  })

  test('Should send only serviceId when no policy is configured', () => {
    const options = getBellOptions(oidcConfig)

    expect(options.providerParams()).toEqual({
      serviceId: config.get('defraId.serviceId')
    })
  })

  test('Should add the `p` param when a policy is configured', () => {
    config.set('defraId.policy', 'b2c_1a_signupsignin')

    const options = getBellOptions(oidcConfig)

    expect(options.providerParams()).toEqual({
      serviceId: config.get('defraId.serviceId'),
      p: 'b2c_1a_signupsignin'
    })
  })

  test('Should omit response_mode by default so the stub accepts the authorize request', () => {
    const options = getBellOptions(oidcConfig)

    expect(options.providerParams()).not.toHaveProperty('response_mode')
  })

  test('Should add the response_mode param when one is configured', () => {
    config.set('defraId.responseMode', 'form_post')

    const options = getBellOptions(oidcConfig)

    expect(options.providerParams()).toEqual({
      serviceId: config.get('defraId.serviceId'),
      response_mode: 'form_post'
    })
  })

  test('Should map id_token claims onto credentials via profile()', async () => {
    const options = getBellOptions(oidcConfig)
    const idToken = buildIdToken({
      contactId: 'contact-1',
      currentRelationshipId: 'relationship-1',
      firstName: 'Ada',
      lastName: 'Lovelace'
    })
    const credentials = {}

    await options.provider.profile(credentials, { id_token: idToken })

    expect(credentials.idToken).toBe(idToken)
    expect(credentials.profile).toEqual({
      crn: 'contact-1',
      organisationId: 'relationship-1',
      displayName: 'Ada Lovelace'
    })
  })

  test('Should tolerate a profile with no name claims', async () => {
    const options = getBellOptions(oidcConfig)
    const idToken = buildIdToken({
      contactId: 'contact-1',
      currentRelationshipId: 'relationship-1'
    })
    const credentials = {}

    await options.provider.profile(credentials, { id_token: idToken })

    expect(credentials.profile.displayName).toBe('')
  })
})

describe('#getCookieOptions', () => {
  test('Should configure the session cookie and validate function', () => {
    const options = getCookieOptions()

    expect(options.cookie.name).toBe('defra-id-session')
    expect(options.cookie.password).toBe(config.get('session.cookie.password'))
    expect(options.cookie.isSecure).toBe(config.get('session.cookie.secure'))
    expect(options.cookie.isSameSite).toBe('Lax')
    expect(options.cookie.ttl).toBe(config.get('session.cookie.ttl'))
    expect(options.cookie.path).toBe('/')
    expect(options.redirectTo).toBe('/auth/sign-in')
    expect(options.appendNext).toBe('redirect')
    expect(options.validate).toBe(validateSession)
  })
})

describe('#validateSession', () => {
  afterEach(() => {
    vi.clearAllMocks()
    config.set('defraId.refreshEnabled', true)
  })

  test('Should be invalid when there is no cached session', async () => {
    const cache = createFakeCache()
    const request = createFakeRequest(cache)

    await expect(
      validateSession(request, { sessionId: 'missing' })
    ).resolves.toEqual({ isValid: false })
  })

  test('Should be valid for an unexpired token', async () => {
    const cache = createFakeCache({
      'session-1': {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        scope: ['user'],
        profile: { displayName: 'Ada Lovelace' }
      }
    })
    const request = createFakeRequest(cache)

    await expect(
      validateSession(request, { sessionId: 'session-1' })
    ).resolves.toEqual({
      isValid: true,
      credentials: {
        sessionId: 'session-1',
        scope: ['user'],
        profile: { displayName: 'Ada Lovelace' }
      }
    })
  })

  test('Should refresh and remain valid for an expired token when refresh is enabled', async () => {
    config.set('defraId.refreshEnabled', true)
    refreshTokens.mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      idToken: 'new-id-token',
      expiresIn: 3600
    })
    const cache = createFakeCache({
      'session-1': {
        createdAt: Date.now(),
        expiresAt: Date.now() - 120000,
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        idToken: 'old-id-token',
        scope: ['user'],
        profile: { displayName: 'Ada Lovelace' }
      }
    })
    const request = createFakeRequest(cache)

    const result = await validateSession(request, { sessionId: 'session-1' })

    expect(refreshTokens).toHaveBeenCalledWith('old-refresh-token')
    expect(result).toEqual({
      isValid: true,
      credentials: {
        sessionId: 'session-1',
        scope: ['user'],
        profile: { displayName: 'Ada Lovelace' }
      }
    })
    expect(cache.set).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        idToken: 'new-id-token'
      })
    )
  })

  test('Should invalidate and drop the session when the token is expired and refresh is disabled', async () => {
    config.set('defraId.refreshEnabled', false)
    const cache = createFakeCache({
      'session-1': {
        createdAt: Date.now(),
        expiresAt: Date.now() - 120000,
        refreshToken: 'old-refresh-token',
        scope: ['user'],
        profile: {}
      }
    })
    const request = createFakeRequest(cache)

    await expect(
      validateSession(request, { sessionId: 'session-1' })
    ).resolves.toEqual({ isValid: false })
    expect(cache.drop).toHaveBeenCalledWith('session-1')
    expect(refreshTokens).not.toHaveBeenCalled()
  })

  test('Should invalidate and drop the session when refreshing the token fails', async () => {
    config.set('defraId.refreshEnabled', true)
    refreshTokens.mockRejectedValueOnce(new Error('invalid_grant'))
    const cache = createFakeCache({
      'session-1': {
        createdAt: Date.now(),
        expiresAt: Date.now() - 120000,
        refreshToken: 'old-refresh-token',
        scope: ['user'],
        profile: {}
      }
    })
    const request = createFakeRequest(cache)

    await expect(
      validateSession(request, { sessionId: 'session-1' })
    ).resolves.toEqual({ isValid: false })
    expect(cache.drop).toHaveBeenCalledWith('session-1')
  })

  test('Should invalidate and drop the session once the absolute TTL is exceeded, even with an unexpired token', async () => {
    const absoluteTtl = config.get('session.absoluteTtl')
    const cache = createFakeCache({
      'session-1': {
        createdAt: Date.now() - (absoluteTtl + 1000),
        expiresAt: Date.now() + 60000,
        scope: ['user'],
        profile: {}
      }
    })
    const request = createFakeRequest(cache)

    await expect(
      validateSession(request, { sessionId: 'session-1' })
    ).resolves.toEqual({ isValid: false })
    expect(cache.drop).toHaveBeenCalledWith('session-1')
    expect(refreshTokens).not.toHaveBeenCalled()
  })
})

describe('#auth plugin', () => {
  let server

  beforeAll(async () => {
    mockOidcDiscovery()
    server = await createServer()

    server.route({
      method: 'GET',
      path: '/__test-defra-id-route',
      options: { auth: 'defra-id' },
      handler: () => 'ok'
    })

    server.route({
      method: 'GET',
      path: '/__test-session-route',
      options: { auth: 'session' },
      handler: () => 'ok'
    })

    server.route({
      method: 'GET',
      path: '/__test-default-auth-route',
      handler: () => 'ok'
    })

    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should initialise with the plugin registered', () => {
    expect(server.registrations.auth).toBeDefined()
    expect(server.registrations['@hapi/bell']).toBeDefined()
    expect(server.registrations['@hapi/cookie']).toBeDefined()
  })

  test('Should require session auth by default for a route with no explicit auth option', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/__test-default-auth-route'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe(
      `/auth/sign-in?redirect=${encodeURIComponent('/__test-default-auth-route')}`
    )
  })

  test('Should redirect to the discovered authorization endpoint for the defra-id strategy', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/__test-defra-id-route?redirect=/somewhere'
    })

    expect(statusCode).toBe(302)
    const location = new URL(headers.location)
    expect(location.origin + location.pathname).toBe(
      oidcDiscoveryDocument.authorization_endpoint
    )
    expect(location.searchParams.get('client_id')).toBe(
      config.get('defraId.clientId')
    )
    expect(location.searchParams.get('serviceId')).toBe(
      config.get('defraId.serviceId')
    )
    // No policy is configured by default, matching environments that run
    // cdp-defra-id-stub — the B2C-only params must be absent because the
    // stub rejects them with a 400.
    expect(location.searchParams.get('response_mode')).toBeNull()
    expect(location.searchParams.get('p')).toBeNull()
    expect(location.searchParams.get('state')).toBeTruthy()
  })

  test('Should redirect a signed-out request to sign-in with the original path preserved', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/__test-session-route?foo=bar'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe(
      `/auth/sign-in?redirect=${encodeURIComponent('/__test-session-route?foo=bar')}`
    )
  })
})
