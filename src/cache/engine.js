import { Engine as CatboxMemory } from '@hapi/catbox-memory'
import { Engine as CatboxRedis } from '@hapi/catbox-redis'

import { config } from '../config/index.js'

// Selects the Catbox engine for the server session cache (spec §4): CatboxRedis
// against a distributed Redis in production, CatboxMemory locally. Constructing
// the Redis engine does not connect — Hapi starts the cache client on
// server.initialize()/start().
export function getCacheEngine(engine = config.session.cache.engine) {
  switch (engine) {
    case 'redis':
      return new CatboxRedis({
        host: config.redis.host,
        port: config.redis.port,
        partition: config.serviceName
      })
    case 'memory':
      return new CatboxMemory()
    default:
      throw new RangeError(
        `Unsupported SESSION_CACHE_ENGINE "${engine}" — expected "redis" or "memory"`
      )
  }
}
