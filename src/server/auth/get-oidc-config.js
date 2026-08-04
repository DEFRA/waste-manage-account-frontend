import { config } from '#/config/config.js'

let cachedEndpoints = null
let cachedAt = 0

/**
 * Fetches the DEFRA ID OIDC well-known discovery document and exposes only
 * the endpoints the auth flow needs, cached in memory for
 * `defraId.discoveryCacheTtlSeconds` so sign-in/sign-out don't re-fetch it
 * on every request.
 */
export async function getOidcConfig() {
  const ttlMs = config.get('defraId.discoveryCacheTtlSeconds') * 1000

  if (cachedEndpoints && Date.now() - cachedAt < ttlMs) {
    return cachedEndpoints
  }

  const discoveryUrl = config.get('defraId.discoveryUrl')
  const response = await fetch(discoveryUrl)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch DEFRA ID OIDC discovery document: ${response.status} ${response.statusText}`
    )
  }

  const document = await response.json()

  cachedEndpoints = {
    issuer: document.issuer,
    authorizationEndpoint: document.authorization_endpoint,
    tokenEndpoint: document.token_endpoint,
    jwksUri: document.jwks_uri,
    endSessionEndpoint: document.end_session_endpoint
  }
  cachedAt = Date.now()

  return cachedEndpoints
}
