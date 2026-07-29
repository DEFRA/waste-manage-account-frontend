// Spec-002 §5.2 relationships-claim helpers. Each claim entry is a
// colon-delimited string:
//
//   {relationshipId}:{organisationId}:{organisationName}[:...additional segments]
//
// The claim is untrusted-shaped data: non-string entries and entries with an
// empty core segment are skipped, and every helper fails closed (empty array /
// false / null) on missing input. Organisation names are display hints only —
// never use them for authorisation decisions.
//
// ⚠️ ID-space warning: organisation IDs in this application's own URLs or
// database are OUR internal IDs, not Defra IDs. Callers must first resolve an
// internal organisation to its linked Defra organisation ID via their own
// mapping and pass THAT here — never compare a URL/database ID directly
// against relationship data.

function parseRelationship(entry) {
  if (typeof entry !== 'string') {
    return null
  }
  const [relationshipId, organisationId, organisationName] = entry.split(':')
  if (!relationshipId || !organisationId || !organisationName) {
    return null
  }
  return { relationshipId, organisationId, organisationName }
}

function parsedRelationships(user) {
  const relationships = user?.relationships
  if (!Array.isArray(relationships)) {
    return []
  }
  return relationships.map(parseRelationship).filter(Boolean)
}

export function getUserOrganisationIds(user) {
  return parsedRelationships(user).map((rel) => rel.organisationId)
}

// Display-only: the full parsed relationship list (id, organisation id and
// name), for pages that show a user's organisations rather than gate access
// to one. Authorisation decisions must still go through userIsRelatedToOrg.
export function getUserRelationships(user) {
  return parsedRelationships(user)
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
    parsedRelationships(user).find(
      (rel) => rel.relationshipId === currentRelationshipId
    ) ?? null
  )
}
