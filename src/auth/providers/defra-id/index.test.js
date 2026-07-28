import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { afterEach, describe, expect, test, vi } from 'vitest'

const DISCOVERY_URL = 'https://idp.example/.well-known/openid-configuration'
const TOKEN_ENDPOINT = 'https://idp.example/token'
const JWKS_URI = 'https://idp.example/jwks'
const ISSUER = 'https://idp.example/tenant/'
const CLIENT_ID = 'client-id'
const KID = 'test-key'

function discoveryDocument(overrides = {}) {
  return {
    authorization_endpoint: 'https://idp.example/authorize',
    token_endpoint: TOKEN_ENDPOINT,
    end_session_endpoint: 'https://idp.example/logout',
    jwks_uri: JWKS_URI,
    issuer: ISSUER,
    ...overrides
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

// Routes a single global fetch mock by exact URL, same idiom as
// routes/auth/callback.test.js.
function stubFetch(handlers) {
  const fetchMock = vi.fn(async (url) => {
    const key = typeof url === 'string' ? url : url.toString()
    const handler = handlers[key]
    if (!handler) {
      throw new Error(`unexpected fetch to ${key}`)
    }
    return handler()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function signIdToken(privateKey, claims = {}, { kid = KID } = {}) {
  return new SignJWT({
    sub: 'user-1',
    email: 'user-1@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    contactId: 'contact-1',
    currentRelationshipId: 'rel-1',
    relationships: ['rel-1:org-1:Acme Recycling Ltd'],
    roles: ['submitter'],
    ...claims
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(privateKey)
}

async function stubJwks(publicKey, { kid = KID } = {}) {
  const jwk = await exportJWK(publicKey)
  return { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }
}

function fakeRequest(overrides = {}) {
  return {
    query: {},
    logger: { warn: vi.fn() },
    yar: { set: vi.fn(), get: vi.fn(), reset: vi.fn(), clear: vi.fn() },
    ...overrides
  }
}

// config and the clients/oidc/ module-level caches are all read/created at
// import time, so a fresh module graph is needed per test (same idiom as
// routes/auth/{login,callback}.test.js).
async function importFresh(envOverrides = {}) {
  vi.stubEnv('DEFRA_ID_DISCOVERY_URL', DISCOVERY_URL)
  vi.stubEnv('DEFRA_ID_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('DEFRA_ID_SERVICE_ID', 'service-id')
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  return import('./index.js')
}

describe('DefraIdProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('enabled', () => {
    test('is true when discoveryUrl/clientId/clientSecret/serviceId are all set', async () => {
      const { DefraIdProvider } = await importFresh()
      expect(DefraIdProvider.enabled()).toBe(true)
    })

    test('is false when any Defra ID onboarding value is missing', async () => {
      const { DefraIdProvider } = await importFresh({
        DEFRA_ID_CLIENT_SECRET: ''
      })
      expect(DefraIdProvider.enabled()).toBe(false)
    })
  })

  describe('beginLogin', () => {
    test('builds the authorize redirect and writes pre-auth state to the session', async () => {
      const { DefraIdProvider } = await importFresh()
      stubFetch({ [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()) })

      const request = fakeRequest({ query: { returnTo: '/dashboard' } })
      const result = await DefraIdProvider.beginLogin(request)

      const location = new URL(result.redirectUrl)
      expect(location.origin + location.pathname).toBe(
        'https://idp.example/authorize'
      )
      expect(location.searchParams.get('client_id')).toBe(CLIENT_ID)

      expect(request.yar.set).toHaveBeenCalledTimes(1)
      const [, preAuth] = request.yar.set.mock.calls[0]
      expect(preAuth.state).toBeTruthy()
      expect(preAuth.nonce).toBeTruthy()
      expect(preAuth.state).not.toBe(preAuth.nonce)
      expect(preAuth.codeVerifier).toMatch(/^[A-Za-z0-9-._~]{43,128}$/)
      expect(preAuth.returnTo).toBe('/dashboard')
    })

    test('propagates DiscoveryError on a discovery failure', async () => {
      const { DefraIdProvider, DiscoveryError } = await importFresh()
      stubFetch({
        [DISCOVERY_URL]: () => {
          throw new Error('connection refused')
        }
      })

      await expect(
        DefraIdProvider.beginLogin(fakeRequest())
      ).rejects.toBeInstanceOf(DiscoveryError)
    })
  })

  describe('completeLogin', () => {
    test('exchanges the code, verifies the id_token, and returns the built profile + idToken', async () => {
      const { DefraIdProvider } = await importFresh()
      const keyPair = await generateKeyPair('RS256')
      const idToken = await signIdToken(keyPair.privateKey, {
        nonce: 'nonce-1'
      })
      const jwks = await stubJwks(keyPair.publicKey)

      stubFetch({
        [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
        [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
        [JWKS_URI]: () => jsonResponse(jwks)
      })

      const request = fakeRequest({ query: { code: 'auth-code' } })
      const preAuth = { nonce: 'nonce-1', codeVerifier: 'a'.repeat(43) }

      const result = await DefraIdProvider.completeLogin(request, preAuth)

      expect(result.idToken).toBe(idToken)
      expect(result.profile).toStrictEqual({
        id: 'user-1',
        email: 'user-1@example.test',
        name: 'Ada Lovelace',
        userType: 'operator',
        roles: ['submitter'],
        contactId: 'contact-1',
        currentRelationshipId: 'rel-1',
        relationships: [
          {
            relationshipId: 'rel-1',
            organisationId: 'org-1',
            organisationName: 'Acme Recycling Ltd'
          }
        ],
        scope: ['operator']
      })
    })

    test('propagates DiscoveryError on a discovery failure', async () => {
      const { DefraIdProvider, DiscoveryError } = await importFresh()
      stubFetch({
        [DISCOVERY_URL]: () => {
          throw new Error('connection refused')
        }
      })

      await expect(
        DefraIdProvider.completeLogin(fakeRequest({ query: { code: 'c' } }), {
          nonce: 'nonce-1',
          codeVerifier: 'a'.repeat(43)
        })
      ).rejects.toBeInstanceOf(DiscoveryError)
    })

    test('propagates TokenExchangeError when the token endpoint rejects the code', async () => {
      const { DefraIdProvider, TokenExchangeError } = await importFresh()
      stubFetch({
        [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
        [TOKEN_ENDPOINT]: () => jsonResponse({ error: 'invalid_grant' }, 400)
      })

      await expect(
        DefraIdProvider.completeLogin(fakeRequest({ query: { code: 'c' } }), {
          nonce: 'nonce-1',
          codeVerifier: 'a'.repeat(43)
        })
      ).rejects.toBeInstanceOf(TokenExchangeError)
    })

    test('propagates TokenVerificationError on a nonce mismatch', async () => {
      const { DefraIdProvider, TokenVerificationError } = await importFresh()
      const keyPair = await generateKeyPair('RS256')
      const idToken = await signIdToken(keyPair.privateKey, {
        nonce: 'a-different-nonce'
      })
      const jwks = await stubJwks(keyPair.publicKey)

      stubFetch({
        [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
        [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
        [JWKS_URI]: () => jsonResponse(jwks)
      })

      await expect(
        DefraIdProvider.completeLogin(fakeRequest({ query: { code: 'c' } }), {
          nonce: 'nonce-1',
          codeVerifier: 'a'.repeat(43)
        })
      ).rejects.toBeInstanceOf(TokenVerificationError)
    })
  })

  describe('logoutRedirectUrl', () => {
    test('returns null when there is no idToken', async () => {
      const { DefraIdProvider } = await importFresh()

      expect(
        await DefraIdProvider.logoutRedirectUrl({
          idToken: undefined,
          request: fakeRequest()
        })
      ).toBeNull()
    })

    test('builds the end-session URL with id_token_hint and post_logout_redirect_uri', async () => {
      const { DefraIdProvider } = await importFresh()
      stubFetch({ [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()) })

      const url = await DefraIdProvider.logoutRedirectUrl({
        idToken: 'id-token-1',
        request: fakeRequest()
      })

      const location = new URL(url)
      expect(location.origin + location.pathname).toBe(
        'https://idp.example/logout'
      )
      expect(location.searchParams.get('id_token_hint')).toBe('id-token-1')
      expect(location.searchParams.get('post_logout_redirect_uri')).toBe(
        'http://localhost:3000/auth/signed-out'
      )
    })

    test('returns null when the discovery document omits end_session_endpoint', async () => {
      const { DefraIdProvider } = await importFresh()
      stubFetch({
        [DISCOVERY_URL]: () =>
          jsonResponse(discoveryDocument({ end_session_endpoint: undefined }))
      })

      expect(
        await DefraIdProvider.logoutRedirectUrl({
          idToken: 'id-token-1',
          request: fakeRequest()
        })
      ).toBeNull()
    })

    test('propagates DiscoveryError on a discovery failure', async () => {
      const { DefraIdProvider, DiscoveryError } = await importFresh()
      stubFetch({
        [DISCOVERY_URL]: () => {
          throw new Error('connection refused')
        }
      })

      await expect(
        DefraIdProvider.logoutRedirectUrl({
          idToken: 'id-token-1',
          request: fakeRequest()
        })
      ).rejects.toBeInstanceOf(DiscoveryError)
    })
  })
})
