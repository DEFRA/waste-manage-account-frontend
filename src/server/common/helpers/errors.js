import { statusCodes } from '../constants/status-codes.js'

function statusCodeMessage(statusCode) {
  switch (statusCode) {
    case statusCodes.notFound:
      return 'Page not found'
    case statusCodes.unauthorized:
      return 'Unauthorized'
    case statusCodes.badRequest:
      return 'Bad Request'
    default:
      return 'Something went wrong'
  }
}

const forbiddenHeading = 'You do not have permission to access this page'

/**
 * A 401 never reaches here as a rendered page: the `session` cookie
 * strategy's `redirectTo` intercepts unauthenticated requests before they
 * become a Boom response, redirecting straight to sign-in instead. A 403
 * (authenticated but missing the required route `scope`) is a genuine
 * authorisation failure, so it gets the GOV.UK "you do not have permission"
 * page rather than the generic error view.
 */
export function catchAll(request, h) {
  const { response } = request

  if (!('isBoom' in response)) {
    return h.continue
  }

  const statusCode = response.output.statusCode

  if (statusCode >= statusCodes.internalServerError) {
    request.logger.error(response?.stack)
  }

  if (statusCode === statusCodes.forbidden) {
    return h
      .view('unauthorised/index', {
        pageTitle: forbiddenHeading,
        heading: forbiddenHeading,
        message: 'You do not have the necessary permissions to view this page.'
      })
      .code(statusCode)
  }

  const errorMessage = statusCodeMessage(statusCode)

  return h
    .view('error/index', {
      pageTitle: errorMessage,
      heading: statusCode,
      message: errorMessage
    })
    .code(statusCode)
}
