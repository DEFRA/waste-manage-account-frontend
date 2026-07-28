import { randomToken } from '../../core/random.js'
import { safeReturnTo } from '../../core/return-to.js'
import { setPreAuth } from '../../core/session.js'
import { DiscoveryError, getDiscovery } from '../../clients/oidc/discovery.js'
import { createCodeVerifier } from '../../clients/oidc/pkce.js'
import {
  TokenExchangeError,
  exchangeCode
} from '../../clients/oidc/token-endpoint.js'
import {
  TokenVerificationError,
  verifyIdToken
} from '../../clients/oidc/verify-token.js'
import { config } from '../../../config/index.js'
import { buildAuthorizeUrl } from './authorize-url.js'
import { buildProfile } from './profile.js'

export { DiscoveryError, TokenExchangeError, TokenVerificationError }

// FR-6 real-provider escape hatch: /auth/defra-id (real flow while stub mode
// is on) only makes sense once every Defra ID onboarding value is present —
// same fields validateConfig() requires when the stub is off. Was
// config/index.js#isDefraIdConfigured() before spec-003 §2.6 moved provider
// policy out of config.
function enabled() {
  return Boolean(
    config.defraId.discoveryUrl &&
    config.defraId.clientId &&
    config.defraId.clientSecret &&
    config.defraId.serviceId
  )
}

// The real OIDC initiation (FR-1): discovery, state/nonce/PKCE generation,
// pre-auth session write, and the authorize-URL a caller redirects to.
// DiscoveryError propagates for the caller to map to the 502 "sign-in
// unavailable" page (spec §6.1) — never falls back to hard-coded endpoints.
async function beginLogin(request) {
  const discovery = await getDiscovery(config.defraId.discoveryUrl, {
    logger: request.logger
  })

  const state = randomToken()
  const nonce = randomToken()
  const codeVerifier = config.defraId.pkceEnabled
    ? createCodeVerifier()
    : undefined

  setPreAuth(request, {
    state,
    nonce,
    codeVerifier,
    returnTo: safeReturnTo(request.query.returnTo)
  })

  return {
    redirectUrl: buildAuthorizeUrl(discovery, {
      state,
      nonce,
      codeVerifier,
      query: request.query
    })
  }
}

// Today's callback orchestration minus session-write/audit/redirect (spec-003
// §2.3): discovery, code exchange, id_token verify, return the verified
// profile. `preAuth` is the already-taken (single-use) pre-auth session
// value; typed client errors propagate for the caller to map to the existing
// failure classes.
async function completeLogin(request, preAuth) {
  const discovery = await getDiscovery(config.defraId.discoveryUrl, {
    logger: request.logger
  })

  const tokens = await exchangeCode({
    tokenEndpoint: discovery.token_endpoint,
    clientId: config.defraId.clientId,
    clientSecret: config.defraId.clientSecret,
    code: request.query.code,
    redirectUri: `${config.auth.callbackBaseUrl}/auth/callback`,
    codeVerifier: preAuth.codeVerifier,
    scope: `openid offline_access ${config.defraId.clientId}`,
    logger: request.logger
  })

  const claims = await verifyIdToken(tokens.id_token, {
    jwksUri: discovery.jwks_uri,
    issuer: discovery.issuer,
    audience: config.defraId.clientId,
    nonce: preAuth.nonce,
    clockToleranceSeconds: config.defraId.clockToleranceSeconds
  })

  return { profile: buildProfile(claims), idToken: tokens.id_token }
}

// Today's end-session URL building (FR-5): null means "no federated round
// trip" — a stub session (no id_token) or a discovery-less end_session_endpoint
// both fall back to a local-only sign-out.
async function logoutRedirectUrl({ idToken, request }) {
  if (!idToken) {
    return null
  }

  const discovery = await getDiscovery(config.defraId.discoveryUrl, {
    logger: request.logger
  })

  if (!discovery.end_session_endpoint) {
    return null
  }

  const params = new URLSearchParams({
    id_token_hint: idToken,
    post_logout_redirect_uri: `${config.auth.callbackBaseUrl}/auth/signed-out`
  })

  return `${discovery.end_session_endpoint}?${params.toString()}`
}

// No provider-specific routes of its own: /auth/login, /auth/callback and
// /auth/logout are static, URL-stable routes (spec §2.5) already wired
// directly to this provider via service.js. Present only so the registry
// can call extraRoutes() uniformly across every enabled provider.
function extraRoutes() {
  return []
}

export const DefraIdProvider = {
  name: 'defra-id',
  enabled,
  beginLogin,
  completeLogin,
  logoutRedirectUrl,
  extraRoutes
}
