import Boom from '@hapi/boom'

import { auditLoginFailure, auditLoginSuccess } from '../../core/audit.js'
import { randomToken } from '../../core/random.js'
import { safeReturnTo } from '../../core/return-to.js'
import {
  regenerateSession,
  setProfile,
  setStubCsrf,
  takeStubCsrf
} from '../../core/session.js'
import { config } from '../../../config/index.js'
import { DefraIdProvider, DiscoveryError } from '../defra-id/index.js'
import { getStubUser, getStubUsers } from './users.js'

// FR-6 dev stub, only ever offered when AUTH_STUB_ENABLED (config already
// hard-blocks prod, H-8).
function enabled() {
  return config.auth.stubEnabled
}

// Renders the fake-user chooser (today's GET /auth/stub/login handler body).
// Returns plain view/context data rather than calling h.view() itself, so
// this module stays free of any Hapi-toolkit coupling (spec §2.3 — a
// provider's BeginResult is `{ redirectUrl } | { view, context, statusCode? }`).
function beginLogin(request) {
  const csrfToken = randomToken()
  setStubCsrf(request, csrfToken)

  return {
    view: 'auth/stub-login',
    context: {
      users: getStubUsers(),
      csrfToken,
      returnTo: safeReturnTo(request.query.returnTo),
      // FR-6 real-provider escape hatch: only offered when real Defra ID
      // credentials are actually configured alongside the stub.
      defraIdAvailable: DefraIdProvider.enabled()
    }
  }
}

// H-9: validates the single-use CSRF token minted by beginLogin, then
// resolves the chosen user. Session write/audit/redirect are never done here
// (spec §2.3 — providers return data, the caller decides what it means for
// the session); returns only `{ profile }`, matching CompleteResult.
function completeLogin(request) {
  const payload = request.payload ?? {}
  const expectedCsrfToken = takeStubCsrf(request)

  if (!expectedCsrfToken || payload.csrfToken !== expectedCsrfToken) {
    throw Boom.forbidden('invalid or missing CSRF token')
  }

  const user = getStubUser(payload.userId)
  if (!user) {
    throw Boom.badRequest('unknown stub user')
  }

  return { profile: user.profile }
}

// A stub session never holds a real id_token, so there is never a federated
// round trip to make — always local-only sign-out (FR-5).
async function logoutRedirectUrl() {
  return null
}

// Self-contained hapi route definitions for the chooser GET/POST plus the
// FR-6 real-provider escape hatch. Not yet consumed by plugins/router.js —
// that rewiring, and the session-write/audit/redirect these handlers still
// do inline, both collapse into src/auth/service.js in the next work item
// (spec-003 WI-4 Phase 5); until then this mirrors the pattern WI-3b used to
// wire DefraIdProvider directly into routes/auth/{login,callback,logout}.js.
function extraRoutes() {
  return [
    {
      method: 'GET',
      path: '/auth/stub/login',
      options: { auth: false },
      handler(request, h) {
        const { view, context } = beginLogin(request)
        return h.view(view, context)
      }
    },
    {
      method: 'POST',
      path: '/auth/stub/login',
      options: { auth: false },
      handler(request, h) {
        const payload = request.payload ?? {}
        const { profile } = completeLogin(request)

        // Session-fixation defence (H-2), same as a real login: regenerate
        // before writing any authenticated state, and write no id_token — a
        // stub session has none to give at logout (FR-5 goes straight to the
        // signed-out page for these sessions).
        regenerateSession(request)
        setProfile(request, profile)
        auditLoginSuccess(request.logger, profile.id)

        // returnTo travelled here as a plain form field, so — exactly like
        // the real callback route — it is re-validated at read time rather
        // than trusted because it "looked safe" when the form was rendered.
        return h.redirect(safeReturnTo(payload.returnTo))
      }
    },
    {
      method: 'GET',
      path: '/auth/defra-id',
      options: { auth: false },
      async handler(request, h) {
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
    }
  ]
}

export const StubProvider = {
  name: 'stub',
  enabled,
  beginLogin,
  completeLogin,
  logoutRedirectUrl,
  extraRoutes
}
