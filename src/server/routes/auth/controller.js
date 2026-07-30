import { randomUUID } from 'node:crypto'

import { getPermissions } from '#/server/auth/get-permissions.js'
import { verifyToken } from '#/server/auth/verify-token.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const defaultLandingPath = '/'

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
          heading: 'You could not be signed in'
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
