import { afterEach, describe, expect, test, vi } from 'vitest'

function fakeH() {
  return {
    authenticated: vi.fn((result) => ({ authenticated: true, ...result }))
  }
}

// config and getProfile/getTestUser are all read/created at import time, so
// each scenario needs a fresh module graph (same idiom as auth.test.js's
// createNonTestServer/importSessionFromEnv helpers).
async function importFresh(envOverrides = {}) {
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  return import('./scheme.js')
}

describe('sessionAuthScheme (extracted from plugins/auth.js)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('NODE_ENV=test: auto-authenticates the default canned user, ignoring the session', async () => {
    const { sessionAuthScheme } = await importFresh()
    const h = fakeH()
    const request = { headers: {}, yar: { get: vi.fn() } }

    sessionAuthScheme().authenticate(request, h)

    expect(request.yar.get).not.toHaveBeenCalled()
    expect(h.authenticated).toHaveBeenCalledTimes(1)
    const [{ credentials }] = h.authenticated.mock.calls[0]
    expect(credentials.id).toBe('test-operator')
  })

  test('NODE_ENV=test: x-test-user-type header selects a different canned user', async () => {
    const { sessionAuthScheme } = await importFresh()
    const h = fakeH()
    const request = {
      headers: { 'x-test-user-type': 'multi-org-operator' },
      yar: { get: vi.fn() }
    }

    sessionAuthScheme().authenticate(request, h)

    const [{ credentials }] = h.authenticated.mock.calls[0]
    expect(credentials.id).toBe('test-multi-org-operator')
  })

  test('outside NODE_ENV=test: throws 401 when the session has no profile', async () => {
    const { sessionAuthScheme } = await importFresh({
      NODE_ENV: 'production',
      SESSION_SECRET: 'x'.repeat(32)
    })
    const h = fakeH()
    const request = { headers: {}, yar: { get: vi.fn(() => undefined) } }

    expect(() => sessionAuthScheme().authenticate(request, h)).toThrow(
      /unauthorized/i
    )
  })

  test('outside NODE_ENV=test: authenticates from the stored session profile', async () => {
    const { sessionAuthScheme } = await importFresh({
      NODE_ENV: 'production',
      SESSION_SECRET: 'x'.repeat(32)
    })
    const profile = { id: 'real-user', name: 'Real User' }
    const h = fakeH()
    const request = { headers: {}, yar: { get: vi.fn(() => profile) } }

    sessionAuthScheme().authenticate(request, h)

    expect(h.authenticated).toHaveBeenCalledWith({ credentials: profile })
  })
})
