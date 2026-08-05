import { finished } from 'node:stream/promises'
import inert from '@hapi/inert'

import { config } from '#/config/config.js'
import { serveStaticFiles } from './serve-static-files.js'
import { statusCodes } from '../common/constants/status-codes.js'

const publicPrefix = '/public'

/**
 * Delegates an asset request to the Vite dev server's connect middleware,
 * stripping the `/public` mount prefix Vite doesn't know about. A 404 is
 * returned when Vite passes the request through unhandled; otherwise the
 * response has already been written raw, so hapi's own lifecycle is
 * abandoned.
 */
async function serveFromVite(vite, request, h) {
  const { req, res } = request.raw
  req.url = req.url.slice(publicPrefix.length) || '/'

  const { promise: passedThrough, resolve } = Promise.withResolvers()
  vite.middlewares(req, res, () => resolve(true))
  const unhandled = await Promise.race([finished(res), passedThrough])

  if (unhandled) {
    return h.response().code(statusCodes.notFound)
  }

  return h.abandon
}

/**
 * Serves the `/public` assets: through the Vite dev-server middleware in
 * local development, from the prebuilt `.public` directory otherwise.
 *
 * The dev route mounts `vite.middlewares` on a route of our own rather
 * than via @defra/hapi-connect because the route must carry an explicit
 * `auth: false`: hapi applies `server.auth.default('session')` to every
 * route without its own auth config, and hapi-connect's internal route
 * can't be given one — which left the assets behind sign-in, so any
 * signed-out page rendered completely unstyled.
 *
 * `isDevelopment` means `NODE_ENV=development` (set by `npm run dev`),
 * not the CDP dev environment: every deployed CDP environment runs the
 * built artifact with `NODE_ENV=production`, where Vite — a
 * devDependency — is absent. Prebuilt assets are therefore the default;
 * the Vite branch is strictly opt-in.
 */
export const staticAssets = {
  plugin: {
    name: 'static-assets',
    async register(server) {
      if (config.get('isDevelopment')) {
        const createViteServer = (await import('vite')).createServer
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'custom'
        })

        server.route({
          method: 'GET',
          path: `${publicPrefix}/{param*}`,
          options: { auth: false },
          handler: (request, h) => serveFromVite(vite, request, h)
        })
      } else {
        await server.register([inert, serveStaticFiles])
      }
    }
  }
}
