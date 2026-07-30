import { randomUUID } from 'node:crypto'

import { getPermissions } from '#/server/auth/get-permissions.js'
import { getSignOutUrl } from '#/server/auth/get-sign-out-url.js'
import { validateState } from '#/server/auth/state.js'
import { verifyToken } from '#/server/auth/verify-token.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const defaultLandingPath = '/'
const signedOutLandingPath = '/auth/signed-out'

function buildAuthSession(credentials, claims) {
  return {
    createdAt: Date.now(),
    expiresAt: Date.now() + credentials.expiresIn * 1000,
    accessToken: credentials.token,
    refreshToken: credentials.refreshToken,
    idToken: credentials.idToken,
    scope: getPermissions(claims),
    profile: credentials.profile
  }
}

/**
 * Bell (strategy `defra-id`) intercepts this route before the handler ever
 * runs: an unauthenticated request is redirected straight to the DEFRA ID
 * authorize endpoint via `getBellOptions().location()`. The handler only
 * executes once bell has already completed the code exchange.
 */
export const signInController = {
  options: { auth: 'defra-id' },
  handler(_request, h) {
    return h.redirect(defaultLandingPath)
  }
}

/**
 * `mode: 'try'` lets a failed bell exchange (denied consent, state
 * mismatch, provider error) reach the handler as an unauthenticated
 * request instead of a raw 401 Boom error, so it can render a GOV.UK
 * styled page rather than the generic error view.
 */
export const signInOidcController = {
  options: { auth: { strategy: 'defra-id', mode: 'try' } },
  async handler(request, h) {
    if (!request.auth.isAuthenticated) {
      return h
        .view('unauthorised/index', {
          pageTitle: 'You could not be signed in',
          heading: 'You could not be signed in',
          message: 'You have not been signed in. Please try signing in again.'
        })
        .code(statusCodes.unauthorized)
    }

    const { credentials } = request.auth
    const claims = await verifyToken(credentials.idToken)
    const sessionId = claims.sessionId ?? randomUUID()

    await request.server.app.cache.set(
      sessionId,
      buildAuthSession(credentials, claims)
    )
    request.cookieAuth.set({ sessionId })

    return h.redirect(request.yar.get('redirect', true) ?? defaultLandingPath)
  }
}

/**
 * `mode: 'try'` so this route works whether or not the session cookie is
 * still valid (an idle-expired or already-refreshed-away session should
 * still be able to trigger a sign-out). When a session is present its
 * cache entry is dropped (to fetch the `idToken` DEFRA ID needs, since the
 * cookie strategy's credentials only carry `sessionId`/`scope`/`profile`)
 * before the cookie itself is cleared, so a request that fails partway
 * through never leaves an orphaned cache entry outliving the cookie.
 */
export const signOutController = {
  options: { auth: { strategy: 'session', mode: 'try' } },
  async handler(request, h) {
    let idToken

    if (request.auth.isAuthenticated) {
      const { sessionId } = request.auth.credentials
      const authSession = await request.server.app.cache.get(sessionId)
      idToken = authSession?.idToken
      await request.server.app.cache.drop(sessionId)
    }

    request.cookieAuth.clear()

    return h.redirect(await getSignOutUrl(request, idToken))
  }
}

/**
 * DEFRA ID's callback after it has ended its own session. `mode: 'try'`
 * plus a fail-safe cache/cookie clear regardless of the `validateState`
 * result: a tampered or missing state must never block a user from
 * completing sign-out, it only means the state check couldn't confirm
 * this redirect originated from our own `/auth/sign-out` request.
 */
export const signOutOidcController = {
  options: { auth: { strategy: 'session', mode: 'try' } },
  async handler(request, h) {
    validateState(request, request.query.state)

    if (request.auth.isAuthenticated) {
      await request.server.app.cache.drop(request.auth.credentials.sessionId)
    }

    request.cookieAuth.clear()

    return h.redirect(signedOutLandingPath)
  }
}

/**
 * Public confirmation page landed on after a completed sign-out, instead of
 * bouncing straight back through `/` (which requires the `'user'` scope and
 * would otherwise redirect an already-signed-out user straight to
 * `/auth/sign-in`, giving no indication that sign-out actually succeeded).
 */
export const signedOutController = {
  options: { auth: { mode: 'try' } },
  handler(_request, h) {
    return h.view('signed-out/index', {
      pageTitle: 'You have signed out',
      heading: 'You have signed out'
    })
  }
}
