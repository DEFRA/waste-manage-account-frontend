// Defra ID's `relationships` claim is provider-specific wire format: each
// entry is a colon-delimited string
//
//   {relationshipId}:{organisationId}:{organisationName}[:...additional segments]
//
// This is untrusted-shaped data straight off the id_token — non-string
// entries and entries with an empty core segment are skipped. The parsed
// result feeds `auth/core/organisation-access.js`, which is provider-neutral
// and must never see the colon format (spec-003 §2.4).

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

export function parseDefraRelationships(claims) {
  const relationships = claims?.relationships
  if (!Array.isArray(relationships)) {
    return []
  }
  return relationships.map(parseRelationship).filter(Boolean)
}
