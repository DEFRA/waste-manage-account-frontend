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
    'rel-1:org-1:Acme Waste Ltd',
    'rel-2:org-2:Beta Recycling:Employee', // additional segments are allowed
    'rel-3:org-3:Gamma Skips'
  ]
}

describe('getUserOrganisationIds', () => {
  test('returns the organisation ID (second segment) of each entry', () => {
    expect(getUserOrganisationIds(user)).toEqual(['org-1', 'org-2', 'org-3'])
  })

  test('skips non-string entries', () => {
    expect(
      getUserOrganisationIds({
        relationships: [42, null, undefined, { org: 'org-1' }, ['rel:org:name']]
      })
    ).toEqual([])
  })

  test('skips entries with empty or missing core segments', () => {
    expect(
      getUserOrganisationIds({
        relationships: [
          '', // empty entry
          'rel-only', // no organisation segment
          ':org-1:No Relationship Id',
          'rel-2::No Organisation Id',
          'rel-3:org-3:', // empty organisation name
          'rel-4:org-4:Kept Ltd'
        ]
      })
    ).toEqual(['org-4'])
  })

  test('fails closed on missing or non-array relationships', () => {
    expect(getUserOrganisationIds(undefined)).toEqual([])
    expect(getUserOrganisationIds(null)).toEqual([])
    expect(getUserOrganisationIds({})).toEqual([])
    expect(
      getUserOrganisationIds({ relationships: 'rel-1:org-1:Acme' })
    ).toEqual([])
  })
})

describe('getUserRelationships', () => {
  test('returns the fully parsed relationship list', () => {
    expect(getUserRelationships(user)).toEqual([
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
    ])
  })

  test('skips malformed entries and fails closed on missing input', () => {
    expect(
      getUserRelationships({
        relationships: ['rel-1::', 'rel-2:org-2:Kept Ltd']
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
    expect(userIsRelatedToOrg({ relationships: ['rel-1::'] }, undefined)).toBe(
      false
    )
  })
})

describe('getCurrentRelationship', () => {
  test('returns the parsed relationship matching currentRelationshipId', () => {
    expect(getCurrentRelationship(user)).toEqual({
      relationshipId: 'rel-1',
      organisationId: 'org-1',
      organisationName: 'Acme Waste Ltd'
    })
  })

  test('ignores additional segments beyond the organisation name', () => {
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
        relationships: ['rel-1:org-1:'] // empty organisation name segment
      })
    ).toBe(null)
  })
})
