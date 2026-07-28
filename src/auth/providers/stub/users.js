// Predefined fake users for the FR-6 stub login chooser. Profiles match the
// spec §5 session shape exactly (no id_token — that key only exists after a
// real OIDC exchange) and carry realistic structured `relationships`
// objects (spec-003 §2.4) so organisation-access logic downstream is
// exercised the same way it would be against a real Defra ID token.

const STUB_USERS = [
  {
    id: 'amina-khan',
    description: 'Acme Recycling Ltd + Beta Waste Ltd',
    profile: {
      id: 'stub-amina-khan',
      email: 'amina.khan@example.test',
      name: 'Amina Khan',
      userType: 'operator',
      roles: [],
      contactId: 'contact-amina-khan',
      currentRelationshipId: 'rel-amina-1',
      relationships: [
        {
          relationshipId: 'rel-amina-1',
          organisationId: 'org-acme',
          organisationName: 'Acme Recycling Ltd'
        },
        {
          relationshipId: 'rel-amina-2',
          organisationId: 'org-beta',
          organisationName: 'Beta Waste Ltd'
        }
      ],
      scope: ['operator']
    }
  },
  {
    id: 'ben-carter',
    description: 'Gamma Skips Ltd',
    profile: {
      id: 'stub-ben-carter',
      email: 'ben.carter@example.test',
      name: 'Ben Carter',
      userType: 'operator',
      roles: [],
      contactId: 'contact-ben-carter',
      currentRelationshipId: 'rel-ben-1',
      relationships: [
        {
          relationshipId: 'rel-ben-1',
          organisationId: 'org-gamma',
          organisationName: 'Gamma Skips Ltd'
        }
      ],
      scope: ['operator']
    }
  },
  {
    id: 'chidi-okoro',
    description: 'No organisation relationships',
    profile: {
      id: 'stub-chidi-okoro',
      email: 'chidi.okoro@example.test',
      name: 'Chidi Okoro',
      userType: 'operator',
      roles: [],
      contactId: 'contact-chidi-okoro',
      currentRelationshipId: null,
      relationships: [],
      scope: ['operator']
    }
  }
]

export function getStubUsers() {
  return STUB_USERS
}

export function getStubUser(id) {
  return STUB_USERS.find((user) => user.id === id)
}
