// Canned users for the NODE_ENV=test auth bypass (spec FR-6). Business-route
// tests select one via the `x-test-user-type` request header instead of
// driving a real or stub login; an absent/unrecognised header falls back to
// the default so every existing test needs no header at all. Shape matches
// the spec §5 session profile so business routes see identical credentials
// in test, stub, and real-login modes — relationships are structured objects
// (spec-003 §2.4), matching what a real login now stores.

const TEST_USERS = {
  operator: {
    id: 'test-operator',
    email: 'operator@example.test',
    name: 'Test Operator',
    userType: 'operator',
    roles: [],
    contactId: 'contact-operator',
    currentRelationshipId: 'rel-1',
    relationships: [
      {
        relationshipId: 'rel-1',
        organisationId: 'org-1',
        organisationName: 'Acme Recycling Ltd'
      }
    ],
    scope: ['operator']
  },
  'multi-org-operator': {
    id: 'test-multi-org-operator',
    email: 'multi-org@example.test',
    name: 'Multi Org Operator',
    userType: 'operator',
    roles: [],
    contactId: 'contact-multi-org',
    currentRelationshipId: 'rel-2',
    relationships: [
      {
        relationshipId: 'rel-2',
        organisationId: 'org-2',
        organisationName: 'Beta Waste Ltd'
      },
      {
        relationshipId: 'rel-3',
        organisationId: 'org-3',
        organisationName: 'Gamma Skips Ltd'
      }
    ],
    scope: ['operator']
  },
  // Fixture for the FR-4 role guard (src/auth/core/guards.js): the only canned
  // user carrying a non-empty roles array.
  'org-manager': {
    id: 'test-org-manager',
    email: 'org-manager@example.test',
    name: 'Test Org Manager',
    userType: 'operator',
    roles: ['waste-manager'],
    contactId: 'contact-org-manager',
    currentRelationshipId: 'rel-4',
    relationships: [
      {
        relationshipId: 'rel-4',
        organisationId: 'org-4',
        organisationName: 'Delta Waste Ltd'
      }
    ],
    scope: ['operator']
  },
  // Fixture for the §5.2 fail-closed organisation guard: a user with no
  // relationships at all (unknown/absent link, as distinct from a user who
  // has relationships but not to the target organisation).
  'no-org-operator': {
    id: 'test-no-org-operator',
    email: 'no-org@example.test',
    name: 'No Org Operator',
    userType: 'operator',
    roles: [],
    contactId: 'contact-no-org',
    currentRelationshipId: null,
    relationships: [],
    scope: ['operator']
  }
}

export const DEFAULT_TEST_USER_TYPE = 'operator'

export function getTestUser(userType) {
  return TEST_USERS[userType] ?? TEST_USERS[DEFAULT_TEST_USER_TYPE]
}
