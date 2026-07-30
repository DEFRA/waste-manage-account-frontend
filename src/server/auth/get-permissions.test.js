import { vi } from 'vitest'

import { getPermissions } from './get-permissions.js'

describe('#getPermissions', () => {
  test('Should map roles and relationships claims into the scope array alongside the baseline user scope', () => {
    const scope = getPermissions({
      roles: ['waste-operator', 'waste-admin'],
      relationships: ['org-1:relationship-1']
    })

    expect(scope).toEqual(
      expect.arrayContaining([
        'user',
        'waste-operator',
        'waste-admin',
        'org-1:relationship-1'
      ])
    )
    expect(scope).toHaveLength(4)
  })

  test('Should accept comma-separated string claims as well as arrays', () => {
    const scope = getPermissions({
      roles: 'waste-operator,waste-admin',
      relationships: 'org-1:relationship-1'
    })

    expect(scope).toEqual(
      expect.arrayContaining([
        'user',
        'waste-operator',
        'waste-admin',
        'org-1:relationship-1'
      ])
    )
  })

  test('Should not duplicate a scope value present in both roles and relationships', () => {
    const scope = getPermissions({
      roles: ['shared-scope'],
      relationships: ['shared-scope']
    })

    expect(scope).toEqual(['user', 'shared-scope'])
  })

  test('Should return only the baseline user scope when claims are missing', () => {
    expect(getPermissions(undefined)).toEqual(['user'])
  })

  test('Should return only the baseline user scope when claims are empty', () => {
    expect(getPermissions({})).toEqual(['user'])
  })

  test('Should return only the baseline user scope when roles and relationships are empty arrays', () => {
    expect(getPermissions({ roles: [], relationships: [] })).toEqual(['user'])
  })

  test('Should ignore malformed claim values instead of throwing', () => {
    const scope = getPermissions({
      roles: [null, 42, '', '   ', { role: 'not-a-string' }],
      relationships: 'not-an-array-but-a-string,also-fine',
      unrelatedField: 'ignored'
    })

    expect(scope).toEqual(
      expect.arrayContaining(['user', 'not-an-array-but-a-string', 'also-fine'])
    )
    expect(scope).toHaveLength(3)
  })

  test('Should handle a non-object claims value gracefully', () => {
    expect(getPermissions('not-an-object')).toEqual(['user'])
    expect(getPermissions(null)).toEqual(['user'])
  })

  test('Should never log the claims it is passed', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    getPermissions({
      roles: ['waste-operator'],
      relationships: ['org-1:relationship-1'],
      contactId: 'should-never-be-logged'
    })

    expect(logSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
  })
})
