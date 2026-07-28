import crypto from 'node:crypto'

import { auditLoginFailure } from '../../auth/core/audit.js'
import { randomToken } from '../../auth/core/random.js'
import { safeReturnTo } from '../../auth/core/return-to.js'
import { setPreAuth } from '../../auth/core/session.js'
import { DiscoveryError, getDiscovery } from '../../auth/discovery.js'
import { config } from '../../config/index.js'

function codeChallengeS256(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

function buildAuthorizeUrl(discovery, { state, nonce, codeVerifier, query }) {
  const params = new URLSearchParams({
    client_id: config.defraId.clientId,
    serviceId: config.defraId.serviceId,
    response_type: 'code',
    redirect_uri: `${config.auth.callbackBaseUrl}/auth/callback`,
    // B2C convention: openid yields the id_token, offline_access a refresh
    // token, and the client ID as a scope an access token for our own API.
    scope: `openid offline_access ${config.defraId.clientId}`,
    state,
    nonce
  })

  // Omitted entirely (not sent empty) when DEFRA_ID_PKCE_ENABLED=false.
  if (codeVerifier) {
    params.set('code_challenge', codeChallengeS256(codeVerifier))
    params.set('code_challenge_method', 'S256')
  }

  // Optional org-picker passthrough (FR-1): forwarded as-is when present.
  if (query.forceReselection) {
    params.set('forceReselection', query.forceReselection)
  }
  if (query.relationshipId) {
    params.set('relationshipId', query.relationshipId)
  }

  return `${discovery.authorization_endpoint}?${params.toString()}`
}

// The real OIDC initiation (FR-1): discovery, state/nonce/PKCE generation,
// and the 302 to the authorization endpoint. Shared by /auth/login (when the
// stub is disabled) and /auth/defra-id (the stub-mode escape hatch to the
// real flow, FR-6) so there is exactly one place that builds this redirect.
export async function initiateRealLogin(request, h) {
  let discovery
  try {
    discovery = await getDiscovery(config.defraId.discoveryUrl, {
      logger: request.logger
    })
  } catch (error) {
    if (!(error instanceof DiscoveryError)) {
      throw error
    }
    // §6.1: a discovery failure is 502-class and must never fall back to
    // hard-coded endpoints.
    request.logger.warn(
      { err: error },
      'sign-in unavailable: OIDC discovery failed'
    )
    auditLoginFailure(request.logger, 'discovery_failed')
    return h.view('auth/sign-in-unavailable').code(502)
  }

  const state = randomToken()
  const nonce = randomToken()
  const codeVerifier = config.defraId.pkceEnabled ? randomToken() : undefined

  setPreAuth(request, {
    state,
    nonce,
    codeVerifier,
    returnTo: safeReturnTo(request.query.returnTo)
  })

  return h.redirect(
    buildAuthorizeUrl(discovery, {
      state,
      nonce,
      codeVerifier,
      query: request.query
    })
  )
}

export const login = {
  method: 'GET',
  path: '/auth/login',
  options: { auth: false },
  async handler(request, h) {
    // FR-6: stub mode replaces the real flow wholesale with the fake-user
    // chooser; returnTo travels with it as a query param since the pre-auth
    // session mechanism used by the real flow isn't involved on this path.
    if (config.auth.stubEnabled) {
      const returnTo = safeReturnTo(request.query.returnTo)
      return h.redirect(
        `/auth/stub/login?returnTo=${encodeURIComponent(returnTo)}`
      )
    }

    return initiateRealLogin(request, h)
  }
}
