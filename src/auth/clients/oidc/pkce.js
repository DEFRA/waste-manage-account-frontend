import crypto from 'node:crypto'

import { randomToken } from '../../core/random.js'

// RFC 7636 §4.2: the S256 code_challenge is the base64url-encoded SHA-256
// digest of the code_verifier — sent at /auth/login, checked by the IdP
// against the code_verifier presented back at the token endpoint.
export function codeChallengeS256(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

// The PKCE code_verifier has the same shape (43-128 unreserved chars) as the
// state/nonce tokens core/random.js already produces, so it reuses that.
export function createCodeVerifier() {
  return randomToken()
}
