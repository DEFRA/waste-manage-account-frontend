const defaultLandingPath = '/'

/**
 * Guards against open-redirect attacks by only allowing relative,
 * single-slash paths back through post sign-in/sign-out. Anything that
 * could resolve to a different origin (protocol-relative `//`, absolute
 * URLs, backslash tricks browsers treat as `/`) falls back to a safe
 * default landing path instead.
 */
export function getSafeRedirect(redirect, defaultPath = defaultLandingPath) {
  if (typeof redirect !== 'string' || redirect.length === 0) {
    return defaultPath
  }

  if (!redirect.startsWith('/') || redirect.startsWith('//')) {
    return defaultPath
  }

  const parsed = new URL(redirect, 'http://localhost')

  if (parsed.origin !== 'http://localhost') {
    return defaultPath
  }

  return redirect
}
