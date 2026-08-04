import { config } from '#/config/config.js'
import { getOidcConfig } from '#/server/auth/get-oidc-config.js'
import { createState } from '#/server/auth/state.js'

/**
 * Builds the DEFRA ID `end_session_endpoint` URL for the hand-rolled
 * sign-out flow (bell only covers sign-in). Includes the id token so DEFRA
 * ID knows which session to end, where to send the browser back to, and a
 * yar-backed state value so `/auth/sign-out-oidc` can detect tampering.
 */
export async function getSignOutUrl(request, idToken) {
  const { endSessionEndpoint } = await getOidcConfig()
  const state = createState(request)

  const url = new URL(endSessionEndpoint)
  url.searchParams.set('id_token_hint', idToken)
  url.searchParams.set(
    'post_logout_redirect_uri',
    `${config.get('defraId.callbackBaseUrl')}/auth/sign-out-oidc`
  )
  url.searchParams.set('state', state)

  return url.toString()
}
