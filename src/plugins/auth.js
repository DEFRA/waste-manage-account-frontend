import Boom from '@hapi/boom'

import { getProfile } from '../auth/session.js'
import { getTestUser } from '../auth/test-users.js'
import { config } from '../config/index.js'

// FR-3: deny by default. Credentials resolve from the server-side session
// profile (spec §5 shape) written by /auth/callback or the stub login; under
// NODE_ENV=test the scheme never touches the session at all and instead
// auto-authenticates a canned user (FR-6), so business-route tests are
// independent of the OIDC flow and need no cookies.
function sessionAuthScheme() {
  return {
    authenticate(request, h) {
      if (config.isTest) {
        return h.authenticated({
          credentials: getTestUser(request.headers['x-test-user-type'])
        })
      }

      const profile = getProfile(request)
      if (!profile) {
        throw Boom.unauthorized()
      }

      return h.authenticated({ credentials: profile })
    }
  }
}

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
