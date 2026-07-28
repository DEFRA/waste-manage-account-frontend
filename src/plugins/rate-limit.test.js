import { afterEach, describe, expect, test, vi } from 'vitest'

// AUTH_RATE_LIMIT_MAX/WINDOW_SECONDS flow through config/index.js and are
// read once at import time (same idiom as session.test.js), so exercising a
// non-default threshold means stubbing env then re-importing the whole
// module graph fresh.
async function createServerWithThreshold({ max, windowSeconds } = {}) {
  if (max !== undefined) {
    vi.stubEnv('AUTH_RATE_LIMIT_MAX', String(max))
  }
  if (windowSeconds !== undefined) {
    vi.stubEnv('AUTH_RATE_LIMIT_WINDOW_SECONDS', String(windowSeconds))
  }
  vi.resetModules()

  const { createServer } = await import('../server.js')
  const server = await createServer()
  await server.initialize()
  return server
}

describe('rate-limit plugin (H-12)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
  })

  test('allows requests up to the configured threshold then 429s', async () => {
    server = await createServerWithThreshold({ max: 3 })

    for (let i = 0; i < 3; i += 1) {
      const res = await server.inject({
        url: '/auth/login',
        remoteAddress: '10.0.0.1'
      })
      expect(res.statusCode).not.toBe(429)
    }

    const blocked = await server.inject({
      url: '/auth/login',
      remoteAddress: '10.0.0.1'
    })
    expect(blocked.statusCode).toBe(429)
  })

  test('counts each client IP independently', async () => {
    server = await createServerWithThreshold({ max: 1 })

    const first = await server.inject({
      url: '/auth/login',
      remoteAddress: '10.0.0.2'
    })
    expect(first.statusCode).not.toBe(429)

    const otherIp = await server.inject({
      url: '/auth/login',
      remoteAddress: '10.0.0.3'
    })
    expect(otherIp.statusCode).not.toBe(429)

    const sameIpAgain = await server.inject({
      url: '/auth/login',
      remoteAddress: '10.0.0.2'
    })
    expect(sameIpAgain.statusCode).toBe(429)
  })

  test('counts each /auth/* path independently', async () => {
    server = await createServerWithThreshold({ max: 1 })

    const login = await server.inject({
      url: '/auth/login',
      remoteAddress: '10.0.0.4'
    })
    expect(login.statusCode).not.toBe(429)

    const signedOut = await server.inject({
      url: '/auth/signed-out',
      remoteAddress: '10.0.0.4'
    })
    expect(signedOut.statusCode).not.toBe(429)
  })

  test('never rate-limits routes outside /auth/*', async () => {
    server = await createServerWithThreshold({ max: 1 })

    await server.inject({ url: '/health', remoteAddress: '10.0.0.5' })
    await server.inject({ url: '/health', remoteAddress: '10.0.0.5' })
    const res = await server.inject({
      url: '/health',
      remoteAddress: '10.0.0.5'
    })

    expect(res.statusCode).toBe(200)
  })

  test('defaults to an effectively unreachable threshold under NODE_ENV=test', async () => {
    server = await createServerWithThreshold()

    for (let i = 0; i < 25; i += 1) {
      const res = await server.inject({
        url: '/auth/login',
        remoteAddress: '10.0.0.6'
      })
      expect(res.statusCode).not.toBe(429)
    }
  })
})
