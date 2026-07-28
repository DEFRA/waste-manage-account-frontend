import { auditLoginFailure } from '../../auth/core/audit.js'
import { safeReturnTo } from '../../auth/core/return-to.js'
import {
  DefraIdProvider,
  DiscoveryError
} from '../../auth/providers/defra-id/index.js'
import { config } from '../../config/index.js'

// The real OIDC initiation (FR-1): delegates to DefraIdProvider.beginLogin
// for discovery/state/nonce/PKCE/pre-auth-write, then either redirects to the
// authorize endpoint or — on a discovery failure (§6.1, 502-class, never
// falls back to hard-coded endpoints) — renders the "sign-in unavailable"
// page. Not exported: `routes/auth/stub.js`'s /auth/defra-id escape hatch
// calls DefraIdProvider.beginLogin directly rather than importing this
// route-file-local wrapper (spec-003 §11 WI-3, killing the last route→route
// import).
async function initiateRealLogin(request, h) {
  let result
  try {
    result = await DefraIdProvider.beginLogin(request)
  } catch (error) {
    if (!(error instanceof DiscoveryError)) {
      throw error
    }
    request.logger.warn(
      { err: error },
      'sign-in unavailable: OIDC discovery failed'
    )
    auditLoginFailure(request.logger, 'discovery_failed')
    return h.view('auth/sign-in-unavailable').code(502)
  }

  return h.redirect(result.redirectUrl)
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
