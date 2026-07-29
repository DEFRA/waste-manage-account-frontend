import { config } from '../config/index.js'

// Spec §6.1 / H-3: only the discovery URL is configured — every endpoint the
// auth flow uses is read from the .well-known document, so an environment
// switch (CPDEV → CPTEST → prod) is a one-variable change. The cache is keyed
// by URL (a single global copy is a latent bug if the URL ever changes at
// runtime or between tests) and expires after a TTL so a long-lived process
// survives a B2C endpoint migration. When a refresh fails the stale copy
// keeps serving with a warning — rarely-rotating endpoints beat a hard
// sign-in outage — but a cold-cache failure has nothing to fall back to and
// throws DiscoveryError, which callers surface as a friendly "sign-in
// unavailable" page (502-class). Never fall back to hard-coded endpoints.

// H-10: a hung IdP must not hold login requests open indefinitely.
const DEFAULT_TIMEOUT_MS = 5000

// end_session_endpoint is deliberately not required: the logout route falls
// back to a local-only sign-out when the provider omits it.
const REQUIRED_FIELDS = [
  'authorization_endpoint',
  'token_endpoint',
  'jwks_uri',
  'issuer'
]

const cache = new Map()

export class DiscoveryError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'DiscoveryError'
  }
}

export async function getDiscovery(
  url,
  {
    logger,
    ttlSeconds = config.defraId.discoveryCacheTtlSeconds,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = {}
) {
  const cached = cache.get(url)
  if (cached && Date.now() - cached.fetchedAt < ttlSeconds * 1000) {
    return cached.document
  }

  try {
    const document = await fetchDiscoveryDocument(url, timeoutMs)
    cache.set(url, { document, fetchedAt: Date.now() })
    return document
  } catch (error) {
    if (cached) {
      // fetchedAt is intentionally left untouched: every subsequent call
      // retries the refresh until one succeeds, serving stale meanwhile.
      logger?.warn(
        { err: error, discoveryUrl: url },
        'OIDC discovery refresh failed; serving stale endpoints'
      )
      return cached.document
    }
    throw new DiscoveryError(`OIDC discovery failed for ${url}`, {
      cause: error
    })
  }
}

async function fetchDiscoveryDocument(url, timeoutMs) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) {
    throw new Error(
      `discovery endpoint responded with status ${response.status}`
    )
  }

  const body = await response.json()
  const missing = REQUIRED_FIELDS.filter(
    (field) => typeof body[field] !== 'string' || body[field] === ''
  )
  if (missing.length > 0) {
    throw new Error(
      `discovery document is missing required field(s): ${missing.join(', ')}`
    )
  }

  // Only the fields the flow consumes; the rest of the document is dropped.
  return {
    authorization_endpoint: body.authorization_endpoint,
    token_endpoint: body.token_endpoint,
    end_session_endpoint: body.end_session_endpoint,
    jwks_uri: body.jwks_uri,
    issuer: body.issuer
  }
}

// Test-only: the module-level cache would otherwise leak entries (and their
// fetchedAt clocks) across test cases.
export function clearDiscoveryCache() {
  cache.clear()
}
