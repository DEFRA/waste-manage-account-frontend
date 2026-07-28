import { describe, expect, test } from 'vitest'

import { buildProfile } from './profile.js'

describe('buildProfile', () => {
  test('maps verified id_token claims into the session profile shape (spec §5.1)', () => {
    expect(
      buildProfile({
        sub: 'user-1',
        email: 'user-1@example.test',
        firstName: 'Ada',
        lastName: 'Lovelace',
        contactId: 'contact-1',
        currentRelationshipId: 'rel-1',
        relationships: ['rel-1:org-1:Acme Recycling Ltd'],
        roles: ['submitter']
      })
    ).toStrictEqual({
      id: 'user-1',
      email: 'user-1@example.test',
      name: 'Ada Lovelace',
      userType: 'operator',
      roles: ['submitter'],
      contactId: 'contact-1',
      currentRelationshipId: 'rel-1',
      relationships: [
        {
          relationshipId: 'rel-1',
          organisationId: 'org-1',
          organisationName: 'Acme Recycling Ltd'
        }
      ],
      scope: ['operator']
    })
  })

  test('defaults roles to [] when the claim is missing or not an array', () => {
    expect(buildProfile({ sub: 'user-1' }).roles).toEqual([])
    expect(buildProfile({ sub: 'user-1', roles: 'submitter' }).roles).toEqual(
      []
    )
  })

  test('trims to an empty name when firstName/lastName are both missing', () => {
    expect(buildProfile({ sub: 'user-1' }).name).toBe('')
  })
})
