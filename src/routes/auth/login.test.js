import crypto from 'node:crypto'

import { afterEach, describe, expect, test, vi } from 'vitest'

const DISCOVERY_URL = 'https://idp.example/.well-known/openid-configuration'

function discoveryDocument(overrides = {}) {
  return {
    authorization_endpoint: 'https://idp.example/authorize',
    token_endpoint: 'https://idp.example/token',
    end_session_endpoint: 'https://idp.example/logout',
    jwks_uri: 'https://idp.example/jwks',
    issuer: 'https://idp.example/tenant/',
    ...overrides
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

// config, discovery's module-level cache, and session.js are all read/created
// at import time, so a real (stub-off, Defra-ID-configured) flow needs a
// fresh module graph per test (same idiom as validate.test.js/session.test.js).
async function setupServer(envOverrides = {}) {
  vi.stubEnv('AUTH_STUB_ENABLED', 'false')
  vi.stubEnv('DEFRA_ID_DISCOVERY_URL', DISCOVERY_URL)
  vi.stubEnv('DEFRA_ID_CLIENT_ID', 'client-id')
  vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('DEFRA_ID_SERVICE_ID', 'service-id')
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const { createServer: freshCreateServer } = await import('../../server.js')
  const { takePreAuth } = await import('../../auth/session.js')

  const server = await freshCreateServer()
  // Exercises the same pre-auth session values /auth/login writes, the way
  // /auth/callback will read them (that route ships in a later item).
  server.route({
    method: 'GET',
    path: '/test-session/pre-auth/take',
    options: { auth: false },
    handler: (request) => ({ taken: takePreAuth(request) ?? null })
  })
  await server.initialize()
  return server
}

function sessionCookie(res) {
  return res.headers['set-cookie']?.[0]?.split(';')[0]
}

describe('GET /auth/login (FR-1)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('redirects to the authorization endpoint with all FR-1 params, PKCE, and stores pre-auth state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(discoveryDocument()))
    )
    server = await setupServer()

    const res = await server.inject('/auth/login?returnTo=%2Fdashboard')

    expect(res.statusCode).toBe(302)
    const location = new URL(res.headers.location)
    expect(location.origin + location.pathname).toBe(
      'https://idp.example/authorize'
    )
    expect(location.searchParams.get('client_id')).toBe('client-id')
    expect(location.searchParams.get('serviceId')).toBe('service-id')
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/callback'
    )
    expect(location.searchParams.get('scope')).toBe(
      'openid offline_access client-id'
    )
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')

    const state = location.searchParams.get('state')
    const nonce = location.searchParams.get('nonce')
    const codeChallenge = location.searchParams.get('code_challenge')
    expect(state).toBeTruthy()
    expect(nonce).toBeTruthy()
    expect(state).not.toBe(nonce)
    expect(codeChallenge).toBeTruthy()

    const cookie = sessionCookie(res)
    const preAuthRes = await server.inject({
      url: '/test-session/pre-auth/take',
      headers: { cookie }
    })
    const stored = preAuthRes.result.taken
    expect(stored.state).toBe(state)
    expect(stored.nonce).toBe(nonce)
    expect(stored.returnTo).toBe('/dashboard')
    expect(stored.codeVerifier).toMatch(/^[A-Za-z0-9\-_]{43,128}$/)

    const expectedChallenge = crypto
      .createHash('sha256')
      .update(stored.codeVerifier)
      .digest('base64url')
    expect(codeChallenge).toBe(expectedChallenge)
  })

  test('H-5: falls back to / when returnTo is an open-redirect attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(discoveryDocument()))
    )
    server = await setupServer()

    const res = await server.inject(
      '/auth/login?returnTo=https%3A%2F%2Fevil.example'
    )
    const cookie = sessionCookie(res)

    const preAuthRes = await server.inject({
      url: '/test-session/pre-auth/take',
      headers: { cookie }
    })
    expect(preAuthRes.result.taken.returnTo).toBe('/')
  })

  test('passes forceReselection and relationshipId through to the authorize URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(discoveryDocument()))
    )
    server = await setupServer()

    const res = await server.inject(
      '/auth/login?forceReselection=true&relationshipId=rel-42'
    )

    const location = new URL(res.headers.location)
    expect(location.searchParams.get('forceReselection')).toBe('true')
    expect(location.searchParams.get('relationshipId')).toBe('rel-42')
  })

  test('omits PKCE params and stores no codeVerifier when DEFRA_ID_PKCE_ENABLED=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(discoveryDocument()))
    )
    server = await setupServer({ DEFRA_ID_PKCE_ENABLED: 'false' })

    const res = await server.inject('/auth/login')
    const cookie = sessionCookie(res)

    const location = new URL(res.headers.location)
    expect(location.searchParams.has('code_challenge')).toBe(false)
    expect(location.searchParams.has('code_challenge_method')).toBe(false)

    const preAuthRes = await server.inject({
      url: '/test-session/pre-auth/take',
      headers: { cookie }
    })
    expect(preAuthRes.result.taken.codeVerifier).toBeUndefined()
  })

  test('redirects to /auth/stub/login without calling discovery when the stub is enabled', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    server = await setupServer({ AUTH_STUB_ENABLED: 'true' })

    const res = await server.inject('/auth/login')

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/auth/stub/login?returnTo=%2F')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('forwards a safe returnTo to the stub chooser when the stub is enabled', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    server = await setupServer({ AUTH_STUB_ENABLED: 'true' })

    const res = await server.inject('/auth/login?returnTo=%2Fdashboard')

    expect(res.headers.location).toBe('/auth/stub/login?returnTo=%2Fdashboard')
  })

  test('H-5: falls back to / forwarding to the stub chooser on an open-redirect attempt', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    server = await setupServer({ AUTH_STUB_ENABLED: 'true' })

    const res = await server.inject(
      '/auth/login?returnTo=https%3A%2F%2Fevil.example'
    )

    expect(res.headers.location).toBe('/auth/stub/login?returnTo=%2F')
  })

  test('renders a 502 "sign-in unavailable" page when discovery fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused'))
    )
    server = await setupServer()

    const res = await server.inject('/auth/login')

    expect(res.statusCode).toBe(502)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.payload).toContain('Sorry, sign-in is unavailable')
  })
})
