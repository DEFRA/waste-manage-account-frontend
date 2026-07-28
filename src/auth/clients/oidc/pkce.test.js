import crypto from 'node:crypto'

import { describe, expect, test } from 'vitest'

import { codeChallengeS256, createCodeVerifier } from './pkce.js'

describe('codeChallengeS256', () => {
  test('returns the base64url SHA-256 digest of the verifier', () => {
    const verifier = 'a'.repeat(43)
    const expected = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')

    expect(codeChallengeS256(verifier)).toBe(expected)
  })

  test('is deterministic for the same input', () => {
    const verifier = createCodeVerifier()
    expect(codeChallengeS256(verifier)).toBe(codeChallengeS256(verifier))
  })
})

describe('createCodeVerifier', () => {
  test('returns a 43-character base64url string (RFC 7636 §4.1)', () => {
    const verifier = createCodeVerifier()
    expect(verifier).toHaveLength(43)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  test('returns a different value on each call', () => {
    expect(createCodeVerifier()).not.toBe(createCodeVerifier())
  })
})
