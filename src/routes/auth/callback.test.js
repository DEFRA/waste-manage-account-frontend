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

// Routes a single global fetch mock by exact URL so one test can stub
// discovery, the token endpoint and the (jose-internal) JWKS fetch at once.
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

// config, discovery's/verify-token's module-level caches, and session.js are
// all read/created at import time, so a real (stub-off) flow needs a fresh
// module graph per test (same idiom as login.test.js).
async function setupServer(envOverrides = {}) {
  vi.stubEnv('AUTH_STUB_ENABLED', 'false')
  vi.stubEnv('DEFRA_ID_DISCOVERY_URL', DISCOVERY_URL)
  vi.stubEnv('DEFRA_ID_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('DEFRA_ID_SERVICE_ID', 'service-id')
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const { createServer: freshCreateServer } = await import('../../server.js')
  const { getProfile, setPreAuth } = await import('../../auth/session.js')

  const server = await freshCreateServer()
  // Seeds pre-auth session state the way /auth/login would, and exposes the
  // stored profile afterwards — /auth/callback is exercised as a black box.
  server.route([
    {
      method: 'POST',
      path: '/test-session/pre-auth/set',
      options: { auth: false },
      handler: (request) => {
        setPreAuth(request, request.payload)
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

async function seedPreAuth(server, preAuth) {
  const res = await server.inject({
    method: 'POST',
    url: '/test-session/pre-auth/set',
    payload: preAuth
  })
  return { cookie: sessionCookie(res), sessionId: res.result.sessionId }
}

describe('GET /auth/callback (FR-2)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('happy path: exchanges the code, verifies the token, stores the profile and redirects to returnTo with a regenerated session', async () => {
    const keyPair = await generateKeyPair('RS256')
    const idToken = await signIdToken(keyPair.privateKey, { nonce: 'nonce-1' })
    const jwks = await stubJwks(keyPair.publicKey)

    stubFetch({
      [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
      [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
      [JWKS_URI]: () => jsonResponse(jwks)
    })

    server = await setupServer()
    const { cookie, sessionId: preAuthSessionId } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/dashboard')

    const newCookie = sessionCookie(res)
    expect(newCookie).toBeDefined()
    expect(newCookie).not.toBe(cookie)

    const profileRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie: newCookie }
    })
    expect(profileRes.result.sessionId).not.toBe(preAuthSessionId)
    expect(profileRes.result.profile).toStrictEqual({
      id: 'user-1',
      email: 'user-1@example.test',
      name: 'Ada Lovelace',
      userType: 'operator',
      roles: ['submitter'],
      contactId: 'contact-1',
      currentRelationshipId: 'rel-1',
      relationships: ['rel-1:org-1:Acme Recycling Ltd'],
      scope: ['operator']
    })
  })

  test('redirects to / when there is no returnTo', async () => {
    const keyPair = await generateKeyPair('RS256')
    const idToken = await signIdToken(keyPair.privateKey, { nonce: 'nonce-1' })
    const jwks = await stubJwks(keyPair.publicKey)

    stubFetch({
      [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
      [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
      [JWKS_URI]: () => jsonResponse(jwks)
    })

    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43)
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(res.headers.location).toBe('/')
  })

  test('H-5: ignores an unsafe returnTo re-checked at read time', async () => {
    const keyPair = await generateKeyPair('RS256')
    const idToken = await signIdToken(keyPair.privateKey, { nonce: 'nonce-1' })
    const jwks = await stubJwks(keyPair.publicKey)

    stubFetch({
      [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
      [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
      [JWKS_URI]: () => jsonResponse(jwks)
    })

    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: 'https://evil.example'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(res.headers.location).toBe('/')
  })

  test('state mismatch redirects to /auth/login without attempting the code exchange', async () => {
    const fetchMock = stubFetch({})
    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=wrong-state&code=auth-code',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a missing pre-auth session (e.g. replayed callback) redirects to /auth/login', async () => {
    const fetchMock = stubFetch({})
    server = await setupServer()

    const res = await server.inject(
      '/auth/callback?state=state-1&code=auth-code'
    )

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('error=access_denied renders a friendly page without attempting the code exchange', async () => {
    const fetchMock = stubFetch({})
    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&error=access_denied',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.payload).toContain('Sign-in was not completed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a missing code redirects to /auth/login without attempting the code exchange', async () => {
    const fetchMock = stubFetch({})
    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a discovery failure redirects to /auth/login', async () => {
    stubFetch({
      [DISCOVERY_URL]: () => {
        throw new Error('connection refused')
      }
    })
    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
  })

  test('a token exchange failure redirects to /auth/login', async () => {
    stubFetch({
      [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
      [TOKEN_ENDPOINT]: () => jsonResponse({ error: 'invalid_grant' }, 400)
    })
    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
  })

  test('id_token verification failure (nonce mismatch) redirects to /auth/login', async () => {
    const keyPair = await generateKeyPair('RS256')
    // Signed with a different nonce than the one stored in pre-auth.
    const idToken = await signIdToken(keyPair.privateKey, {
      nonce: 'a-different-nonce'
    })
    const jwks = await stubJwks(keyPair.publicKey)

    stubFetch({
      [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
      [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
      [JWKS_URI]: () => jsonResponse(jwks)
    })

    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
  })

  test('a tampered id_token (wrong signing key) redirects to /auth/login', async () => {
    const keyPair = await generateKeyPair('RS256')
    const otherKeyPair = await generateKeyPair('RS256')
    const idToken = await signIdToken(otherKeyPair.privateKey, {
      nonce: 'nonce-1'
    })
    // JWKS advertises the legitimate key, not the one that signed the token.
    const jwks = await stubJwks(keyPair.publicKey)

    stubFetch({
      [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
      [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
      [JWKS_URI]: () => jsonResponse(jwks)
    })

    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const res = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/login')
  })

  test('the state/nonce/code_verifier are single-use: replaying the callback finds nothing and fails closed', async () => {
    const keyPair = await generateKeyPair('RS256')
    const idToken = await signIdToken(keyPair.privateKey, { nonce: 'nonce-1' })
    const jwks = await stubJwks(keyPair.publicKey)

    const fetchMock = stubFetch({
      [DISCOVERY_URL]: () => jsonResponse(discoveryDocument()),
      [TOKEN_ENDPOINT]: () => jsonResponse({ id_token: idToken }),
      [JWKS_URI]: () => jsonResponse(jwks)
    })

    server = await setupServer()
    const { cookie } = await seedPreAuth(server, {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'a'.repeat(43),
      returnTo: '/dashboard'
    })

    const first = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })
    expect(first.statusCode).toBe(302)
    expect(first.headers.location).toBe('/dashboard')

    fetchMock.mockClear()
    const replay = await server.inject({
      url: '/auth/callback?state=state-1&code=auth-code',
      headers: { cookie }
    })

    expect(replay.statusCode).toBe(302)
    expect(replay.headers.location).toBe('/auth/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
