import { vi } from 'vitest'

import { config } from '#/config/config.js'

const wellKnownDocument = {
  authorization_endpoint: 'https://defra-id.example/authorize',
  token_endpoint: 'https://defra-id.example/token',
  jwks_uri: 'https://defra-id.example/.well-known/jwks.json',
  end_session_endpoint: 'https://defra-id.example/logout'
}

const tokenSet = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  id_token: 'new-id-token',
  expires_in: 3600,
  token_type: 'Bearer'
}

function mockDiscoveryAndToken(tokenResponse, options = {}) {
  fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
  fetch.mockResponseOnce(JSON.stringify(tokenResponse), options)
}

describe('#refreshTokens', () => {
  beforeEach(() => {
    fetch.resetMocks()
    vi.resetModules()
  })

  test('Should POST a form-encoded body to the token endpoint with no secrets in the URL', async () => {
    mockDiscoveryAndToken(tokenSet)
    const { refreshTokens } = await import('./refresh-tokens.js')

    await refreshTokens('old-refresh-token')

    const [url, requestInit] = fetch.mock.calls[1]
    expect(url).toBe(wellKnownDocument.token_endpoint)

    const body = requestInit.body.toString()
    expect(requestInit.method).toBe('POST')
    expect(requestInit.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    )
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain(`client_id=${config.get('defraId.clientId')}`)
    expect(body).toContain('refresh_token=old-refresh-token')
    expect(body).toContain('client_secret=')
  })

  test('Should return the new token set on success', async () => {
    mockDiscoveryAndToken(tokenSet)
    const { refreshTokens } = await import('./refresh-tokens.js')

    await expect(refreshTokens('old-refresh-token')).resolves.toEqual({
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token,
      expiresIn: tokenSet.expires_in,
      tokenType: tokenSet.token_type
    })
  })

  test('Should throw when the token endpoint responds with an error', async () => {
    mockDiscoveryAndToken(
      { error: 'invalid_grant' },
      { status: 400, statusText: 'Bad Request' }
    )
    const { refreshTokens } = await import('./refresh-tokens.js')

    await expect(refreshTokens('old-refresh-token')).rejects.toThrow(
      /Failed to refresh DEFRA ID tokens/
    )
  })
})
