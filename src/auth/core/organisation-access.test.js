import { describe, expect, test } from 'vitest'

import {
  getCurrentRelationship,
  getUserOrganisationIds,
  getUserRelationships,
  userIsRelatedToOrg
} from './organisation-access.js'

const user = {
  currentRelationshipId: 'rel-1',
  relationships: [
    {
      relationshipId: 'rel-1',
      organisationId: 'org-1',
      organisationName: 'Acme Waste Ltd'
    },
    {
      relationshipId: 'rel-2',
      organisationId: 'org-2',
      organisationName: 'Beta Recycling'
    },
    {
      relationshipId: 'rel-3',
      organisationId: 'org-3',
      organisationName: 'Gamma Skips'
    }
  ]
}

describe('getUserOrganisationIds', () => {
  test('returns the organisation ID of each valid entry', () => {
    expect(getUserOrganisationIds(user)).toEqual(['org-1', 'org-2', 'org-3'])
  })

  test('skips non-object entries', () => {
    expect(
      getUserOrganisationIds({
        relationships: [42, null, undefined, 'rel:org:name', ['rel', 'org']]
      })
    ).toEqual([])
  })

  test('skips entries with empty or missing fields', () => {
    expect(
      getUserOrganisationIds({
        relationships: [
          {},
          {
            relationshipId: '',
            organisationId: 'org-1',
            organisationName: 'No Relationship Id'
          },
          {
            relationshipId: 'rel-2',
            organisationId: '',
            organisationName: 'No Organisation Id'
          },
          {
            relationshipId: 'rel-3',
            organisationId: 'org-3',
            organisationName: ''
          },
          {
            relationshipId: 'rel-4',
            organisationId: 'org-4',
            organisationName: 'Kept Ltd'
          }
        ]
      })
    ).toEqual(['org-4'])
  })

  test('fails closed on missing or non-array relationships', () => {
    expect(getUserOrganisationIds(undefined)).toEqual([])
    expect(getUserOrganisationIds(null)).toEqual([])
    expect(getUserOrganisationIds({})).toEqual([])
    expect(
      getUserOrganisationIds({
        relationships: {
          relationshipId: 'rel-1',
          organisationId: 'org-1',
          organisationName: 'Acme'
        }
      })
    ).toEqual([])
  })
})

describe('getUserRelationships', () => {
  test('returns the full valid relationship list', () => {
    expect(getUserRelationships(user)).toEqual(user.relationships)
  })

  test('skips malformed entries and fails closed on missing input', () => {
    expect(
      getUserRelationships({
        relationships: [
          { relationshipId: 'rel-1', organisationId: '', organisationName: '' },
          {
            relationshipId: 'rel-2',
            organisationId: 'org-2',
            organisationName: 'Kept Ltd'
          }
        ]
      })
    ).toEqual([
      {
        relationshipId: 'rel-2',
        organisationId: 'org-2',
        organisationName: 'Kept Ltd'
      }
    ])
    expect(getUserRelationships(undefined)).toEqual([])
    expect(getUserRelationships(null)).toEqual([])
  })
})

describe('userIsRelatedToOrg', () => {
  test('returns true when the user is related to the organisation', () => {
    expect(userIsRelatedToOrg(user, 'org-2')).toBe(true)
  })

  test('returns false when the user is not related to the organisation', () => {
    expect(userIsRelatedToOrg(user, 'org-999')).toBe(false)
  })

  test('fails closed on a null/undefined/empty target organisation', () => {
    expect(userIsRelatedToOrg(user, null)).toBe(false)
    expect(userIsRelatedToOrg(user, undefined)).toBe(false)
    expect(userIsRelatedToOrg(user, '')).toBe(false)
  })

  test('fails closed on a missing user', () => {
    expect(userIsRelatedToOrg(undefined, 'org-1')).toBe(false)
    expect(userIsRelatedToOrg(null, 'org-1')).toBe(false)
  })

  test('a malformed entry never grants access', () => {
    expect(
      userIsRelatedToOrg(
        {
          relationships: [
            {
              relationshipId: 'rel-1',
              organisationId: '',
              organisationName: ''
            }
          ]
        },
        undefined
      )
    ).toBe(false)
  })
})

describe('getCurrentRelationship', () => {
  test('returns the relationship matching currentRelationshipId', () => {
    expect(getCurrentRelationship(user)).toEqual({
      relationshipId: 'rel-1',
      organisationId: 'org-1',
      organisationName: 'Acme Waste Ltd'
    })
  })

  test('finds a relationship other than the first', () => {
    expect(
      getCurrentRelationship({ ...user, currentRelationshipId: 'rel-2' })
    ).toEqual({
      relationshipId: 'rel-2',
      organisationId: 'org-2',
      organisationName: 'Beta Recycling'
    })
  })

  test('returns null when currentRelationshipId is missing or empty', () => {
    expect(getCurrentRelationship({ relationships: user.relationships })).toBe(
      null
    )
    expect(getCurrentRelationship({ ...user, currentRelationshipId: '' })).toBe(
      null
    )
    expect(getCurrentRelationship(undefined)).toBe(null)
    expect(getCurrentRelationship(null)).toBe(null)
  })

  test('returns null when no relationship matches currentRelationshipId', () => {
    expect(
      getCurrentRelationship({ ...user, currentRelationshipId: 'rel-999' })
    ).toBe(null)
  })

  test('returns null when the matching entry is malformed', () => {
    expect(
      getCurrentRelationship({
        currentRelationshipId: 'rel-1',
        relationships: [
          {
            relationshipId: 'rel-1',
            organisationId: 'org-1',
            organisationName: ''
          }
        ]
      })
    ).toBe(null)
  })
})
