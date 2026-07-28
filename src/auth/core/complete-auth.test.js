import { describe, expect, test, vi } from 'vitest'

import { completeAuthentication } from './complete-auth.js'

function fakeRequest() {
  return {
    logger: { warn: vi.fn(), info: vi.fn() },
    yar: { set: vi.fn(), get: vi.fn(), reset: vi.fn(), clear: vi.fn() }
  }
}

describe('completeAuthentication', () => {
  test('regenerates the session before writing the profile, then audits by profile id', () => {
    const request = fakeRequest()
    const profile = { id: 'user-1' }

    completeAuthentication(request, { profile })

    expect(request.yar.reset).toHaveBeenCalled()
    expect(request.yar.set).toHaveBeenCalledWith('profile', profile)
    expect(request.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.login.success',
        userId: 'user-1'
      }),
      expect.any(String)
    )
  })

  test('writes the id_token when provided (a real-provider login)', () => {
    const request = fakeRequest()

    completeAuthentication(request, {
      profile: { id: 'user-1' },
      idToken: 'the-id-token'
    })

    expect(request.yar.set).toHaveBeenCalledWith('idToken', 'the-id-token')
  })

  test('never writes an id_token when omitted (a stub login)', () => {
    const request = fakeRequest()

    completeAuthentication(request, { profile: { id: 'user-1' } })

    expect(request.yar.set).not.toHaveBeenCalledWith(
      'idToken',
      expect.anything()
    )
  })
})
