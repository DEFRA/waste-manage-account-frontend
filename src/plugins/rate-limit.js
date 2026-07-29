import Boom from '@hapi/boom'

import { config } from '../config/index.js'

const MS_PER_SECOND = 1000

const WINDOW_SECONDS = Number.parseInt(
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ?? '60',
  10
)

// Effectively unreachable by default under NODE_ENV=test, so the rest of the
// suite — which fires many requests at /auth/* routes — stays green;
// rate-limit.test.js opts back in with an explicit AUTH_RATE_LIMIT_MAX.
const MAX_REQUESTS = Number.parseInt(
  process.env.AUTH_RATE_LIMIT_MAX ??
    (config.isTest ? String(Number.MAX_SAFE_INTEGER) : '20'),
  10
)

function isAuthPath(path) {
  return path === '/auth' || path.startsWith('/auth/')
}

// H-12: blunt-force/DoS mitigation on the unauthenticated /auth/* surface.
// Hand-rolled (no new dependency) — an onRequest ext keyed by client IP +
// path, counted in a dedicated catbox segment on the server's default
// (in-memory) cache. Per-instance counting is enough for this hardening
// layer: unlike the session cache it does not need to survive a restart or
// be shared across instances.
export const rateLimit = {
  plugin: {
    name: 'rate-limit',
    register(server) {
      const cache = server.cache({
        segment: 'rate-limit',
        expiresIn: WINDOW_SECONDS * MS_PER_SECOND
      })

      server.ext('onRequest', async (request, h) => {
        if (!isAuthPath(request.path)) {
          return h.continue
        }

        const key = `${request.info.remoteAddress}:${request.path}`
        const count = (await cache.get(key)) ?? 0

        if (count >= MAX_REQUESTS) {
          throw Boom.tooManyRequests()
        }

        await cache.set(key, count + 1)
        return h.continue
      })
    }
  }
}
