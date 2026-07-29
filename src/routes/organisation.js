import { requireOrgMembership } from '../auth/guards.js'
import { getUserOrganisationIds } from '../auth/organisation-access.js'

// Example org-guarded route (FR-4, §5.2), reused by the demo journey. No org
// database exists in this app, so the URL param is used directly as the
// Defra organisation ID to check membership against — a real caller must
// first resolve its own internal organisation ID to the linked Defra
// organisation ID before reaching this point (see the ID-space warning in
// organisation-access.js). The guard runs as a pre-handler, before this
// handler, so a non-member never reaches the code below (FR-4).
export const organisation = {
  method: 'GET',
  path: '/organisation/{organisationId}',
  options: {
    pre: [
      {
        method: requireOrgMembership((request) => request.params.organisationId)
      }
    ]
  },
  handler(request, h) {
    return h.view('organisation', {
      organisationId: request.params.organisationId,
      organisationIds: getUserOrganisationIds(request.auth.credentials)
    })
  }
}
