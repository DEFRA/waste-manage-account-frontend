// FR3: unknown routes and unhandled failures must render GOV.UK-styled
// error pages instead of Hapi's default JSON Boom payloads.
function statusCodeMessage(statusCode) {
  switch (statusCode) {
    case 400:
      return 'Bad request'
    case 401:
      return 'Unauthorized'
    case 403:
      return 'Forbidden'
    case 404:
      return 'Page not found'
    default:
      return 'Something went wrong'
  }
}

// A missing/unrecognised Accept header is treated as browser traffic (real
// browsers always send one; its absence in a test/inject is the common case
// we want to redirect too) — only an explicit non-HTML preference (e.g. an
// API client sending `Accept: application/json`) gets the plain 401 page.
function prefersHtml(request) {
  const accept = request.headers.accept
  return !accept || accept.includes('html')
}

export const errorPages = {
  plugin: {
    name: 'error-pages',
    register(server) {
      server.ext('onPreResponse', (request, h) => {
        const { response } = request

        if (!response.isBoom) {
          return h.continue
        }

        const { statusCode } = response.output

        if (statusCode >= 500) {
          request.logger.error(response.stack ?? response)
        }

        // FR-3: an unauthenticated browser request bounces to sign-in with
        // the originally requested path preserved as returnTo, rather than
        // showing a bare 401 page.
        if (statusCode === 401 && prefersHtml(request)) {
          const returnTo = encodeURIComponent(
            request.url.pathname + request.url.search
          )
          return h.redirect(`/auth/login?returnTo=${returnTo}`)
        }

        return h
          .view('error', {
            pageTitle: statusCodeMessage(statusCode),
            heading: statusCode,
            message: statusCodeMessage(statusCode)
          })
          .code(statusCode)
      })
    }
  }
}
