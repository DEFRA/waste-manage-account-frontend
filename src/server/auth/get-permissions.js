const BASELINE_SCOPE = 'user'

function toArray(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(',')
  }

  return []
}

function toScopeValue(entry) {
  return typeof entry === 'string' ? entry.trim() : ''
}

/**
 * Maps a DEFRA ID token's `roles`/`relationships` claims to a hapi `scope`
 * array, always including a baseline `'user'` scope. This is a single,
 * replaceable seam — there is no backend permissions lookup
 * lookup — so the mapping stays tolerant of absent or malformed claims
 * rather than throwing, and the exact claim shape can be corrected once
 * confirmed against a stub token. Never log the input claims (PII rule).
 */
export function getPermissions(claims) {
  const roles = toArray(claims?.roles)
  const relationships = toArray(claims?.relationships)

  const scope = new Set([BASELINE_SCOPE])

  for (const entry of [...roles, ...relationships]) {
    const value = toScopeValue(entry)
    if (value) {
      scope.add(value)
    }
  }

  return [...scope]
}
