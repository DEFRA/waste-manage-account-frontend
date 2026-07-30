import Jwt from '@hapi/jwt'

import { config } from '#/config/config.js'
import { getOidcConfig } from '#/server/auth/get-oidc-config.js'

/**
 * Verifies a DEFRA ID RS256 ID token: decodes the header to find the
 * signing key's `kid`, fetches the JWKS from OIDC discovery, and selects
 * the matching key — never `keys[0]`, since DEFRA ID rotates keys and the
 * wrong key would either fail closed or, worse, verify against a key that
 * doesn't belong to this token. Returns the decoded claims, or throws.
 */
export async function verifyToken(token) {
  const artifacts = Jwt.token.decode(token)
  const { kid } = artifacts.decoded.header

  const { jwksUri } = await getOidcConfig()
  const response = await fetch(jwksUri)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch DEFRA ID JWKS document: ${response.status} ${response.statusText}`
    )
  }

  const { keys } = await response.json()
  const matchingKey = keys.find((key) => key.kid === kid)

  if (!matchingKey) {
    throw new Error('No JWKS key found matching the token signing key')
  }

  const publicKey = Jwt.crypto.rsaPublicKeyToPEM(matchingKey.n, matchingKey.e)

  Jwt.token.verify(artifacts, publicKey, {
    timeSkewSec: config.get('defraId.clockToleranceSeconds')
  })

  return artifacts.decoded.payload
}
