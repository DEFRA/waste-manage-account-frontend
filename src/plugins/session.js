import Yar from '@hapi/yar'

import { config } from '../config/index.js'

const MS_PER_MINUTE = 60 * 1000

// validateConfig() requires a real SESSION_SECRET everywhere except
// NODE_ENV=test, so this fallback only ever seals throwaway in-memory
// vitest sessions (iron needs >= 32 chars regardless).
const TEST_ONLY_SECRET = 'insecure-vitest-only-session-secret'

// A Secure cookie silently drops over the plain-http localhost dev server, so
// only ENVIRONMENT=local (which vitest also runs as) goes without it (spec §7).
const isSecureCookie = config.environment !== 'local'

// __Host- pins the cookie to the exact origin: it requires Secure, Path=/ and
// no Domain, all of which hold in prod but not over local http (spec §7).
const cookieName = config.environment === 'prod' ? '__Host-session' : 'session'

// Server-side sessions via @hapi/yar on the 'session' catbox cache provisioned
// in createServer() (Redis in production, memory locally — spec §4/§7). The
// browser only ever holds an iron-sealed opaque session id.
export const session = {
  plugin: Yar,
  options: {
    name: cookieName,
    // Never spill session data into the cookie itself: 0 forces all state to
    // the server-side cache, the cookie carries just the sealed id (spec §2).
    maxCookieSize: 0,
    // Don't create server-side state (or set a cookie) for requests that
    // never write to the session — anonymous traffic stays stateless.
    storeBlank: false,
    cache: {
      cache: config.session.cache.name,
      // Idle TTL: yar re-writes the cache entry (restarting this TTL) on every
      // request that modifies the session, so the entry dies idle-TTL after
      // the last write.
      expiresIn: config.session.idleTtlMinutes * MS_PER_MINUTE
    },
    cookieOptions: {
      password: config.session.secret ?? TEST_ONLY_SECRET,
      // Absolute TTL: the cookie expiry is fixed when the cookie is issued
      // (login/regeneration) and read-only requests never re-issue it, so the
      // browser drops it absolute-TTL after sign-in (spec §7 idle + absolute).
      ttl: config.session.absoluteTtlMinutes * MS_PER_MINUTE,
      isSecure: isSecureCookie,
      isHttpOnly: true,
      // Lax, not Strict: the redirect back from Defra ID is a top-level
      // cross-site navigation and Strict would drop the pre-auth session,
      // breaking state validation (spec §7).
      isSameSite: 'Lax',
      path: '/',
      // A tampered or unsealable cookie means "no session", never a 400.
      clearInvalid: true,
      ignoreErrors: true
    }
  }
}
