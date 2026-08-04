import crypto from 'node:crypto'

import Jwt from '@hapi/jwt'
import { vi } from 'vitest'

import { config } from '#/config/config.js'

const wellKnownDocument = {
  issuer: 'https://defra-id.example',
  authorization_endpoint: 'https://defra-id.example/authorize',
  token_endpoint: 'https://defra-id.example/token',
  jwks_uri: 'https://defra-id.example/.well-known/jwks.json',
  end_session_endpoint: 'https://defra-id.example/logout'
}

function generateRsaKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })

  return { publicKey, privateKey }
}

function toJwk(publicKeyPem, kid) {
  const jwk = crypto.createPublicKey(publicKeyPem).export({ format: 'jwk' })
  return { ...jwk, kid, use: 'sig', alg: 'RS256' }
}

function signToken(privateKeyPem, kid, payload, options = {}) {
  return Jwt.token.generate(
    payload,
    { key: privateKeyPem, algorithm: 'RS256' },
    { header: { kid }, ...options }
  )
}

function mockDiscoveryAndJwks(jwks) {
  fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
  fetch.mockResponseOnce(JSON.stringify({ keys: jwks }))
}

describe('#verifyToken', () => {
  beforeEach(() => {
    fetch.resetMocks()
    vi.resetModules()
  })

  test('Should return the decoded claims for a valid token', async () => {
    const { publicKey, privateKey } = generateRsaKeyPair()
    const kid = 'signing-key-1'
    const token = signToken(
      privateKey,
      kid,
      {
        sub: 'user-1',
        aud: config.get('defraId.clientId'),
        iss: wellKnownDocument.issuer
      },
      { ttlSec: 3600 }
    )

    mockDiscoveryAndJwks([toJwk(publicKey, kid)])
    const { verifyToken } = await import('./verify-token.js')

    await expect(verifyToken(token)).resolves.toMatchObject({ sub: 'user-1' })
    expect(fetch).toHaveBeenCalledWith(wellKnownDocument.jwks_uri)
  })

  test('Should throw when the audience does not match this service', async () => {
    const { publicKey, privateKey } = generateRsaKeyPair()
    const kid = 'signing-key-1'
    const token = signToken(
      privateKey,
      kid,
      {
        sub: 'user-1',
        aud: 'a-different-service',
        iss: wellKnownDocument.issuer
      },
      { ttlSec: 3600 }
    )

    mockDiscoveryAndJwks([toJwk(publicKey, kid)])
    const { verifyToken } = await import('./verify-token.js')

    await expect(verifyToken(token)).rejects.toThrow(
      /Token audience is not allowed/
    )
  })

  test('Should throw when the issuer does not match DEFRA ID', async () => {
    const { publicKey, privateKey } = generateRsaKeyPair()
    const kid = 'signing-key-1'
    const token = signToken(
      privateKey,
      kid,
      {
        sub: 'user-1',
        aud: config.get('defraId.clientId'),
        iss: 'https://not-defra-id.example'
      },
      { ttlSec: 3600 }
    )

    mockDiscoveryAndJwks([toJwk(publicKey, kid)])
    const { verifyToken } = await import('./verify-token.js')

    await expect(verifyToken(token)).rejects.toThrow(
      /Token payload iss value not allowed/
    )
  })

  test('Should throw when no JWKS key matches the token kid', async () => {
    const { privateKey } = generateRsaKeyPair()
    const { publicKey: otherPublicKey } = generateRsaKeyPair()
    const token = signToken(
      privateKey,
      'signing-key-1',
      { sub: 'user-1' },
      { ttlSec: 3600 }
    )

    mockDiscoveryAndJwks([toJwk(otherPublicKey, 'signing-key-2')])
    const { verifyToken } = await import('./verify-token.js')

    await expect(verifyToken(token)).rejects.toThrow(
      /No JWKS key found matching the token signing key/
    )
  })

  test('Should throw when the signature does not match the key', async () => {
    const { privateKey } = generateRsaKeyPair()
    const { publicKey: mismatchedPublicKey } = generateRsaKeyPair()
    const kid = 'signing-key-1'
    const token = signToken(
      privateKey,
      kid,
      { sub: 'user-1' },
      { ttlSec: 3600 }
    )

    mockDiscoveryAndJwks([toJwk(mismatchedPublicKey, kid)])
    const { verifyToken } = await import('./verify-token.js')

    await expect(verifyToken(token)).rejects.toThrow(/Invalid token signature/)
  })

  test('Should throw when the token has expired', async () => {
    const { publicKey, privateKey } = generateRsaKeyPair()
    const kid = 'signing-key-1'
    const nowSec = Math.floor(Date.now() / 1000)
    const token = signToken(privateKey, kid, {
      sub: 'user-1',
      exp: nowSec - 3600
    })

    mockDiscoveryAndJwks([toJwk(publicKey, kid)])
    const { verifyToken } = await import('./verify-token.js')

    await expect(verifyToken(token)).rejects.toThrow(/Token expired/)
  })

  test('Should throw when the JWKS document fetch fails', async () => {
    const { privateKey } = generateRsaKeyPair()
    const token = signToken(
      privateKey,
      'signing-key-1',
      { sub: 'user-1' },
      { ttlSec: 3600 }
    )

    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    fetch.mockResponseOnce('Internal Server Error', { status: 500 })
    const { verifyToken } = await import('./verify-token.js')

    await expect(verifyToken(token)).rejects.toThrow(
      /Failed to fetch DEFRA ID JWKS document/
    )
  })
})
