import { vi } from 'vitest'

import { Redis } from 'ioredis'

import { createServer } from './server.js'
import { config } from '#/config/config.js'

vi.mock('ioredis', () => ({
  ...vi.importActual('ioredis'),
  Redis: vi.fn(function () {
    return { on: () => ({}) }
  })
}))

describe('#createServer auth session cache', () => {
  describe('When using the memory cache engine', () => {
    let server

    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
    })

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Should provision the segment from the session cache config, not a new engine', () => {
      expect(server.app.cache._segment).toBe('defra-id-session')
      expect(server.app.cache.rule.expiresIn).toBe(
        config.get('session.idleTtl')
      )
    })

    test('Should round-trip a value through the defra-id-session segment', async () => {
      await server.app.cache.set('a-key', { sessionId: 'abc-123' })

      await expect(server.app.cache.get('a-key')).resolves.toEqual({
        sessionId: 'abc-123'
      })
    })

    test('Should return null for a key that was never set', async () => {
      await expect(server.app.cache.get('missing-key')).resolves.toBeNull()
    })
  })

  describe('When using the redis cache engine', () => {
    let server

    beforeEach(async () => {
      config.set('session.cache.engine', 'redis')
      server = await createServer()
    })

    afterEach(async () => {
      await server.stop({ timeout: 0 })
      config.set('session.cache.engine', 'memory')
    })

    test('Should back the auth session segment with the single shared Redis client', () => {
      expect(Redis).toHaveBeenCalledTimes(1)
    })
  })
})
