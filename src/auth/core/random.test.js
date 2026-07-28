import { describe, expect, test } from 'vitest'

import { randomToken } from './random.js'

describe('randomToken', () => {
  test('returns a 43-character base64url string (RFC 7636 §4.1 code_verifier length)', () => {
    const token = randomToken()
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  test('returns a different value on each call', () => {
    expect(randomToken()).not.toBe(randomToken())
  })
})
