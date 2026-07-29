import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Inert from '@hapi/inert'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '..', '..')

// Serves the Vite build output (.public): the compiled stylesheet under
// /public/stylesheets and GOV.UK Frontend assets under /public/assets.
export const staticFiles = {
  plugin: {
    name: 'static-files',
    async register(server) {
      await server.register(Inert)

      server.route({
        method: 'GET',
        path: '/public/{param*}',
        // Public (spec §8 route map): stylesheets/scripts must load on the
        // sign-in page itself, before any session exists.
        options: { auth: false },
        handler: {
          directory: {
            path: path.join(projectRoot, '.public'),
            redirectToSlash: false,
            index: false
          }
        }
      })
    }
  }
}
