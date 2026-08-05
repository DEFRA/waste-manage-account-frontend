import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import Jwt from '@hapi/jwt'

import { config } from '#/config/config.js'
import { getOidcConfig } from '#/server/auth/get-oidc-config.js'
import { getSafeRedirect } from '#/server/auth/get-safe-redirect.js'
import { refreshTokens } from '#/server/auth/refresh-tokens.js'

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
 *
 * State/CSRF: bell generates its own random value per sign-in attempt
 * (named `nonce` internally, sent as the OAuth2 `state` query param — see
 * @hapi/bell's oauth.js), stores it in an encrypted, HttpOnly `bell-*`
 * cookie, and rejects the callback if the returned `state` doesn't match.
 * A separate OIDC `nonce` claim on the ID token isn't added on top of
 * this: that claim exists to stop token substitution in the implicit/
 * hybrid flows, where an ID token can arrive over the browser front
 * channel. This app only uses the authorization code flow
 * (`response_type: 'code'`, hardcoded by bell) — the ID token is obtained
 * by our own server POSTing the code to DEFRA ID's token endpoint
 * (`verify-token.js` then checks its signature, expiry, `aud`, and `iss`),
 * so there's no front-channel token for a nonce to protect.
 */
export function getBellOptions(oidcConfig) {
  return {
    provider: {
      protocol: 'oauth2',
      useParamsAuth: true,
      auth: oidcConfig.authorizationEndpoint,
      token: oidcConfig.tokenEndpoint,
      scope: config.get('defraId.scopes'),
      profile,
      ...(config.get('defraId.pkceEnabled') ? { pkce: 'S256' } : {})
    },
    password: config.get('session.cookie.password'),
    clientId: config.get('defraId.clientId'),
    clientSecret: config.get('defraId.clientSecret'),
    isSecure: config.get('session.cookie.secure'),
    // 'Lax' so the state cookie survives the top-level redirect back from
    // DEFRA ID; the default 'Strict' would drop it on that cross-site hop.
    isSameSite: 'Lax',
    providerParams: () => {
      const providerParams = { serviceId: config.get('defraId.serviceId') }
      const policy = config.get('defraId.policy')
      const responseMode = config.get('defraId.responseMode')

      // Sent only when configured: a real DEFRA ID (Azure B2C) tenant
      // requires the policy as its `p` param, while environments running
      // cdp-defra-id-stub leave it unset — the stub rejects unknown
      // authorize params outright.
      if (policy) {
        providerParams.p = policy
      }

      // Defaults to form_post; omitted when configured empty — see the
      // defraId.responseMode config doc for the callback work form_post
      // still depends on.
      if (responseMode) {
        providerParams.response_mode = responseMode
      }

      return providerParams
    },
    location(request) {
      const redirect = getSafeRedirect(request.query.redirect)
      request.yar.set('redirect', redirect)
      return `${config.get('defraId.callbackBaseUrl')}/auth/sign-in-oidc`
    }
  }
}

function toCredentials(sessionId, session) {
  return {
    sessionId,
    scope: session.scope,
    profile: session.profile
  }
}

/**
 * Loads the auth session from `server.app.cache` for the cookie's
 * `sessionId`. Enforces the absolute session TTL (via `createdAt`) ahead of
 * token expiry so a transparently-refreshed token can't keep a session
 * alive forever. An expired token is refreshed (`refresh-tokens.js`) when
 * `defraId.refreshEnabled`, otherwise the session is dropped and invalidated.
 */
export async function validateSession(request, session) {
  const { cache } = request.server.app
  const authSession = await cache.get(session.sessionId)

  if (!authSession) {
    return { isValid: false }
  }

  if (Date.now() - authSession.createdAt > config.get('session.absoluteTtl')) {
    await cache.drop(session.sessionId)
    return { isValid: false }
  }

  const toleranceMs = config.get('defraId.clockToleranceSeconds') * 1000
  if (Date.now() <= authSession.expiresAt + toleranceMs) {
    return {
      isValid: true,
      credentials: toCredentials(session.sessionId, authSession)
    }
  }

  if (!config.get('defraId.refreshEnabled')) {
    await cache.drop(session.sessionId)
    return { isValid: false }
  }

  try {
    const tokenSet = await refreshTokens(authSession.refreshToken)
    const refreshedSession = {
      ...authSession,
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      idToken: tokenSet.idToken,
      expiresAt: Date.now() + tokenSet.expiresIn * 1000
    }

    await cache.set(session.sessionId, refreshedSession)

    return {
      isValid: true,
      credentials: toCredentials(session.sessionId, refreshedSession)
    }
  } catch {
    await cache.drop(session.sessionId)
    return { isValid: false }
  }
}

/**
 * Builds the @hapi/cookie `session` strategy options. The cookie itself
 * holds only `{ sessionId }` — the real session lives server-side in
 * `server.app.cache` — and `appendNext: 'redirect'` preserves the original
 * path+search so `location()` (in getBellOptions) can restore it after
 * sign-in.
 */
export function getCookieOptions() {
  return {
    cookie: {
      name: 'defra-id-session',
      password: config.get('session.cookie.password'),
      isSecure: config.get('session.cookie.secure'),
      isSameSite: 'Lax',
      ttl: config.get('session.cookie.ttl'),
      // Without an explicit path the browser scopes the cookie to the
      // directory of the URL that set it (/auth/, from the sign-in-oidc
      // callback), so it's never sent on any other page and every request
      // redirect-loops back through sign-in.
      path: '/'
    },
    redirectTo: '/auth/sign-in',
    appendNext: 'redirect',
    validate: validateSession
  }
}

export const auth = {
  plugin: {
    name: 'auth',
    async register(server) {
      await server.register([Bell, Cookie])

      const oidcConfig = await getOidcConfig()
      server.auth.strategy('defra-id', 'bell', getBellOptions(oidcConfig))
      server.auth.strategy('session', 'cookie', getCookieOptions())
    }
  }
}
