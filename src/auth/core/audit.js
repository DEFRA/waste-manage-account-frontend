// H-11: a structured audit trail for auth-relevant actions — login success,
// login failure (by class only), logout, and denied organisation/scope
// access — so incidents are traceable without ever writing a token, id_token,
// or raw claims payload to the logs (§6.2/§6.3 already forbid that at the
// token/verification layer; centralising the four audit events here keeps
// that guarantee in one place rather than re-derived at every call site).
// Takes a logger (request.logger) rather than a request, matching the
// existing logger-injection idiom in discovery.js/token-endpoint.js.

function emit(logger, event, fields) {
  logger?.info({ event, ...fields }, `auth audit: ${event}`)
}

export function auditLoginSuccess(logger, userId) {
  emit(logger, 'auth.login.success', { userId })
}

export function auditLoginFailure(logger, failureClass) {
  emit(logger, 'auth.login.failure', { failureClass })
}

export function auditLogout(logger, userId) {
  emit(logger, 'auth.logout', { userId })
}

export function auditAccessDenied(logger, { reason, userId }) {
  emit(logger, 'auth.access_denied', { reason, userId })
}
