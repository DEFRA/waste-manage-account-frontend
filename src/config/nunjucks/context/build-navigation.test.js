import { buildNavigation } from './build-navigation.js'

function mockRequest(options) {
  return { ...options }
}

describe('#buildNavigation', () => {
  test('Should provide expected navigation details', () => {
    expect(
      buildNavigation(mockRequest({ path: '/non-existent-path' }))
    ).toEqual([
      {
        current: false,
        text: 'Home',
        href: '/'
      },
      {
        current: false,
        text: 'About',
        href: '/about'
      },
      {
        text: 'Sign in',
        href: '/auth/sign-in'
      }
    ])
  })

  test('Should provide expected highlighted navigation details', () => {
    expect(buildNavigation(mockRequest({ path: '/' }))).toEqual([
      {
        current: true,
        text: 'Home',
        href: '/'
      },
      {
        current: false,
        text: 'About',
        href: '/about'
      },
      {
        text: 'Sign in',
        href: '/auth/sign-in'
      }
    ])
  })

  test('Should append a sign in link when unauthenticated', () => {
    const navigation = buildNavigation(mockRequest({ path: '/about' }), {
      isAuthenticated: false
    })

    expect(navigation).toContainEqual({
      text: 'Sign in',
      href: '/auth/sign-in'
    })
    expect(navigation).not.toContainEqual(
      expect.objectContaining({ text: 'Sign out' })
    )
  })

  test('Should append the display name and a sign out link when authenticated', () => {
    const navigation = buildNavigation(mockRequest({ path: '/about' }), {
      isAuthenticated: true,
      displayName: 'Ada Lovelace'
    })

    expect(navigation).toContainEqual({ text: 'Signed in as Ada Lovelace' })
    expect(navigation).toContainEqual({
      text: 'Sign out',
      href: '/auth/sign-out'
    })
    expect(navigation).not.toContainEqual(
      expect.objectContaining({ text: 'Sign in' })
    )
  })

  test('Should omit the display name item when authenticated with no display name', () => {
    const navigation = buildNavigation(mockRequest({ path: '/about' }), {
      isAuthenticated: true,
      displayName: ''
    })

    expect(navigation).not.toContainEqual(
      expect.objectContaining({ text: expect.stringMatching(/^Signed in/) })
    )
    expect(navigation).toContainEqual({
      text: 'Sign out',
      href: '/auth/sign-out'
    })
  })
})
