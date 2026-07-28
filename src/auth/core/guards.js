import Boom from '@hapi/boom'

import { auditAccessDenied } from './audit.js'
import { userIsRelatedToOrg } from './organisation-access.js'

// FR-4: scope/role/organisation checks happen before the handler runs, never
// inside a controller. Each guard below returns a Hapi pre-handler method
// (route `options.pre`), which the framework runs after authentication but
// before the route handler — a thrown Boom here short-circuits the request
// with a 403 and the handler never executes.

export function requireScope(scope) {
  return function requireScopeGuard(request) {
    const credentials = request.auth.credentials
    if (!credentials?.scope?.includes(scope)) {
      const reason = `missing required scope: ${scope}`
      auditAccessDenied(request.logger, { reason, userId: credentials?.id })
      throw Boom.forbidden(reason)
    }
    return true
  }
}

export function requireRole(role) {
  return function requireRoleGuard(request) {
    const credentials = request.auth.credentials
    if (!credentials?.roles?.includes(role)) {
      const reason = `missing required role: ${role}`
      auditAccessDenied(request.logger, { reason, userId: credentials?.id })
      throw Boom.forbidden(reason)
    }
    return true
  }
}

// §5.2 fail-closed organisation guard. `getOrganisationId(request)` resolves
// the Defra organisation ID to check membership against — callers are
// responsible for first mapping any internal/URL organisation ID to its
// linked Defra organisation ID before this runs (see the ID-space warning in
// organisation-access.js); this guard only compares whatever it is given
// against the credentials' relationships, and fails closed (403) when that
// ID is missing, unknown, or the user has no matching relationship at all.
export function requireOrgMembership(getOrganisationId) {
  return function requireOrgMembershipGuard(request) {
    const organisationId = getOrganisationId(request)
    const credentials = request.auth.credentials
    if (!userIsRelatedToOrg(credentials, organisationId)) {
      const reason = 'not a member of this organisation'
      auditAccessDenied(request.logger, { reason, userId: credentials?.id })
      throw Boom.forbidden(reason)
    }
    return true
  }
}
