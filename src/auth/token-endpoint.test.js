import { afterEach, describe, expect, test, vi } from 'vitest'

import { TokenExchangeError, exchangeCode } from './token-endpoint.js'

// Outbound-fetch stubbing standard for this codebase (see discovery.test.js):
// vi.stubGlobal('fetch') with per-call Response objects.

const TOKEN_ENDPOINT = 'https://idp.example/token'

const REQUEST = {
  tokenEndpoint: TOKEN_ENDPOINT,
  clientId: 'client-123',
  clientSecret: 'client-secret',
  code: 'auth-code',
  redirectUri: 'https://app.example/auth/callback',
  codeVerifier: 'a'.repeat(43),
  scope: 'openid offline_access client-123'
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function stubFetch(fetchMock) {
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('exchangeCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('posts form-encoded body with all required parameters', async () => {
    const fetchMock = stubFetch(
      vi.fn().mockResolvedValue(jsonResponse({ id_token: 'signed-jwt' }))
    )

    await exchangeCode(REQUEST)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(TOKEN_ENDPOINT)
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({
      'content-type': 'application/x-www-form-urlencoded'
    })
    expect(options.signal).toBeInstanceOf(AbortSignal)

    const body = new URLSearchParams(options.body)
    expect(body.get('client_id')).toBe('client-123')
    expect(body.get('client_secret')).toBe('client-secret')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code')
    expect(body.get('redirect_uri')).toBe('https://app.example/auth/callback')
    expect(body.get('code_verifier')).toBe('a'.repeat(43))
    expect(body.get('scope')).toBe('openid offline_access client-123')
  })

  test('omits code_verifier and scope when not provided (PKCE disabled)', async () => {
    const fetchMock = stubFetch(
      vi.fn().mockResolvedValue(jsonResponse({ id_token: 'signed-jwt' }))
    )

    await exchangeCode({
      ...REQUEST,
      codeVerifier: undefined,
      scope: undefined
    })

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body)
    expect(body.has('code_verifier')).toBe(false)
    expect(body.has('scope')).toBe(false)
  })

  test('parses id_token, access_token, refresh_token and expires_in on success', async () => {
    stubFetch(
      vi.fn().mockResolvedValue(
        jsonResponse({
          id_token: 'signed-jwt',
          access_token: 'opaque-access-token',
          refresh_token: 'opaque-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer'
        })
      )
    )

    const result = await exchangeCode(REQUEST)

    expect(result).toEqual({
      id_token: 'signed-jwt',
      access_token: 'opaque-access-token',
      refresh_token: 'opaque-refresh-token',
      expires_in: 3600
    })
  })

  test('returns only id_token when the IdP omits refresh fields', async () => {
    stubFetch(
      vi.fn().mockResolvedValue(jsonResponse({ id_token: 'signed-jwt' }))
    )

    const result = await exchangeCode(REQUEST)

    expect(result).toEqual({
      id_token: 'signed-jwt',
      access_token: undefined,
      refresh_token: undefined,
      expires_in: undefined
    })
  })

  test('throws TokenExchangeError on a non-2xx response without retrying', async () => {
    const fetchMock = stubFetch(
      vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400))
    )

    const failure = await exchangeCode(REQUEST).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenExchangeError)
    expect(failure.message).toContain('400')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('logs only the status code on failure, never the response body', async () => {
    stubFetch(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'invalid_grant', client_secret: 'leak' }, 400)
        )
    )
    const logger = { warn: vi.fn() }

    await exchangeCode({ ...REQUEST, logger }).catch(() => {})

    expect(logger.warn).toHaveBeenCalledTimes(1)
    const [meta, message] = logger.warn.mock.calls[0]
    expect(meta).toEqual({ status: 400 })
    expect(message).not.toContain('leak')
    expect(JSON.stringify(logger.warn.mock.calls[0])).not.toContain('leak')
  })

  test('throws TokenExchangeError when the response body is not valid JSON', async () => {
    stubFetch(vi.fn().mockResolvedValue(new Response('<html>error</html>')))

    await expect(exchangeCode(REQUEST)).rejects.toBeInstanceOf(
      TokenExchangeError
    )
  })

  test('throws TokenExchangeError when id_token is missing from a 2xx response', async () => {
    stubFetch(
      vi.fn().mockResolvedValue(jsonResponse({ access_token: 'opaque-token' }))
    )

    const failure = await exchangeCode(REQUEST).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenExchangeError)
    expect(failure.message).toContain('id_token')
  })

  test('throws TokenExchangeError on a network failure without retrying', async () => {
    const fetchMock = stubFetch(
      vi.fn().mockRejectedValue(new Error('connection refused'))
    )

    const failure = await exchangeCode(REQUEST).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenExchangeError)
    expect(failure.cause.message).toBe('connection refused')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('classifies a fetch timeout as TokenExchangeError', async () => {
    stubFetch(
      vi
        .fn()
        .mockRejectedValue(
          new DOMException('The operation timed out', 'TimeoutError')
        )
    )

    const failure = await exchangeCode(REQUEST).catch((error) => error)

    expect(failure).toBeInstanceOf(TokenExchangeError)
    expect(failure.cause.name).toBe('TimeoutError')
  })
})
