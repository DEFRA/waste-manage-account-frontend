import crypto from 'node:crypto'

// FR-1 / H-1: state, nonce and the PKCE code_verifier are all unguessable
// random tokens. RFC 7636 §4.1 requires the code_verifier to be 43-128
// unreserved chars ([A-Za-z0-9-._~]); 32 random bytes base64url-encode to
// exactly 43, which also makes a fine state/nonce value.
// Exported for reuse wherever an unguessable session-bound token is needed
// (e.g. the stub login CSRF token, H-9).
export function randomToken() {
  return crypto.randomBytes(32).toString('base64url')
}
