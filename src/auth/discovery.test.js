import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  DiscoveryError,
  clearDiscoveryCache,
  getDiscovery
} from './discovery.js'

// Outbound-fetch stubbing standard for this codebase: vi.stubGlobal('fetch')
// with per-call Response objects (a Response body is single-use, so every
// mocked call must build a fresh one). Later auth items (token endpoint,
// JWKS) reuse this approach.

const DISCOVERY_URL = 'https://idp.example/.well-known/openid-configuration'
const OTHER_URL = 'https://other-idp.example/.well-known/openid-configuration'

function discoveryDocument(overrides = {}) {
  return {
    authorization_endpoint: 'https://idp.example/authorize',
    token_endpoint: 'https://idp.example/token',
    end_session_endpoint: 'https://idp.example/logout',
    jwks_uri: 'https://idp.example/jwks',
    issuer: 'https://idp.example/tenant/',
    // Extra provider metadata the client must drop.
    response_modes_supported: ['query'],
    ...overrides
  }
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

describe('getDiscovery', () => {
  beforeEach(() => {
    clearDiscoveryCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('fetches the document and returns only the endpoint fields', async () => {
    const fetchMock = stubFetch(
      vi.fn().mockResolvedValue(jsonResponse(discoveryDocument()))
    )

    const document = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })

    expect(document).toEqual({
      authorization_endpoint: 'https://idp.example/authorize',
      token_endpoint: 'https://idp.example/token',
      end_session_endpoint: 'https://idp.example/logout',
      jwks_uri: 'https://idp.example/jwks',
      issuer: 'https://idp.example/tenant/'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // H-10: every discovery fetch carries an abort signal so a hung IdP
    // cannot hold the request open indefinitely.
    expect(fetchMock).toHaveBeenCalledWith(
      DISCOVERY_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  test('accepts a document without end_session_endpoint', async () => {
    stubFetch(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(discoveryDocument({ end_session_endpoint: undefined }))
        )
    )

    const document = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })

    expect(document.end_session_endpoint).toBeUndefined()
    expect(document.issuer).toBe('https://idp.example/tenant/')
  })

  test('serves the cached document within the TTL without refetching', async () => {
    const fetchMock = stubFetch(
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse(discoveryDocument()))
        )
    )

    const first = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })
    vi.advanceTimersByTime(59_000)
    const second = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })

    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('caches per URL, not globally (H-3)', async () => {
    const fetchMock = stubFetch(
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(discoveryDocument()))
        .mockResolvedValueOnce(
          jsonResponse(
            discoveryDocument({ issuer: 'https://other-idp.example/tenant/' })
          )
        )
    )

    const first = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })
    const second = await getDiscovery(OTHER_URL, { ttlSeconds: 60 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.issuer).toBe('https://idp.example/tenant/')
    expect(second.issuer).toBe('https://other-idp.example/tenant/')
  })

  test('refetches after the TTL expires', async () => {
    const fetchMock = stubFetch(
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(discoveryDocument()))
        .mockResolvedValueOnce(
          jsonResponse(
            discoveryDocument({
              token_endpoint: 'https://idp.example/token-v2'
            })
          )
        )
    )

    await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })
    vi.advanceTimersByTime(61_000)
    const refreshed = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshed.token_endpoint).toBe('https://idp.example/token-v2')
  })

  test('serves the stale copy and warns when a refresh fails', async () => {
    const fetchMock = stubFetch(
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(discoveryDocument()))
        .mockRejectedValue(new Error('connection refused'))
    )
    const logger = { warn: vi.fn() }

    const first = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60, logger })
    vi.advanceTimersByTime(61_000)
    const second = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60, logger })

    expect(second).toEqual(first)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ discoveryUrl: DISCOVERY_URL }),
      expect.stringContaining('stale')
    )

    // A failed refresh must not push the expiry out: the next call retries
    // (and keeps serving stale) rather than locking the failure in for a TTL.
    const third = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60, logger })
    expect(third).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('serves the stale copy when the refresh returns a non-2xx status', async () => {
    stubFetch(
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(discoveryDocument()))
        .mockResolvedValueOnce(jsonResponse({ error: 'server_error' }, 503))
    )
    const logger = { warn: vi.fn() }

    const first = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60, logger })
    vi.advanceTimersByTime(61_000)
    const second = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60, logger })

    expect(second).toEqual(first)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  test('stale fallback works when no logger is supplied', async () => {
    stubFetch(
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(discoveryDocument()))
        .mockRejectedValueOnce(new Error('connection refused'))
    )

    const first = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })
    vi.advanceTimersByTime(61_000)

    await expect(
      getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })
    ).resolves.toEqual(first)
  })

  test('throws DiscoveryError when the cold-cache fetch fails, then recovers', async () => {
    const fetchMock = stubFetch(
      vi
        .fn()
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce(jsonResponse(discoveryDocument()))
    )

    const failure = await getDiscovery(DISCOVERY_URL, {
      ttlSeconds: 60
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(DiscoveryError)
    expect(failure.message).toContain(DISCOVERY_URL)
    expect(failure.cause.message).toBe('connection refused')

    // Failures are not cached: the next attempt fetches again and succeeds.
    const document = await getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })
    expect(document.issuer).toBe('https://idp.example/tenant/')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('throws DiscoveryError on a cold-cache non-2xx response', async () => {
    stubFetch(
      vi.fn().mockResolvedValue(jsonResponse({ error: 'not found' }, 404))
    )

    const failure = await getDiscovery(DISCOVERY_URL, {
      ttlSeconds: 60
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(DiscoveryError)
    expect(failure.cause.message).toContain('404')
  })

  test('throws DiscoveryError on a cold-cache non-JSON response', async () => {
    stubFetch(
      vi.fn().mockResolvedValue(new Response('<html>maintenance</html>'))
    )

    await expect(
      getDiscovery(DISCOVERY_URL, { ttlSeconds: 60 })
    ).rejects.toBeInstanceOf(DiscoveryError)
  })

  test('throws DiscoveryError when required fields are missing', async () => {
    stubFetch(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(discoveryDocument({ jwks_uri: undefined, issuer: '' }))
        )
    )

    const failure = await getDiscovery(DISCOVERY_URL, {
      ttlSeconds: 60
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(DiscoveryError)
    expect(failure.cause.message).toContain('jwks_uri')
    expect(failure.cause.message).toContain('issuer')
  })

  test('classifies a fetch timeout as DiscoveryError', async () => {
    stubFetch(
      vi
        .fn()
        .mockRejectedValue(
          new DOMException('The operation timed out', 'TimeoutError')
        )
    )

    const failure = await getDiscovery(DISCOVERY_URL, {
      ttlSeconds: 60
    }).catch((error) => error)

    expect(failure).toBeInstanceOf(DiscoveryError)
    expect(failure.cause.name).toBe('TimeoutError')
  })
})
