import { getSafeRedirect } from './get-safe-redirect.js'

describe('#getSafeRedirect', () => {
  test('Should return a valid relative path as-is', () => {
    expect(getSafeRedirect('/account/details')).toBe('/account/details')
  })

  test('Should return a valid relative path with a query string as-is', () => {
    expect(getSafeRedirect('/account/details?tab=1')).toBe(
      '/account/details?tab=1'
    )
  })

  test('Should fall back to the default path for a protocol-relative URL', () => {
    expect(getSafeRedirect('//evil.com')).toBe('/')
  })

  test('Should fall back to the default path for an absolute URL', () => {
    expect(getSafeRedirect('https://evil.com')).toBe('/')
  })

  test('Should fall back to the default path for a backslash trick', () => {
    expect(getSafeRedirect('/\\evil.com')).toBe('/')
  })

  test('Should fall back to the default path for an empty string', () => {
    expect(getSafeRedirect('')).toBe('/')
  })

  test('Should fall back to the default path for undefined', () => {
    expect(getSafeRedirect(undefined)).toBe('/')
  })

  test('Should fall back to the default path for a non-string value', () => {
    expect(getSafeRedirect({ path: '/account' })).toBe('/')
  })

  test('Should fall back to a caller-supplied default path', () => {
    expect(getSafeRedirect('//evil.com', '/home')).toBe('/home')
  })
})
