import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  TokenVerificationError,
  clearJwksCache,
  verifyIdToken
} from './verify-token.js'

// Fetch-stubbing standard for this codebase (see discovery.test.js):
// vi.stubGlobal('fetch') with per-call Response objects.

const JWKS_URI = 'https://idp.example/jwks'
const ISSUER = 'https://idp.example/tenant/'
const AUDIENCE = 'client-123'
const NONCE = 'stored-nonce'
const KID = 'test-key'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

async function stubJwks(publicKey, { kid = KID } = {}) {
  const jwk = await exportJWK(publicKey)
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      jsonResponse({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] })
    )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function signToken(
  privateKey,
  {
    claims = {},
    issuer = ISSUER,
    audience = AUDIENCE,
    expiresAt = Math.floor(Date.now() / 1000) + 300,
    includeIat = true,
    kid = KID
  } = {}
) {
  let jwt = new SignJWT({ sub: 'user-1', nonce: NONCE, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresAt)
  if (includeIat) {
    jwt = jwt.setIssuedAt()
  }
  return jwt.sign(privateKey)
}

describe('verifyIdToken', () => {
  let keyPair

  beforeEach(async () => {
    clearJwksCache()
    keyPair = await generateKeyPair('RS256')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('accepts a validly signed token and returns its claims', async () => {
    await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey)

    const payload = await verifyIdToken(idToken, {
      jwksUri: JWKS_URI,
      issuer: ISSUER,
      audience: AUDIENCE,
      nonce: NONCE
    })

    expect(payload).toMatchObject({
      sub: 'user-1',
      nonce: NONCE,
      iss: ISSUER,
      aud: AUDIENCE
    })
    expect(typeof payload.iat).toBe('number')
  })

  test('reuses the remote JWKS across calls for the same jwks_uri', async () => {
    const fetchMock = await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey)
    const verify = () =>
      verifyIdToken(idToken, {
        jwksUri: JWKS_URI,
        issuer: ISSUER,
        audience: AUDIENCE,
        nonce: NONCE
      })

    await verify()
    await verify()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejects a token signed by a different key than the JWKS advertises', async () => {
    const otherKeyPair = await generateKeyPair('RS256')
    await stubJwks(keyPair.publicKey)
    const idToken = await signToken(otherKeyPair.privateKey)

    const failure = await verifyIdToken(idToken, {
      jwksUri: JWKS_URI,
      issuer: ISSUER,
      audience: AUDIENCE,
      nonce: NONCE
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenVerificationError)
    expect(failure.cause).toBeDefined()
  })

  test('rejects a token with the wrong issuer', async () => {
    await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey, {
      issuer: 'https://wrong-idp.example/tenant/'
    })

    await expect(
      verifyIdToken(idToken, {
        jwksUri: JWKS_URI,
        issuer: ISSUER,
        audience: AUDIENCE,
        nonce: NONCE
      })
    ).rejects.toBeInstanceOf(TokenVerificationError)
  })

  test('rejects a token with the wrong audience', async () => {
    await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey, {
      audience: 'wrong-client'
    })

    await expect(
      verifyIdToken(idToken, {
        jwksUri: JWKS_URI,
        issuer: ISSUER,
        audience: AUDIENCE,
        nonce: NONCE
      })
    ).rejects.toBeInstanceOf(TokenVerificationError)
  })

  test('rejects an expired token', async () => {
    await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey, {
      expiresAt: Math.floor(Date.now() / 1000) - 60
    })

    await expect(
      verifyIdToken(idToken, {
        jwksUri: JWKS_URI,
        issuer: ISSUER,
        audience: AUDIENCE,
        nonce: NONCE
      })
    ).rejects.toBeInstanceOf(TokenVerificationError)
  })

  test('rejects a token missing the iat claim', async () => {
    await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey, { includeIat: false })

    const failure = await verifyIdToken(idToken, {
      jwksUri: JWKS_URI,
      issuer: ISSUER,
      audience: AUDIENCE,
      nonce: NONCE
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenVerificationError)
    expect(failure.message).toContain('iat')
  })

  test('rejects a token whose nonce does not match the stored value', async () => {
    await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey, {
      claims: { nonce: 'a-different-nonce' }
    })

    const failure = await verifyIdToken(idToken, {
      jwksUri: JWKS_URI,
      issuer: ISSUER,
      audience: AUDIENCE,
      nonce: NONCE
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenVerificationError)
    expect(failure.message).toContain('nonce')
  })

  test('rejects when there is no stored nonce to compare against', async () => {
    const fetchMock = await stubJwks(keyPair.publicKey)
    const idToken = await signToken(keyPair.privateKey)

    const failure = await verifyIdToken(idToken, {
      jwksUri: JWKS_URI,
      issuer: ISSUER,
      audience: AUDIENCE,
      nonce: undefined
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenVerificationError)
    expect(failure.message).toContain('nonce')
    // Absence of a stored nonce is checked before any JWKS fetch is made.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
