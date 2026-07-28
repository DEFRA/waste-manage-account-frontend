// The exact sequence every successful login must perform before a redirect
// is decided, regardless of which provider produced the profile (spec §2.3,
// §6 invariant 5) — a provider-agnostic primitive in core/ so both the
// service layer (real-provider callback) and a provider needing a
// same-request completion (stub's chooser POST, which has no separate
// begin/complete round trip to hang this off) can call the one copy without
// either importing the other (providers may not import service, spec §2.1).
import { auditLoginSuccess } from './audit.js'
import { regenerateSession, setIdToken, setProfile } from './session.js'

// Session-fixation defence (spec §7, H-2): regenerate before writing any
// authenticated state into the session. idToken is omitted for sessions that
// never have one (the stub) rather than written as undefined.
export function completeAuthentication(request, { profile, idToken } = {}) {
  regenerateSession(request)
  setProfile(request, profile)
  if (idToken !== undefined) {
    setIdToken(request, idToken)
  }
  auditLoginSuccess(request.logger, profile.id)
}
