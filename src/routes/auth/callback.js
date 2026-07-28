import { auditLoginFailure, auditLoginSuccess } from '../../auth/core/audit.js'
import { safeReturnTo } from '../../auth/core/return-to.js'
import {
  regenerateSession,
  setIdToken,
  setProfile,
  takePreAuth
} from '../../auth/core/session.js'
import {
  DefraIdProvider,
  DiscoveryError,
  TokenExchangeError,
  TokenVerificationError
} from '../../auth/providers/defra-id/index.js'

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

    // Discovery → code exchange → id_token verification, delegated to the
    // provider (spec-003 §2.3); it throws the same typed client errors this
    // route used to catch directly, one per failure point.
    let result
    try {
      result = await DefraIdProvider.completeLogin(request, preAuth)
    } catch (err) {
      if (err instanceof DiscoveryError) {
        return failClosed(request, h, 'discovery_failed', err)
      }
      if (err instanceof TokenExchangeError) {
        return failClosed(request, h, 'token_exchange_failed', err)
      }
      if (err instanceof TokenVerificationError) {
        return failClosed(request, h, 'token_verification_failed', err)
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
    // /auth/login) — re-check it at read time rather than trusting the
    // stored value was safe when written.
    return h.redirect(safeReturnTo(preAuth.returnTo))
  }
}
