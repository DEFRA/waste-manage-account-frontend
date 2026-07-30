import Bell from '@hapi/bell'
import Jwt from '@hapi/jwt'

import { config } from '#/config/config.js'
import { getOidcConfig } from '#/server/auth/get-oidc-config.js'
import { getSafeRedirect } from '#/server/auth/get-safe-redirect.js'

function buildDisplayName(claims) {
  const name = [claims.firstName, claims.lastName].filter(Boolean).join(' ')
  return name || claims.name || ''
}

/**
 * Bell's oauth2 profile hook receives the full token endpoint response as
 * `params` (not just the access token), which is where the OIDC `id_token`
 * lives — decode it (verification happens later, in the sign-in-oidc route,
 * via verify-token.js) to build the display profile bell exposes.
 */
async function profile(credentials, params) {
  const idToken = params.id_token
  const { payload: claims } = Jwt.token.decode(idToken).decoded

  credentials.idToken = idToken
  credentials.profile = {
    crn: claims.contactId,
    organisationId: claims.currentRelationshipId,
    displayName: buildDisplayName(claims)
  }
}

/**
 * Builds the @hapi/bell strategy options for the `defra-id` OAuth2/OIDC
 * strategy. `location()` is the only place a caller-supplied value
 * (`?redirect=`) enters the flow, so it's passed through the open-redirect
 * guard before being stashed in yar for the sign-in-oidc callback to read.
 */
export function getBellOptions(oidcConfig) {
  const clientId = config.get('defraId.clientId')

  return {
    provider: {
      protocol: 'oauth2',
      useParamsAuth: true,
      auth: oidcConfig.authorizationEndpoint,
      token: oidcConfig.tokenEndpoint,
      scope: ['openid', 'offline_access', clientId],
      profile,
      ...(config.get('defraId.pkceEnabled') ? { pkce: 'S256' } : {})
    },
    password: config.get('session.cookie.password'),
    clientId,
    clientSecret: config.get('defraId.clientSecret'),
    isSecure: config.get('session.cookie.secure'),
    // 'Lax' so the state cookie survives the top-level redirect back from
    // DEFRA ID; the default 'Strict' would drop it on that cross-site hop.
    isSameSite: 'Lax',
    providerParams: () => ({
      serviceId: config.get('defraId.serviceId'),
      p: config.get('defraId.policy'),
      response_mode: 'query'
    }),
    location(request) {
      const redirect = getSafeRedirect(request.query.redirect)
      request.yar.set('redirect', redirect)
      return `${config.get('defraId.callbackBaseUrl')}/auth/sign-in-oidc`
    }
  }
}

export const auth = {
  plugin: {
    name: 'auth',
    async register(server) {
      await server.register(Bell)

      const oidcConfig = await getOidcConfig()
      server.auth.strategy('defra-id', 'bell', getBellOptions(oidcConfig))
    }
  }
}
