import { vi } from 'vitest'

import { config } from '#/config/config.js'

const wellKnownDocument = {
  authorization_endpoint: 'https://defra-id.example/authorize',
  token_endpoint: 'https://defra-id.example/token',
  jwks_uri: 'https://defra-id.example/.well-known/jwks.json',
  end_session_endpoint: 'https://defra-id.example/logout'
}

const expectedEndpoints = {
  authorizationEndpoint: wellKnownDocument.authorization_endpoint,
  tokenEndpoint: wellKnownDocument.token_endpoint,
  jwksUri: wellKnownDocument.jwks_uri,
  endSessionEndpoint: wellKnownDocument.end_session_endpoint
}

describe('#getOidcConfig', () => {
  beforeEach(() => {
    fetch.resetMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('Should fetch and map the discovery document endpoints', async () => {
    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    const { getOidcConfig } = await import('./get-oidc-config.js')

    await expect(getOidcConfig()).resolves.toEqual(expectedEndpoints)
    expect(fetch).toHaveBeenCalledWith(config.get('defraId.discoveryUrl'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('Should not re-fetch on a second call within the cache TTL', async () => {
    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    const { getOidcConfig } = await import('./get-oidc-config.js')

    await getOidcConfig()
    await expect(getOidcConfig()).resolves.toEqual(expectedEndpoints)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('Should re-fetch once the cache TTL has expired', async () => {
    // Resolve config.js first so the fresh module registry (from the
    // beforeEach vi.resetModules()) caches one instance that this test's
    // config.set() and get-oidc-config.js's internal import both share.
    const { config: freshConfig } = await import('#/config/config.js')
    freshConfig.set('defraId.discoveryCacheTtlSeconds', 60)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    const { getOidcConfig } = await import('./get-oidc-config.js')
    await getOidcConfig()

    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'))
    const updatedDocument = {
      ...wellKnownDocument,
      token_endpoint: 'https://defra-id.example/token-v2'
    }
    fetch.mockResponseOnce(JSON.stringify(updatedDocument))

    await expect(getOidcConfig()).resolves.toEqual({
      ...expectedEndpoints,
      tokenEndpoint: updatedDocument.token_endpoint
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('Should throw when the discovery document fetch fails', async () => {
    fetch.mockResponseOnce('Internal Server Error', { status: 500 })
    const { getOidcConfig } = await import('./get-oidc-config.js')

    await expect(getOidcConfig()).rejects.toThrow(
      /Failed to fetch DEFRA ID OIDC discovery document/
    )
  })
})
