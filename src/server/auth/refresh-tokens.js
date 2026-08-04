import { config } from '#/config/config.js'
import { getOidcConfig } from '#/server/auth/get-oidc-config.js'

/**
 * Exchanges a refresh token for a new DEFRA ID token set. Credentials and
 * the refresh token are sent in a form-encoded POST body, never the query
 * string, so they can't leak into access/proxy logs. Returns the new token
 * set, or throws.
 */
export async function refreshTokens(refreshToken) {
  const { tokenEndpoint } = await getOidcConfig()

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.get('defraId.clientId'),
    client_secret: config.get('defraId.clientSecret'),
    refresh_token: refreshToken
  })

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!response.ok) {
    throw new Error(
      `Failed to refresh DEFRA ID tokens: ${response.status} ${response.statusText}`
    )
  }

  const tokenSet = await response.json()

  return {
    accessToken: tokenSet.access_token,
    refreshToken: tokenSet.refresh_token,
    idToken: tokenSet.id_token,
    expiresIn: tokenSet.expires_in,
    tokenType: tokenSet.token_type
  }
}
