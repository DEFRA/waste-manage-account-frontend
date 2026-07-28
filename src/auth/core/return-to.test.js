import { describe, expect, test } from 'vitest'

import { safeReturnTo } from './return-to.js'

describe('safeReturnTo', () => {
  test('keeps a plain relative path', () => {
    expect(safeReturnTo('/dashboard')).toBe('/dashboard')
  })

  test('keeps a relative path with query string and fragment', () => {
    expect(safeReturnTo('/dashboard?tab=waste#top')).toBe(
      '/dashboard?tab=waste#top'
    )
  })

  test('keeps the root path itself', () => {
    expect(safeReturnTo('/')).toBe('/')
  })

  test('rejects protocol-relative //host paths', () => {
    expect(safeReturnTo('//evil.example')).toBe('/')
  })

  test('rejects absolute URLs with a scheme', () => {
    expect(safeReturnTo('https://evil.example')).toBe('/')
  })

  test('rejects javascript: URLs', () => {
    expect(safeReturnTo('javascript:alert(1)')).toBe('/')
  })

  // Browsers normalise backslashes to slashes, so '/\evil' navigates to
  // '//evil' — protocol-relative — despite starting with a single '/'.
  test('rejects paths containing backslashes', () => {
    expect(safeReturnTo('/\\evil.example')).toBe('/')
    expect(safeReturnTo('/dashboard\\..\\evil')).toBe('/')
  })

  test('rejects paths containing control characters', () => {
    expect(safeReturnTo('/dash\r\nSet-Cookie: x=y')).toBe('/')
    expect(safeReturnTo('/dash\tboard')).toBe('/')
    expect(safeReturnTo('/dash\u0000board')).toBe('/')
    expect(safeReturnTo('/dash\u007fboard')).toBe('/')
  })

  test('rejects empty and missing values', () => {
    expect(safeReturnTo('')).toBe('/')
    expect(safeReturnTo(undefined)).toBe('/')
    expect(safeReturnTo(null)).toBe('/')
  })

  test('rejects non-string values', () => {
    expect(safeReturnTo(42)).toBe('/')
    expect(safeReturnTo(['/dashboard'])).toBe('/')
  })

  test('returns the supplied fallback for unsafe input', () => {
    expect(safeReturnTo('https://evil.example', '/home')).toBe('/home')
    expect(safeReturnTo(undefined, '/home')).toBe('/home')
  })
})
