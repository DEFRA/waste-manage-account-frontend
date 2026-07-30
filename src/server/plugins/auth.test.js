import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { getBellOptions } from './auth.js'
import {
  mockOidcDiscovery,
  oidcDiscoveryDocument
} from '#/test-helpers/mock-oidc-discovery.js'

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

describe('#getBellOptions', () => {
  afterEach(() => {
    config.set('defraId.pkceEnabled', false)
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
    expect(options.provider.scope).toEqual([
      'openid',
      'offline_access',
      config.get('defraId.clientId')
    ])
    expect(options.provider.useParamsAuth).toBe(true)
    expect(options.clientId).toBe(config.get('defraId.clientId'))
    expect(options.isSecure).toBe(config.get('session.cookie.secure'))
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

  test('Should build providerParams from defraId config', () => {
    const options = getBellOptions(oidcConfig)

    expect(options.providerParams()).toEqual({
      serviceId: config.get('defraId.serviceId'),
      p: config.get('defraId.policy'),
      response_mode: 'query'
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

    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should initialise with the plugin registered', () => {
    expect(server.registrations.auth).toBeDefined()
    expect(server.registrations['@hapi/bell']).toBeDefined()
  })

  test('Should leave the default auth strategy unset', async () => {
    const { statusCode } = await server.inject({ method: 'GET', url: '/' })

    expect(statusCode).toBe(200)
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
    expect(location.searchParams.get('response_mode')).toBe('query')
    expect(location.searchParams.get('state')).toBeTruthy()
  })
})
