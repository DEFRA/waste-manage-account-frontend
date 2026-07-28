import Boom from '@hapi/boom'

import { auditLoginSuccess } from '../../auth/core/audit.js'
import { randomToken } from '../../auth/core/random.js'
import { safeReturnTo } from '../../auth/core/return-to.js'
import {
  regenerateSession,
  setProfile,
  setStubCsrf,
  takeStubCsrf
} from '../../auth/core/session.js'
import { getStubUser, getStubUsers } from '../../auth/stub-users.js'
import { isDefraIdConfigured } from '../../config/index.js'
import { initiateRealLogin } from './login.js'

// FR-6 dev stub: the fake-user chooser. Registered (router.js) only when
// AUTH_STUB_ENABLED is true. A GOV.UK-styled form that works with no
// client-side JS — a plain radio-button POST, same as the reference project.
export const stubLogin = {
  method: 'GET',
  path: '/auth/stub/login',
  options: { auth: false },
  handler(request, h) {
    const csrfToken = randomToken()
    setStubCsrf(request, csrfToken)

    return h.view('auth/stub-login', {
      users: getStubUsers(),
      csrfToken,
      returnTo: safeReturnTo(request.query.returnTo),
      // FR-6 real-provider escape hatch: only offered when real Defra ID
      // credentials are actually configured alongside the stub.
      defraIdAvailable: isDefraIdConfigured()
    })
  }
}

// H-9: the chooser form is a state-changing POST, so it carries a CSRF
// token minted by the GET above and checked (then discarded) here.
export const stubLoginSubmit = {
  method: 'POST',
  path: '/auth/stub/login',
  options: { auth: false },
  handler(request, h) {
    const payload = request.payload ?? {}
    const expectedCsrfToken = takeStubCsrf(request)

    if (!expectedCsrfToken || payload.csrfToken !== expectedCsrfToken) {
      throw Boom.forbidden('invalid or missing CSRF token')
    }

    const user = getStubUser(payload.userId)
    if (!user) {
      throw Boom.badRequest('unknown stub user')
    }

    // Session-fixation defence (H-2), same as a real login: regenerate
    // before writing any authenticated state, and write no id_token — a
    // stub session has none to give at logout (FR-5 goes straight to the
    // signed-out page for these sessions).
    regenerateSession(request)
    setProfile(request, user.profile)
    auditLoginSuccess(request.logger, user.profile.id)

    // returnTo travelled here as a plain form field, so — exactly like the
    // real callback route — it is re-validated at read time rather than
    // trusted because it "looked safe" when the form was rendered.
    return h.redirect(safeReturnTo(payload.returnTo))
  }
}

// FR-6 real-provider escape hatch: registered (router.js) only when the
// stub is enabled AND real Defra ID credentials are also configured. Reuses
// the exact same real-flow initiation /auth/login uses when the stub is off.
export const defraId = {
  method: 'GET',
  path: '/auth/defra-id',
  options: { auth: false },
  handler: initiateRealLogin
}
