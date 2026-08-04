const excludedPaths = ['/health', '/favicon.ico']

function isExcludedPath(path) {
  return path.startsWith('/public') || excludedPaths.includes(path)
}

/**
 * Blocks browser back-button access to authenticated pages after sign-out by
 * marking every response `no-store`, except the platform health probe and
 * static assets (which are never authenticated and benefit from caching).
 * Registered after `catchAll` so it always sees the final rendered response,
 * not an intermediate Boom error.
 */
export function noStoreHeader(request, h) {
  if (isExcludedPath(request.path)) {
    return h.continue
  }

  request.response.header('cache-control', 'no-store')

  return h.continue
}
