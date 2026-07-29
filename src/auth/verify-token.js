import { createRemoteJWKSet, jwtVerify } from 'jose'

// Spec §6.2 / H-4: the id_token is never trusted without a full local
// verification against the provider's live JWKS. Using jose's
// createRemoteJWKSet (rather than hand-rolling a JWKS fetch) gets us
// signature-algorithm enforcement, response caching, cooldown-limited
// refetch, and refresh-on-unknown-kid for free — re-implementing any of that
// here would just reproduce jose's own hardening with more bugs.
//
// jwtVerify never falls back to decoding an unverified token, so alg=none
// and non-JWKS-matching algorithms are rejected implicitly (spec §6.2.7).

// One remote key set per jwks_uri, reused across calls so jose's built-in
// cache/cooldown apply across requests instead of refetching every time (a
// fresh createRemoteJWKSet per call would throw its cache away immediately).
const jwksSets = new Map()

export class TokenVerificationError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'TokenVerificationError'
  }
}

function getRemoteJwks(jwksUri) {
  let jwks = jwksSets.get(jwksUri)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri))
    jwksSets.set(jwksUri, jwks)
  }
  return jwks
}

export async function verifyIdToken(
  idToken,
  { jwksUri, issuer, audience, nonce, clockToleranceSeconds = 60 }
) {
  // Spec §6.2.6: the stored nonce must exist before we even look at the
  // token — an empty pre-auth session (expired/replayed callback) fails
  // closed rather than verifying a token against "no expectation".
  if (typeof nonce !== 'string' || nonce === '') {
    throw new TokenVerificationError(
      'id_token verification failed: no stored nonce to compare against'
    )
  }

  let payload
  try {
    const jwks = getRemoteJwks(jwksUri)
    ;({ payload } = await jwtVerify(idToken, jwks, {
      issuer,
      audience,
      clockTolerance: clockToleranceSeconds
    }))
  } catch (error) {
    throw new TokenVerificationError('id_token verification failed', {
      cause: error
    })
  }

  // jose only type-checks iat when present; presence itself is a spec
  // requirement (§6.2.5), so it's enforced explicitly here.
  if (typeof payload.iat !== 'number') {
    throw new TokenVerificationError(
      'id_token verification failed: missing iat claim'
    )
  }

  if (payload.nonce !== nonce) {
    throw new TokenVerificationError(
      'id_token verification failed: nonce mismatch'
    )
  }

  return payload
}

// Test-only: mirrors discovery.js's clearDiscoveryCache — the module-level
// jwks_uri -> RemoteJWKSet map would otherwise leak stubbed fetches and
// cooldown state across test cases.
export function clearJwksCache() {
  jwksSets.clear()
}
