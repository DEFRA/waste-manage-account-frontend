import Jwt from '@hapi/jwt'

import { config } from '#/config/config.js'
import { getOidcConfig } from '#/server/auth/get-oidc-config.js'

/**
 * Verifies a DEFRA ID RS256 ID token: decodes the header to find the
 * signing key's `kid`, fetches the JWKS from OIDC discovery, and selects
 * the matching key — never `keys[0]`, since DEFRA ID rotates keys and the
 * wrong key would either fail closed or, worse, verify against a key that
 * doesn't belong to this token. Also binds the token to this service via
 * `aud`/`iss` (OIDC core §3.1.3.7) — DEFRA ID's shared SSO policy means the
 * same issuer signs tokens for other client services too, so signature
 * validity alone isn't enough to prove a token was minted for us. Returns
 * the decoded claims, or throws.
 */
export async function verifyToken(token) {
  const artifacts = Jwt.token.decode(token)
  const { kid } = artifacts.decoded.header

  const oidcConfig = await getOidcConfig()
  const response = await fetch(oidcConfig.jwksUri)

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
    timeSkewSec: config.get('defraId.clockToleranceSeconds'),
    aud: config.get('defraId.clientId'),
    iss: oidcConfig.issuer
  })

  return artifacts.decoded.payload
}
