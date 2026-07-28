import { sessionAuthScheme } from '../auth/core/scheme.js'

export const auth = {
  plugin: {
    name: 'auth',
    register(server) {
      server.auth.scheme('session', sessionAuthScheme)
      server.auth.strategy('session', 'session')
      server.auth.default('session')
    }
  }
}
