// H-5 open-redirect guard: returnTo is attacker-controllable (it arrives as a
// query param on /auth/login), so only same-origin relative paths may pass.
// Anything else — absolute URLs, protocol-relative '//host', backslashes
// (browsers normalise '\' to '/', turning '/\evil' into '//evil'), or control
// characters (header-splitting / log-injection vectors) — falls back.

export function safeReturnTo(path, fallback = '/') {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return fallback
  }
  if (path.startsWith('//') || path.includes('\\')) {
    return fallback
  }
  for (const char of path) {
    const code = char.codePointAt(0)
    if (code <= 0x1f || code === 0x7f) {
      return fallback
    }
  }
  return path
}
