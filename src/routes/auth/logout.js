import { logout as serviceLogout, respond } from '../../auth/service.js'

// FR-5: thin HTTP glue — session teardown, audit, and the federated vs.
// local-only redirect decision all live in service.logout.
export const logout = {
  method: 'GET',
  path: '/auth/logout',
  options: { auth: false },
  async handler(request, h) {
    const result = await serviceLogout(request)
    return respond(h, result)
  }
}

// FR-5 step 5: the terminal landing page after either a federated or
// local-only sign-out, with a way back in — public so it renders regardless
// of session state.
export const signedOut = {
  method: 'GET',
  path: '/auth/signed-out',
  options: { auth: false },
  handler(_request, h) {
    return h.view('auth/signed-out')
  }
}
