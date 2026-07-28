import { DefraIdProvider } from '../auth/providers/defra-id/index.js'
import { callback } from '../routes/auth/callback.js'
import { login } from '../routes/auth/login.js'
import { logout, signedOut } from '../routes/auth/logout.js'
import { defraId, stubLogin, stubLoginSubmit } from '../routes/auth/stub.js'
import { health } from '../routes/health.js'
import { home } from '../routes/home.js'
import { organisation } from '../routes/organisation.js'
import { config } from '../config/index.js'

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
        organisation
      ]

      // FR-6: the stub chooser only exists when stub mode is on, and its
      // real-provider escape hatch only exists when real Defra ID
      // credentials are configured alongside it — otherwise 404 (H-8/§8).
      if (config.auth.stubEnabled) {
        routes.push(stubLogin, stubLoginSubmit)
        if (DefraIdProvider.enabled()) {
          routes.push(defraId)
        }
      }

      server.route(routes)
    }
  }
}
