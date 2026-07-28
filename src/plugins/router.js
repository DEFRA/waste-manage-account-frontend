import { enabledProviders } from '../auth/providers/registry.js'
import { callback } from '../routes/auth/callback.js'
import { login } from '../routes/auth/login.js'
import { logout, signedOut } from '../routes/auth/logout.js'
import { health } from '../routes/health.js'
import { home } from '../routes/home.js'
import { organisation } from '../routes/organisation.js'

export const router = {
  plugin: {
    name: 'router',
    register(server) {
      const routes = [
        home,
        health,
        login,
        callback,
        logout,
        signedOut,
        organisation,
        // Provider-contributed routes (spec §11 WI-4b): each enabled
        // provider's extraRoutes() — e.g. the stub chooser GET/POST and the
        // /auth/defra-id escape hatch — replacing the stubEnabled/
        // isDefraIdConfigured conditionals this file used to branch on
        // itself.
        ...enabledProviders().flatMap((provider) => provider.extraRoutes())
      ]

      server.route(routes)
    }
  }
}
