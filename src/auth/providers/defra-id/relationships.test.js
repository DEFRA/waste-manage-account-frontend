import { describe, expect, test } from 'vitest'

import { parseDefraRelationships } from './relationships.js'

describe('parseDefraRelationships', () => {
  test('parses each colon-delimited entry into a structured object', () => {
    expect(
      parseDefraRelationships({
        relationships: [
          'rel-1:org-1:Acme Waste Ltd',
          'rel-2:org-2:Beta Recycling:Employee', // additional segments allowed
          'rel-3:org-3:Gamma Skips'
        ]
      })
    ).toEqual([
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

  test('skips non-string entries', () => {
    expect(
      parseDefraRelationships({
        relationships: [42, null, undefined, { org: 'org-1' }, ['rel:org:name']]
      })
    ).toEqual([])
  })

  test('skips entries with empty or missing core segments', () => {
    expect(
      parseDefraRelationships({
        relationships: [
          '', // empty entry
          'rel-only', // no organisation segment
          ':org-1:No Relationship Id',
          'rel-2::No Organisation Id',
          'rel-3:org-3:', // empty organisation name
          'rel-4:org-4:Kept Ltd'
        ]
      })
    ).toEqual([
      {
        relationshipId: 'rel-4',
        organisationId: 'org-4',
        organisationName: 'Kept Ltd'
      }
    ])
  })

  test('fails closed on missing or non-array relationships', () => {
    expect(parseDefraRelationships(undefined)).toEqual([])
    expect(parseDefraRelationships(null)).toEqual([])
    expect(parseDefraRelationships({})).toEqual([])
    expect(
      parseDefraRelationships({ relationships: 'rel-1:org-1:Acme' })
    ).toEqual([])
  })
})
