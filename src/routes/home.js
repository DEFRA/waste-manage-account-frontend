import {
  getCurrentRelationship,
  getUserRelationships
} from '../auth/core/organisation-access.js'

// FR1: the Hello World page is rendered entirely server-side so it works
// without client-side JavaScript (progressive enhancement).
// The route is protected by the default 'session' auth strategy (FR-3), so
// request.auth.credentials is always the verified spec §5 profile here — the
// page also doubles as the "protected home content" showing it back to the
// user, per spec §11.3 (home page shows verified claims, parsed
// relationships and current organisation).
export const home = {
  method: 'GET',
  path: '/',
  handler(request, h) {
    const user = request.auth.credentials

    return h.view('home', {
      isAuthenticated: true,
      user,
      relationships: getUserRelationships(user),
      currentOrganisation: getCurrentRelationship(user)
    })
  }
}
