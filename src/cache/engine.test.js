import { Engine as CatboxMemory } from '@hapi/catbox-memory'
import { Engine as CatboxRedis } from '@hapi/catbox-redis'
import { afterEach, describe, expect, test, vi } from 'vitest'

// config reads env at import time, so each test re-imports the selector with a
// fresh module graph after stubbing the environment.
async function importGetCacheEngine() {
  vi.resetModules()
  const { getCacheEngine } = await import('./engine.js')
  return getCacheEngine
}

describe('getCacheEngine', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('returns CatboxMemory for "memory"', async () => {
    const getCacheEngine = await importGetCacheEngine()

    expect(getCacheEngine('memory')).toBeInstanceOf(CatboxMemory)
  })

  test('returns CatboxRedis for "redis" without connecting', async () => {
    const getCacheEngine = await importGetCacheEngine()

    // Constructing the engine must not open a connection, otherwise the server
    // could not even be built without a reachable Redis.
    expect(getCacheEngine('redis')).toBeInstanceOf(CatboxRedis)
  })

  test('defaults to the SESSION_CACHE_ENGINE env value', async () => {
    vi.stubEnv('SESSION_CACHE_ENGINE', 'redis')
    const getCacheEngine = await importGetCacheEngine()

    expect(getCacheEngine()).toBeInstanceOf(CatboxRedis)
  })

  test('defaults to memory outside production', async () => {
    vi.stubEnv('SESSION_CACHE_ENGINE', undefined)
    const getCacheEngine = await importGetCacheEngine()

    expect(getCacheEngine()).toBeInstanceOf(CatboxMemory)
  })

  test('defaults to redis in production (no in-process session state)', async () => {
    vi.stubEnv('SESSION_CACHE_ENGINE', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    const getCacheEngine = await importGetCacheEngine()

    expect(getCacheEngine()).toBeInstanceOf(CatboxRedis)
  })

  test('rejects unsupported engines instead of silently falling back', async () => {
    const getCacheEngine = await importGetCacheEngine()

    expect(() => getCacheEngine('mongo')).toThrow(RangeError)
  })
})
