// Spec-002 §5.2 relationships lookups, reduced by spec-003 §2.4 to fail-closed
// lookups over already-structured relationship objects
// ({ relationshipId, organisationId, organisationName }) — parsing the wire
// format into this shape is provider-specific and lives in
// `auth/providers/defra-id/relationships.js`. Every helper still fails closed
// (empty array / false / null) on missing or malformed input, and
// organisation names remain display hints only — never use them for
// authorisation decisions.
//
// ⚠️ ID-space warning: organisation IDs in this application's own URLs or
// database are OUR internal IDs, not Defra IDs. Callers must first resolve an
// internal organisation to its linked Defra organisation ID via their own
// mapping and pass THAT here — never compare a URL/database ID directly
// against relationship data.

function isValidRelationship(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.relationshipId === 'string' &&
    entry.relationshipId !== '' &&
    typeof entry.organisationId === 'string' &&
    entry.organisationId !== '' &&
    typeof entry.organisationName === 'string' &&
    entry.organisationName !== ''
  )
}

function validRelationships(user) {
  const relationships = user?.relationships
  if (!Array.isArray(relationships)) {
    return []
  }
  return relationships.filter(isValidRelationship)
}

export function getUserOrganisationIds(user) {
  return validRelationships(user).map((rel) => rel.organisationId)
}

// Display-only: the full valid relationship list (id, organisation id and
// name), for pages that show a user's organisations rather than gate access
// to one. Authorisation decisions must still go through userIsRelatedToOrg.
export function getUserRelationships(user) {
  return validRelationships(user)
}

export function userIsRelatedToOrg(user, organisationId) {
  if (typeof organisationId !== 'string' || organisationId === '') {
    return false
  }
  return getUserOrganisationIds(user).includes(organisationId)
}

export function getCurrentRelationship(user) {
  const currentRelationshipId = user?.currentRelationshipId
  if (
    typeof currentRelationshipId !== 'string' ||
    currentRelationshipId === ''
  ) {
    return null
  }
  return (
    validRelationships(user).find(
      (rel) => rel.relationshipId === currentRelationshipId
    ) ?? null
  )
}
