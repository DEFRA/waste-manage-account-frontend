// Spec §6.3: the authorization_code grant is server-to-server, over TLS, with
// a request timeout and no automatic retry — an authorization code is
// single-use, so retrying a failed exchange would only ever fail again (the
// code was already consumed by the first attempt) or, worse, risk a replay.
// Non-2xx responses are terminal for the attempt; only the status code is
// logged, never the response body, since an IdP error body can echo back
// request secrets.

const DEFAULT_TIMEOUT_MS = 5000

export class TokenExchangeError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'TokenExchangeError'
  }
}

function buildRequestBody({
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
  scope
}) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  })
  // Omitted (not sent as empty) when PKCE is disabled for the target
  // environment (DEFRA_ID_PKCE_ENABLED=false) — an empty code_verifier
  // parameter is not the same as none.
  if (codeVerifier) {
    body.set('code_verifier', codeVerifier)
  }
  if (scope) {
    body.set('scope', scope)
  }
  return body
}

export async function exchangeCode({
  tokenEndpoint,
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
  scope,
  logger,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const body = buildRequestBody({
    clientId,
    clientSecret,
    code,
    redirectUri,
    codeVerifier,
    scope
  })

  let response
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    throw new TokenExchangeError('token exchange request failed', {
      cause: error
    })
  }

  if (!response.ok) {
    logger?.warn({ status: response.status }, 'token exchange failed')
    throw new TokenExchangeError(
      `token exchange failed with status ${response.status}`
    )
  }

  let payload
  try {
    payload = await response.json()
  } catch (error) {
    throw new TokenExchangeError('token exchange response was not valid JSON', {
      cause: error
    })
  }

  if (typeof payload.id_token !== 'string' || payload.id_token === '') {
    throw new TokenExchangeError('token exchange response missing id_token')
  }

  return {
    id_token: payload.id_token,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in
  }
}
