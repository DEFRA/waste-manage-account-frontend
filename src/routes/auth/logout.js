import { auditLogout } from '../../auth/core/audit.js'
import {
  getIdToken,
  getProfile,
  regenerateSession
} from '../../auth/core/session.js'
import {
  DefraIdProvider,
  DiscoveryError
} from '../../auth/providers/defra-id/index.js'

// FR-5: read what's needed for federated logout, then destroy the local
// session before anything else — a request that fails or bounces back
// from the IdP must never find an authenticated session (H-7).
export const logout = {
  method: 'GET',
  path: '/auth/logout',
  options: { auth: false },
  async handler(request, h) {
    const idToken = getIdToken(request)
    const userId = getProfile(request)?.id
    auditLogout(request.logger, userId)

    // yar.reset() drops the server-side cache entry for the current session
    // and issues a fresh, empty one — this alone destroys profile, id_token
    // and any leftover pre-auth values (spec §7, H-2).
    regenerateSession(request)

    // Stub sessions (and sessions already signed out) carry no id_token, so
    // there is nothing to federate — go straight to the local confirmation.
    if (!idToken) {
      return h.redirect('/auth/signed-out')
    }

    let redirectUrl
    try {
      redirectUrl = await DefraIdProvider.logoutRedirectUrl({
        idToken,
        request
      })
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
      return h.redirect('/auth/signed-out')
    }

    return h.redirect(redirectUrl ?? '/auth/signed-out')
  }
}

// FR-5 step 5: the terminal landing page after either a federated or
// local-only sign-out, with a way back in — public so it renders regardless
// of session state.
export const signedOut = {
  method: 'GET',
  path: '/auth/signed-out',
  options: { auth: false },
  handler(_request, h) {
    return h.view('auth/signed-out')
  }
}
