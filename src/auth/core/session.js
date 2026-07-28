// Thin wrappers around request.yar so routes and the auth scheme share one
// vocabulary for what lives in the session (spec §7) instead of scattering
// string keys across the codebase.

// Verified user profile (spec §5 shape), written once at login.
const PROFILE_KEY = 'profile'

// Pre-auth values (state, nonce, code_verifier, returnTo) written by
// /auth/login and consumed exactly once by /auth/callback.
const PRE_AUTH_KEY = 'preAuth'

// Raw id_token from a real login, kept only as the logout id_token_hint
// (spec §6.4 Option A) — never exposed via getProfile()/credentials.
const ID_TOKEN_KEY = 'idToken'

// CSRF token for the stub login POST (H-9), written by GET /auth/stub/login
// and consumed exactly once by the POST handler — same single-use shape as
// PRE_AUTH_KEY, for the same replay-safety reason.
const STUB_CSRF_KEY = 'stubCsrf'

export function getProfile(request) {
  return request.yar.get(PROFILE_KEY)
}

export function setProfile(request, profile) {
  request.yar.set(PROFILE_KEY, profile)
}

export function clearProfile(request) {
  request.yar.clear(PROFILE_KEY)
}

export function getIdToken(request) {
  return request.yar.get(ID_TOKEN_KEY)
}

export function setIdToken(request, idToken) {
  request.yar.set(ID_TOKEN_KEY, idToken)
}

export function setPreAuth(request, values) {
  request.yar.set(PRE_AUTH_KEY, values)
}

// Single-use by design (spec §7): cleared on first read so a replayed
// callback finds no state/nonce/code_verifier and fails closed.
export function takePreAuth(request) {
  return request.yar.get(PRE_AUTH_KEY, true)
}

// Session-fixation defence (spec §7, H-2): yar.reset() drops the server-side
// entry for the old id and issues a fresh id, so a session id handed out
// before authentication never survives across the login boundary. Call at
// every auth boundary (login success and logout).
export function regenerateSession(request) {
  request.yar.reset()
}

export function setStubCsrf(request, token) {
  request.yar.set(STUB_CSRF_KEY, token)
}

// Single-use (H-9): cleared on first read so a replayed POST — or one that
// reuses a token scraped from an old page load — always finds nothing stored.
export function takeStubCsrf(request) {
  return request.yar.get(STUB_CSRF_KEY, true)
}
