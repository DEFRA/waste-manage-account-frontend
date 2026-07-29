import { afterEach, describe, expect, test, vi } from 'vitest'

// config reads env at import time, so each test re-imports the server factory
// with a fresh module graph after stubbing the environment.
async function importCreateServer() {
  vi.resetModules()
  const { createServer } = await import('./server.js')
  return createServer
}

describe('createServer', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
  })

  test('defaults to port 3000 when PORT is unset', async () => {
    vi.stubEnv('PORT', undefined)
    const createServer = await importCreateServer()

    server = await createServer()
    // initialize() starts the server without binding the socket, so the test
    // cannot collide with a dev server already listening on 3000
    await server.initialize()

    expect(server.settings.port).toBe(3000)
  })

  test('registers structured logging (hapi-pino) and decorates the logger', async () => {
    const createServer = await importCreateServer()

    server = await createServer()
    await server.initialize()

    expect(server.registrations['hapi-pino']).toBeDefined()
    expect(server.logger).toBeDefined()
    expect(typeof server.logger.info).toBe('function')
  })

  test('provisions the named session cache (memory engine by default)', async () => {
    const createServer = await importCreateServer()

    server = await createServer()
    // Policies must be created before the cache client starts on initialize()
    const cache = server.cache({
      cache: 'session',
      segment: 'server-test',
      expiresIn: 60_000
    })
    await server.initialize()

    await cache.set('key', { hello: 'world' })
    expect(await cache.get('key')).toEqual({ hello: 'world' })
  })

  test('refuses to build a server from an invalid configuration', async () => {
    // Stub auth in prod is the spec §9/H-8 hard error; NODE_ENV stays 'test'
    // so no Redis connection is attempted before validation fires.
    vi.stubEnv('ENVIRONMENT', 'prod')
    vi.stubEnv('AUTH_STUB_ENABLED', 'true')
    const createServer = await importCreateServer()

    await expect(createServer()).rejects.toThrow(/AUTH_STUB_ENABLED/)
  })

  test('reads PORT from the environment, starts and stops cleanly', async () => {
    vi.stubEnv('PORT', '0')
    const createServer = await importCreateServer()

    server = await createServer()
    await server.start()

    expect(server.info.started).toBeGreaterThan(0)
    expect(server.info.port).toBeGreaterThan(0)

    await server.stop()
    expect(server.info.started).toBe(0)
  })
})
