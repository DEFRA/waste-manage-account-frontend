import Hapi from '@hapi/hapi'

import { getCacheEngine } from './cache/engine.js'
import { config } from './config/index.js'
import { validateConfig } from './config/validate.js'
import { auth } from './plugins/auth.js'
import { errorPages } from './plugins/errors.js'
import { logging } from './plugins/logging.js'
import { rateLimit } from './plugins/rate-limit.js'
import { router } from './plugins/router.js'
import { session } from './plugins/session.js'
import { staticFiles } from './plugins/static-files.js'
import { views } from './plugins/views.js'

export async function createServer() {
  // Fail fast on a misconfigured environment (spec §9) before any plugin or
  // cache is wired up.
  validateConfig(config)

  const server = Hapi.server({
    host: config.host,
    port: config.port,
    cache: [
      {
        name: config.session.cache.name,
        engine: getCacheEngine()
      }
    ]
  })

  // session (yar) binds to the 'session' cache provisioned above and comes
  // right after logging so request.yar exists before any later plugin — the
  // auth strategy and every route handler read the session;
  // auth sets server.auth.default() (FR-3, deny by default) before any route
  // registers, so it must precede staticFiles/router — routes registered
  // before this call would silently stay unauthenticated;
  // views must precede router so route handlers can use h.view();
  // errorPages needs both views (h.view) and logging (request.logger);
  // rateLimit hooks onRequest (H-12), the earliest request-lifecycle
  // extension point, so a blocked /auth/* request never reaches session/auth
  // or a route handler regardless of where it sits in this array — it is
  // listed first to make that reflect the registration order too
  await server.register([
    logging,
    rateLimit,
    session,
    auth,
    views,
    staticFiles,
    errorPages,
    router
  ])

  return server
}
