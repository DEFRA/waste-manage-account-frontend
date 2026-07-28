// Orchestrates login/logout flows against the provider registry (spec §2.1
// SERVICE layer): "which provider, which step, what happens to the
// session." Owns everything §2.3 says never belongs in a provider — session
// writes of the verified profile, regenerateSession() at both auth
// boundaries, audit events, safeReturnTo handling, and the fail-closed
// redirect policy — so those invariants (H-2/H-5/H-7/H-11) are enforced in
// exactly one place regardless of how many providers exist. Routes call
// only this module; providers are never imported directly by a route.

import {
  auditLoginFailure,
  auditLoginSuccess,
  auditLogout
} from './core/audit.js'
import { safeReturnTo } from './core/return-to.js'
import {
  getIdToken,
  getProfile,
  regenerateSession,
  setIdToken,
  setProfile,
  takePreAuth
} from './core/session.js'
import {
  DefraIdProvider,
  DiscoveryError,
  TokenExchangeError,
  TokenVerificationError
} from './providers/defra-id/index.js'
import { getProvider } from './providers/registry.js'
import { config } from '../config/index.js'

// Discovery-failure → "sign-in unavailable" mapping (spec §6.1): 502-class,
// never a hard-coded endpoint fallback. The one copy for every beginLogin
// caller that goes through this module.
async function runBeginLogin(provider, request) {
  try {
    return await provider.beginLogin(request)
  } catch (error) {
    if (!(error instanceof DiscoveryError)) {
      throw error
    }
    request.logger.warn(
      { err: error },
      'sign-in unavailable: OIDC discovery failed'
    )
    auditLoginFailure(request.logger, 'discovery_failed')
    return { view: 'auth/sign-in-unavailable', statusCode: 502 }
  }
}

// FR-1/§2.5: /auth/login is the canonical entry point and dispatches to the
// configured default provider. The stub provider owns its own dedicated,
// bookmarkable chooser URL (/auth/stub/login) rather than rendering inline
// here, so dispatching to it is a redirect rather than a direct beginLogin
// call — every other (real) provider hands back its own BeginResult as-is.
export async function beginLogin(request) {
  if (config.auth.defaultProvider === 'stub') {
    const returnTo = safeReturnTo(request.query.returnTo)
    return {
      redirectUrl: `/auth/stub/login?returnTo=${encodeURIComponent(returnTo)}`
    }
  }

  return runBeginLogin(getProvider(config.auth.defaultProvider), request)
}

// FR-2 fail-closed policy: every failure path lands here, logging only the
// failure class (never the code/token/claims that produced it).
function failClosed(request, failure, error) {
  request.logger.warn(
    { failure, err: error },
    'auth callback failed; redirecting to login'
  )
  auditLoginFailure(request.logger, failure)
  return { redirectUrl: '/auth/login' }
}

// FR-2: /auth/callback is permanently bound to the Defra ID provider (spec
// §2.5 — it's a registered redirect URI, so it can never dispatch by
// config). Owns the whole callback protocol in order: single-use pre-auth
// read, state check, IdP error param, missing code, then delegates the
// exchange+verify to the provider before writing the verified session.
export async function completeLogin(request) {
  const preAuth = takePreAuth(request)
  const { state, error, code } = request.query

  if (!preAuth || typeof state !== 'string' || state !== preAuth.state) {
    return failClosed(request, 'state_mismatch')
  }

  // The user cancelling/denying at the IdP is not a failure of our flow — a
  // friendly page, no code exchange, no login bounce.
  if (typeof error === 'string' && error !== '') {
    request.logger.warn({ error }, 'auth callback: sign-in was not completed')
    auditLoginFailure(request.logger, error)
    return { view: 'auth/sign-in-cancelled' }
  }

  if (typeof code !== 'string' || code === '') {
    return failClosed(request, 'missing_code')
  }

  let result
  try {
    result = await DefraIdProvider.completeLogin(request, preAuth)
  } catch (err) {
    if (err instanceof DiscoveryError) {
      return failClosed(request, 'discovery_failed', err)
    }
    if (err instanceof TokenExchangeError) {
      return failClosed(request, 'token_exchange_failed', err)
    }
    if (err instanceof TokenVerificationError) {
      return failClosed(request, 'token_verification_failed', err)
    }
    throw err
  }

  // Session-fixation defence (spec §7, H-2): regenerate before writing any
  // authenticated state into the session.
  regenerateSession(request)
  setProfile(request, result.profile)
  setIdToken(request, result.idToken)
  auditLoginSuccess(request.logger, result.profile.id)

  // returnTo is attacker-controllable (it arrived as a query param on
  // /auth/login) — re-check it at read time rather than trusting the stored
  // value was safe when written.
  return { redirectUrl: safeReturnTo(preAuth.returnTo) }
}

// FR-5: reads what's needed for federated logout, then destroys the local
// session before anything else — a request that fails or bounces back from
// the IdP must never find an authenticated session (H-7). Only a real login
// through DefraIdProvider ever writes an id_token, so its presence alone is
// enough to know a federated round trip is possible; a stub session has
// none to give.
export async function logout(request) {
  const idToken = getIdToken(request)
  const userId = getProfile(request)?.id
  auditLogout(request.logger, userId)

  // yar.reset() drops the server-side cache entry for the current session
  // and issues a fresh, empty one — this alone destroys profile, id_token
  // and any leftover pre-auth values (spec §7, H-2).
  regenerateSession(request)

  if (!idToken) {
    return { redirectUrl: '/auth/signed-out' }
  }

  let redirectUrl
  try {
    redirectUrl = await DefraIdProvider.logoutRedirectUrl({ idToken, request })
  } catch (err) {
    if (!(err instanceof DiscoveryError)) {
      throw err
    }
    // The local session is already gone; a federated-logout failure just
    // means Defra ID keeps its own session alive, not that our sign-out
    // failed.
    request.logger.warn(
      { err },
      'auth logout: discovery failed; skipping federated logout'
    )
    return { redirectUrl: '/auth/signed-out' }
  }

  return { redirectUrl: redirectUrl ?? '/auth/signed-out' }
}

// Converts a BeginResult (spec §2.3: `{ redirectUrl } | { view, context,
// statusCode? }`) into a hapi response — the one place routes touch the
// toolkit for a service result, so none of them duplicate this branch.
export function respond(h, result) {
  if (result.redirectUrl) {
    return h.redirect(result.redirectUrl)
  }
  const response = h.view(result.view, result.context ?? {})
  return result.statusCode ? response.code(result.statusCode) : response
}
