import { describe, expect, test, vi } from 'vitest'

const CLIENT_ID = 'client-id'
const SERVICE_ID = 'service-id'

// config is read at import time (same idiom as pkce.test.js/login.test.js),
// so exercising client_id/serviceId means stubbing env then re-importing.
async function importFresh(envOverrides = {}) {
  vi.stubEnv('DEFRA_ID_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('DEFRA_ID_SERVICE_ID', SERVICE_ID)
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  return import('./authorize-url.js')
}

function discoveryDocument(overrides = {}) {
  return {
    authorization_endpoint: 'https://idp.example/authorize',
    ...overrides
  }
}

describe('buildAuthorizeUrl', () => {
  test('builds the authorize URL with client_id, serviceId, redirect_uri, scope, state, nonce', async () => {
    const { buildAuthorizeUrl } = await importFresh()

    const url = buildAuthorizeUrl(discoveryDocument(), {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: undefined,
      query: {}
    })

    const location = new URL(url)
    expect(location.origin + location.pathname).toBe(
      'https://idp.example/authorize'
    )
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(location.searchParams.get('serviceId')).toBe(SERVICE_ID)
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/callback'
    )
    expect(location.searchParams.get('scope')).toBe(
      `openid offline_access ${CLIENT_ID}`
    )
    expect(location.searchParams.get('state')).toBe('state-1')
    expect(location.searchParams.get('nonce')).toBe('nonce-1')
    expect(location.searchParams.has('code_challenge')).toBe(false)
    expect(location.searchParams.has('code_challenge_method')).toBe(false)
  })

  test('adds PKCE params when a codeVerifier is provided', async () => {
    const { buildAuthorizeUrl } = await importFresh()

    const url = buildAuthorizeUrl(discoveryDocument(), {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      query: {}
    })

    const location = new URL(url)
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toBeTruthy()
  })

  test('forwards forceReselection and relationshipId when present in the query', async () => {
    const { buildAuthorizeUrl } = await importFresh()

    const url = buildAuthorizeUrl(discoveryDocument(), {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: undefined,
      query: { forceReselection: 'true', relationshipId: 'rel-42' }
    })

    const location = new URL(url)
    expect(location.searchParams.get('forceReselection')).toBe('true')
    expect(location.searchParams.get('relationshipId')).toBe('rel-42')
  })

  test('omits forceReselection/relationshipId when absent from the query', async () => {
    const { buildAuthorizeUrl } = await importFresh()

    const url = buildAuthorizeUrl(discoveryDocument(), {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: undefined,
      query: {}
    })

    const location = new URL(url)
    expect(location.searchParams.has('forceReselection')).toBe(false)
    expect(location.searchParams.has('relationshipId')).toBe(false)
  })
})
