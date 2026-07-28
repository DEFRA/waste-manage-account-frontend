import { auditLoginFailure, auditLoginSuccess } from '../../auth/core/audit.js'
import { safeReturnTo } from '../../auth/core/return-to.js'
import {
  regenerateSession,
  setIdToken,
  setProfile,
  takePreAuth
} from '../../auth/core/session.js'
import { DiscoveryError, getDiscovery } from '../../auth/discovery.js'
import { TokenExchangeError, exchangeCode } from '../../auth/token-endpoint.js'
import {
  TokenVerificationError,
  verifyIdToken
} from '../../auth/verify-token.js'
import { config } from '../../config/index.js'

// Spec §5.1: assembled from verified id_token claims only — never from the
// unverified query string. userType/scope are literals for this integration
// (single user type in v1); roles/relationships default to [] because the
// IdP may omit them for a relationship with none.
function buildProfile(claims) {
  return {
    id: claims.sub,
    email: claims.email,
    name: `${claims.firstName ?? ''} ${claims.lastName ?? ''}`.trim(),
    userType: 'operator',
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    contactId: claims.contactId,
    currentRelationshipId: claims.currentRelationshipId,
    relationships: Array.isArray(claims.relationships)
      ? claims.relationships
      : [],
    scope: ['operator']
  }
}

// FR-2: every failure path fails closed to /auth/login, logging only the
// failure class (never the code/token/claims that produced it).
function failClosed(request, h, failure, error) {
  request.logger.warn(
    { failure, err: error },
    'auth callback failed; redirecting to login'
  )
  auditLoginFailure(request.logger, failure)
  return h.redirect('/auth/login')
}

export const callback = {
  method: 'GET',
  path: '/auth/callback',
  options: { auth: false },
  async handler(request, h) {
    // FR-2 step 1: read-and-clear the pre-auth session immediately so a
    // replayed callback (this URL hit twice) always finds nothing stored,
    // regardless of how this request itself turns out.
    const preAuth = takePreAuth(request)
    const { state, error, code } = request.query

    if (!preAuth || typeof state !== 'string' || state !== preAuth.state) {
      return failClosed(request, h, 'state_mismatch')
    }

    // FR-2 step 2: the user cancelling/denying at the IdP is not a failure of
    // our flow — a friendly page, no code exchange, no login bounce.
    if (typeof error === 'string' && error !== '') {
      request.logger.warn({ error }, 'auth callback: sign-in was not completed')
      auditLoginFailure(request.logger, error)
      return h.view('auth/sign-in-cancelled')
    }

    if (typeof code !== 'string' || code === '') {
      return failClosed(request, h, 'missing_code')
    }

    let discovery
    try {
      discovery = await getDiscovery(config.defraId.discoveryUrl, {
        logger: request.logger
      })
    } catch (err) {
      if (!(err instanceof DiscoveryError)) {
        throw err
      }
      return failClosed(request, h, 'discovery_failed', err)
    }

    let tokens
    try {
      tokens = await exchangeCode({
        tokenEndpoint: discovery.token_endpoint,
        clientId: config.defraId.clientId,
        clientSecret: config.defraId.clientSecret,
        code,
        redirectUri: `${config.auth.callbackBaseUrl}/auth/callback`,
        codeVerifier: preAuth.codeVerifier,
        scope: `openid offline_access ${config.defraId.clientId}`,
        logger: request.logger
      })
    } catch (err) {
      if (!(err instanceof TokenExchangeError)) {
        throw err
      }
      return failClosed(request, h, 'token_exchange_failed', err)
    }

    let claims
    try {
      claims = await verifyIdToken(tokens.id_token, {
        jwksUri: discovery.jwks_uri,
        issuer: discovery.issuer,
        audience: config.defraId.clientId,
        nonce: preAuth.nonce,
        clockToleranceSeconds: config.defraId.clockToleranceSeconds
      })
    } catch (err) {
      if (!(err instanceof TokenVerificationError)) {
        throw err
      }
      return failClosed(request, h, 'token_verification_failed', err)
    }

    // Session-fixation defence (spec §7, H-2): regenerate before writing any
    // authenticated state into the session.
    regenerateSession(request)
    setProfile(request, buildProfile(claims))
    setIdToken(request, tokens.id_token)
    auditLoginSuccess(request.logger, claims.sub)

    // returnTo is attacker-controllable (it arrived as a query param on
    // /auth/login) — re-check it at read time rather than trusting the
    // stored value was safe when written.
    return h.redirect(safeReturnTo(preAuth.returnTo))
  }
}
