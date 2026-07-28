import { describe, expect, test, vi } from 'vitest'

import {
  auditAccessDenied,
  auditLoginFailure,
  auditLoginSuccess,
  auditLogout
} from './audit.js'

// H-11: each event must carry an `event` name and a userId where known, and
// must never carry a token/id_token/claims payload — the failure-class event
// in particular only ever receives a short label, never the error/claims
// that produced it (that detail is still available via the existing
// logger.warn call at each call site).
describe('audit (H-11)', () => {
  test('auditLoginSuccess logs the event and userId only', () => {
    const logger = { info: vi.fn() }

    auditLoginSuccess(logger, 'user-1')

    expect(logger.info).toHaveBeenCalledTimes(1)
    const [fields, message] = logger.info.mock.calls[0]
    expect(fields).toStrictEqual({
      event: 'auth.login.success',
      userId: 'user-1'
    })
    expect(message).toContain('auth.login.success')
  })

  test('auditLoginFailure logs the event and failure class only', () => {
    const logger = { info: vi.fn() }

    auditLoginFailure(logger, 'state_mismatch')

    expect(logger.info).toHaveBeenCalledTimes(1)
    const [fields] = logger.info.mock.calls[0]
    expect(fields).toStrictEqual({
      event: 'auth.login.failure',
      failureClass: 'state_mismatch'
    })
    expect(JSON.stringify(fields)).not.toMatch(/token|claim/i)
  })

  test('auditLogout logs the event and userId only', () => {
    const logger = { info: vi.fn() }

    auditLogout(logger, 'user-1')

    expect(logger.info).toHaveBeenCalledTimes(1)
    const [fields] = logger.info.mock.calls[0]
    expect(fields).toStrictEqual({ event: 'auth.logout', userId: 'user-1' })
  })

  test('auditLogout tolerates an unknown userId (e.g. already-expired session)', () => {
    const logger = { info: vi.fn() }

    auditLogout(logger, undefined)

    expect(logger.info).toHaveBeenCalledTimes(1)
    const [fields] = logger.info.mock.calls[0]
    expect(fields).toStrictEqual({ event: 'auth.logout', userId: undefined })
  })

  test('auditAccessDenied logs the event, reason and userId only', () => {
    const logger = { info: vi.fn() }

    auditAccessDenied(logger, {
      reason: 'missing required scope: admin',
      userId: 'user-1'
    })

    expect(logger.info).toHaveBeenCalledTimes(1)
    const [fields] = logger.info.mock.calls[0]
    expect(fields).toStrictEqual({
      event: 'auth.access_denied',
      reason: 'missing required scope: admin',
      userId: 'user-1'
    })
  })

  test('every audit call is a no-op (never throws) when no logger is supplied', () => {
    expect(() => auditLoginSuccess(undefined, 'user-1')).not.toThrow()
    expect(() => auditLoginFailure(undefined, 'state_mismatch')).not.toThrow()
    expect(() => auditLogout(undefined, 'user-1')).not.toThrow()
    expect(() =>
      auditAccessDenied(undefined, { reason: 'x', userId: 'user-1' })
    ).not.toThrow()
  })
})
