import {
  signInController,
  signInOidcController,
  signOutController,
  signOutOidcController,
  signedOutController
} from './controller.js'

/**
 * Sets up the DEFRA ID sign-in routes. Named `auth-routes` (not `auth`) to
 * avoid a hapi plugin name collision with `plugins/auth.js`, which
 * registers the `defra-id`/`session` strategies these routes depend on.
 * These routes are registered in src/server/router.js.
 */
export const authRoutes = {
  plugin: {
    name: 'auth-routes',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/auth/sign-in',
          ...signInController
        },
        {
          method: 'GET',
          path: '/auth/sign-in-oidc',
          ...signInOidcController
        },
        {
          method: 'GET',
          path: '/auth/sign-out',
          ...signOutController
        },
        {
          method: 'GET',
          path: '/auth/sign-out-oidc',
          ...signOutOidcController
        },
        {
          method: 'GET',
          path: '/auth/signed-out',
          ...signedOutController
        }
      ])
    }
  }
}
