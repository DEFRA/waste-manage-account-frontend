import { afterEach, describe, expect, test, vi } from 'vitest'

import { createServer } from '../server.js'

describe('GET /health (CDP liveness probe, FR2)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('returns 200 with a success payload', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/health')

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ message: 'success' })
  })

  test('is reachable with no session even outside NODE_ENV=test (spec §8, public)', async () => {
    // config.isTest and server.js read process.env at import time, so
    // simulating a real (non-test) environment means stubbing env then
    // reimporting fresh (same idiom as validate.test.js / session.test.js).
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))
    // NODE_ENV=production defaults the session cache to Redis, which would
    // make server.initialize() dial a real Redis (absent on CI runners) —
    // this test is about the public /health route, so keep the cache in-memory.
    vi.stubEnv('SESSION_CACHE_ENGINE', 'memory')
    vi.resetModules()
    const { createServer: freshCreateServer } = await import('../server.js')

    server = await freshCreateServer()
    await server.initialize()

    const res = await server.inject('/health')

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ message: 'success' })

    vi.unstubAllEnvs()
  })
})
