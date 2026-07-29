import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  clearProfile,
  getProfile,
  regenerateSession,
  setPreAuth,
  setProfile,
  takePreAuth
} from '../auth/session.js'
import { createServer } from '../server.js'

const PROFILE = {
  id: 'user-1',
  email: 'user-1@example.test',
  name: 'Test User'
}

// Temporary routes exercising the session helpers, so the tests drive the
// full cookie → catbox round trip the way real auth routes will.
async function createServerWithSessionRoutes() {
  const server = await createServer()

  server.route([
    {
      method: 'GET',
      path: '/test-session/profile/set',
      handler: (request) => {
        setProfile(request, PROFILE)
        return { sessionId: request.yar.id }
      }
    },
    {
      method: 'GET',
      path: '/test-session/profile/get',
      handler: (request) => ({ profile: getProfile(request) })
    },
    {
      method: 'GET',
      path: '/test-session/profile/clear',
      handler: (request) => {
        clearProfile(request)
        return { profile: getProfile(request) }
      }
    },
    {
      method: 'GET',
      path: '/test-session/pre-auth/set',
      handler: (request) => {
        setPreAuth(request, { state: 'state-123', nonce: 'nonce-456' })
        return {}
      }
    },
    {
      method: 'GET',
      path: '/test-session/pre-auth/take',
      handler: (request) => ({ taken: takePreAuth(request) })
    },
    {
      method: 'GET',
      path: '/test-session/regenerate',
      handler: (request) => {
        const before = request.yar.id
        regenerateSession(request)
        return { before, after: request.yar.id }
      }
    }
  ])

  // Cache clients (catbox) only start on initialize
  await server.initialize()
  return server
}

// The whole Set-Cookie header (flags included) for the session cookie
function sessionSetCookie(res) {
  const header = res.headers['set-cookie'] ?? []
  return header.find((cookie) => cookie.startsWith('session='))
}

// Just the name=value pair, for replaying on a follow-up request
function sessionCookie(res) {
  return sessionSetCookie(res)?.split(';')[0]
}

describe('session plugin', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
  })

  test('stores a profile then reads it back on a later request via the cookie', async () => {
    server = await createServerWithSessionRoutes()

    const setRes = await server.inject('/test-session/profile/set')
    expect(setRes.statusCode).toBe(200)
    const cookie = sessionCookie(setRes)
    expect(cookie).toBeDefined()

    const getRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie }
    })
    expect(getRes.result.profile).toStrictEqual(PROFILE)
  })

  test('session cookie is HttpOnly, SameSite=Lax, Path=/ and opaque', async () => {
    server = await createServerWithSessionRoutes()

    const res = await server.inject('/test-session/profile/set')
    const setCookie = sessionSetCookie(res)

    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    // maxCookieSize: 0 — the profile lives server-side, never in the cookie
    expect(setCookie).not.toContain(PROFILE.email)
  })

  test('does not set a cookie or create state for requests that never write', async () => {
    server = await createServerWithSessionRoutes()

    const res = await server.inject('/test-session/profile/get')

    expect(res.result.profile).toBeNull()
    expect(sessionSetCookie(res)).toBeUndefined()
  })

  test('clearProfile removes the stored profile', async () => {
    server = await createServerWithSessionRoutes()

    const setRes = await server.inject('/test-session/profile/set')
    const cookie = sessionCookie(setRes)

    const clearRes = await server.inject({
      url: '/test-session/profile/clear',
      headers: { cookie }
    })
    expect(clearRes.result.profile).toBeNull()

    const getRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie }
    })
    expect(getRes.result.profile).toBeNull()
  })

  test('takePreAuth returns the stored values exactly once (single-use)', async () => {
    server = await createServerWithSessionRoutes()

    const setRes = await server.inject('/test-session/pre-auth/set')
    const cookie = sessionCookie(setRes)

    const first = await server.inject({
      url: '/test-session/pre-auth/take',
      headers: { cookie }
    })
    expect(first.result.taken).toStrictEqual({
      state: 'state-123',
      nonce: 'nonce-456'
    })

    // A replayed callback must find nothing (spec §7)
    const second = await server.inject({
      url: '/test-session/pre-auth/take',
      headers: { cookie }
    })
    expect(second.result.taken).toBeNull()
  })

  test('regenerateSession issues a new session id (H-2 session fixation)', async () => {
    server = await createServerWithSessionRoutes()

    const setRes = await server.inject('/test-session/profile/set')
    const cookie = sessionCookie(setRes)

    const res = await server.inject({
      url: '/test-session/regenerate',
      headers: { cookie }
    })

    expect(res.result.before).toBe(setRes.result.sessionId)
    expect(res.result.after).not.toBe(res.result.before)
    // The regenerated session gets a fresh cookie for the new id
    expect(sessionCookie(res)).toBeDefined()
  })

  test('regenerateSession drops the old session state server-side', async () => {
    server = await createServerWithSessionRoutes()

    const setRes = await server.inject('/test-session/profile/set')
    const oldCookie = sessionCookie(setRes)

    await server.inject({
      url: '/test-session/regenerate',
      headers: { cookie: oldCookie }
    })

    // Replaying the pre-regeneration cookie must not resurrect the profile
    const getRes = await server.inject({
      url: '/test-session/profile/get',
      headers: { cookie: oldCookie }
    })
    expect(getRes.result.profile).toBeNull()
  })

  // config (and therefore the plugin options) is read at import time, so the
  // env-driven cases re-import with a fresh module graph, as in validate.test.js
  async function importSessionFromEnv() {
    vi.resetModules()
    const { session } = await import('./session.js')
    return session
  }

  test('uses a Secure __Host- cookie in prod', async () => {
    vi.stubEnv('ENVIRONMENT', 'prod')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32))

    const session = await importSessionFromEnv()

    expect(session.options.name).toBe('__Host-session')
    expect(session.options.cookieOptions.isSecure).toBe(true)
    // __Host- prerequisites: Path=/ and no Domain attribute
    expect(session.options.cookieOptions.path).toBe('/')
    expect(session.options.cookieOptions.domain).toBeUndefined()
    expect(session.options.cookieOptions.password).toBe('x'.repeat(32))
  })

  test('maps idle TTL to the cache and absolute TTL to the cookie', async () => {
    vi.stubEnv('SESSION_IDLE_TTL_MINUTES', '100')
    vi.stubEnv('SESSION_ABSOLUTE_TTL_MINUTES', '200')

    const session = await importSessionFromEnv()

    expect(session.options.cache.expiresIn).toBe(100 * 60 * 1000)
    expect(session.options.cookieOptions.ttl).toBe(200 * 60 * 1000)
    expect(session.options.maxCookieSize).toBe(0)
  })
})
