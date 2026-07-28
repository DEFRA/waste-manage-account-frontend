import { afterEach, describe, expect, test, vi } from 'vitest'

import { createServer } from '../server.js'

// A protected temporary route exposing the resolved credentials, so tests
// can assert what the scheme decided without any business route existing
// yet (same pattern as session.test.js's temporary routes).
function credentialsRoute() {
  return {
    method: 'GET',
    path: '/test-auth/credentials',
    handler: (request) => request.auth.credentials
  }
}

// Sending an explicit non-HTML Accept header keeps these assertions about
// the auth *scheme* (401 vs 200, which credentials) isolated from the
// errors-plugin's browser-redirect behaviour, which is covered separately
// against real routes (home.test.js, health.test.js).
const JSON_ACCEPT = { accept: 'application/json' }

describe('auth plugin — NODE_ENV=test bypass (FR-6)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('auto-authenticates a default canned user with no cookie', async () => {
    server = await createServer()
    server.route(credentialsRoute())
    await server.initialize()

    const res = await server.inject('/test-auth/credentials')

    expect(res.statusCode).toBe(200)
    expect(res.result.userType).toBe('operator')
    expect(res.result.id).toBe('test-operator')
  })

  test('x-test-user-type selects a different canned user', async () => {
    server = await createServer()
    server.route(credentialsRoute())
    await server.initialize()

    const res = await server.inject({
      url: '/test-auth/credentials',
      headers: { 'x-test-user-type': 'multi-org-operator' }
    })

    expect(res.result.id).toBe('test-multi-org-operator')
    expect(res.result.relationships).toHaveLength(2)
  })

  test('an unrecognised x-test-user-type falls back to the default user', async () => {
    server = await createServer()
    server.route(credentialsRoute())
    await server.initialize()

    const res = await server.inject({
      url: '/test-auth/credentials',
      headers: { 'x-test-user-type': 'no-such-user' }
    })

    expect(res.result.id).toBe('test-operator')
  })

  test('exposes the full spec §5 credentials shape', async () => {
    server = await createServer()
    server.route(credentialsRoute())
    await server.initialize()

    const res = await server.inject('/test-auth/credentials')

    expect(res.result).toStrictEqual({
      id: 'test-operator',
      email: 'operator@example.test',
      name: 'Test Operator',
      userType: 'operator',
      roles: [],
      contactId: 'contact-operator',
      currentRelationshipId: 'rel-1',
      relationships: ['rel-1:org-1:Acme Recycling Ltd'],
      scope: ['operator']
    })
  })
})

describe('auth plugin — deny by default outside NODE_ENV=test (FR-3)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
  })

  // config.isTest, session.js and server.js all read process.env at import
  // time, so simulating a non-test environment means stubbing env then
  // reimporting the whole module graph fresh (same idiom as
  // validate.test.js / session.test.js).
  async function createNonTestServer() {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
    // NODE_ENV=production defaults the session cache to Redis, which would
    // make server.initialize() dial a real Redis (absent on CI runners) —
    // these tests are about the auth scheme, so keep the cache in-memory.
    vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
    vi.resetModules()

    const [{ createServer: freshCreateServer }, sessionModule] =
      await Promise.all([
        import('../server.js'),
        import('../auth/core/session.js')
      ])

    return { createServer: freshCreateServer, ...sessionModule }
  }

  test('401s a request with no session profile', async () => {
    const fresh = await createNonTestServer()
    server = await fresh.createServer()
    server.route(credentialsRoute())
    await server.initialize()

    const res = await server.inject({
      url: '/test-auth/credentials',
      headers: JSON_ACCEPT
    })

    expect(res.statusCode).toBe(401)
  })

  test('authenticates from the stored session profile once one exists', async () => {
    const fresh = await createNonTestServer()
    const profile = {
      id: 'real-user',
      email: 'real-user@example.test',
      name: 'Real User',
      userType: 'operator',
      roles: [],
      contactId: 'contact-real',
      currentRelationshipId: 'rel-9',
      relationships: ['rel-9:org-9:Real Org Ltd'],
      scope: ['operator']
    }

    server = await fresh.createServer()
    server.route([
      credentialsRoute(),
      {
        method: 'GET',
        path: '/test-auth/set-profile',
        options: { auth: false },
        handler: (request) => {
          fresh.setProfile(request, profile)
          return {}
        }
      }
    ])
    await server.initialize()

    const setRes = await server.inject('/test-auth/set-profile')
    const cookie = (setRes.headers['set-cookie'] ?? [])
      .find((header) => header.startsWith('session='))
      ?.split(';')[0]
    expect(cookie).toBeDefined()

    const res = await server.inject({
      url: '/test-auth/credentials',
      headers: { ...JSON_ACCEPT, cookie }
    })

    expect(res.statusCode).toBe(200)
    expect(res.result).toStrictEqual(profile)
  })
})
