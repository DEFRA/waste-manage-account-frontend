import { homeController } from './controller.js'

/**
 * Sets up the routes used in the home page.
 * These routes are registered in src/server/router.js.
 *
 * The account home page is the first scope-protected page: it requires the
 * default `session` strategy plus the baseline `'user'` scope every signed-in
 * session carries (see get-permissions.js), so signed-out visitors are
 * redirected to sign in and signed-in visitors missing the scope get a 403.
 */
export const home = {
  plugin: {
    name: 'home',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/',
          options: { auth: { scope: ['user'] } },
          ...homeController
        }
      ])
    }
  }
}
