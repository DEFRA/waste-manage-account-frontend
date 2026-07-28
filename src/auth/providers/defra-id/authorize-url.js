import { config } from '../../../config/index.js'
import { codeChallengeS256 } from '../../clients/oidc/pkce.js'

export function buildAuthorizeUrl(
  discovery,
  { state, nonce, codeVerifier, query }
) {
  const params = new URLSearchParams({
    client_id: config.defraId.clientId,
    serviceId: config.defraId.serviceId,
    response_type: 'code',
    redirect_uri: `${config.auth.callbackBaseUrl}/auth/callback`,
    // B2C convention: openid yields the id_token, offline_access a refresh
    // token, and the client ID as a scope an access token for our own API.
    scope: `openid offline_access ${config.defraId.clientId}`,
    state,
    nonce
  })

  // Omitted entirely (not sent empty) when DEFRA_ID_PKCE_ENABLED=false.
  if (codeVerifier) {
    params.set('code_challenge', codeChallengeS256(codeVerifier))
    params.set('code_challenge_method', 'S256')
  }

  // Optional org-picker passthrough (FR-1): forwarded as-is when present.
  if (query.forceReselection) {
    params.set('forceReselection', query.forceReselection)
  }
  if (query.relationshipId) {
    params.set('relationshipId', query.relationshipId)
  }

  return `${discovery.authorization_endpoint}?${params.toString()}`
}
