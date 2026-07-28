import { parseDefraRelationships } from './relationships.js'

// Spec §5.1: assembled from verified id_token claims only — never from the
// unverified query string. userType/scope are literals for this integration
// (single user type in v1); roles default to [] because the IdP may omit it
// for a relationship with none. relationships are normalised out of Defra's
// colon-delimited wire format into structured objects (spec-003 §2.4) —
// core/organisation-access.js consumes only this structured shape.
export function buildProfile(claims) {
  return {
    id: claims.sub,
    email: claims.email,
    name: `${claims.firstName ?? ''} ${claims.lastName ?? ''}`.trim(),
    userType: 'operator',
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    contactId: claims.contactId,
    currentRelationshipId: claims.currentRelationshipId,
    relationships: parseDefraRelationships(claims),
    scope: ['operator']
  }
}
