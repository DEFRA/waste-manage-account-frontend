export function buildNavigation(request, auth) {
  const navigation = [
    {
      text: 'Home',
      href: '/',
      current: request?.path === '/'
    },
    {
      text: 'About',
      href: '/about',
      current: request?.path === '/about'
    }
  ]

  if (auth?.isAuthenticated) {
    if (auth.displayName) {
      navigation.push({ text: `Signed in as ${auth.displayName}` })
    }
    navigation.push({ text: 'Sign out', href: '/auth/sign-out' })
  } else {
    navigation.push({ text: 'Sign in', href: '/auth/sign-in' })
  }

  return navigation
}
