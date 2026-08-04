import { randomUUID } from 'node:crypto'

import { load } from 'cheerio'

import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { mockOidcDiscovery } from '#/test-helpers/mock-oidc-discovery.js'

function extractSessionCookie(setCookieHeaders) {
  return setCookieHeaders
    .find((cookie) => cookie.startsWith('defra-id-session='))
    .split(';')[0]
}

describe('#aboutController', () => {
  let server

  beforeAll(async () => {
    mockOidcDiscovery()
    server = await createServer()

    /**
     * Test-only route that signs a request in without driving the full
     * bell OAuth2 exchange (already covered elsewhere), so the public
     * `/about` page's navigation can be exercised as a signed-in user.
     */
    server.route({
      method: 'GET',
      path: '/__test-sign-in-as',
      options: { auth: false },
      handler: async (request, h) => {
        const sessionId = randomUUID()

        await request.server.app.cache.set(sessionId, {
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          idToken: 'id-token',
          scope: ['user'],
          profile: { displayName: 'Ada Lovelace' }
        })
        request.cookieAuth.set({ sessionId })

        return h.response('signed in')
      }
    })

    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/about'
    })

    expect(result).toEqual(expect.stringContaining('About |'))
    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should show a sign in link in the navigation for an anonymous user', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/about'
    })

    const $ = load(result)
    const navText = $('.govuk-service-navigation__wrapper').text()

    expect(navText).toContain('Sign in')
    expect(
      $('.govuk-service-navigation__link[href="/auth/sign-in"]')
    ).toHaveLength(1)
    expect(navText).not.toContain('Sign out')
  })

  test('Should show the display name and a sign out link in the navigation for a signed-in user', async () => {
    const signInResponse = await server.inject({
      method: 'GET',
      url: '/__test-sign-in-as'
    })
    const cookie = extractSessionCookie(signInResponse.headers['set-cookie'])

    const { result } = await server.inject({
      method: 'GET',
      url: '/about',
      headers: { cookie }
    })

    const $ = load(result)
    const navText = $('.govuk-service-navigation__wrapper').text()

    expect(navText).toContain('Signed in as Ada Lovelace')
    expect(
      $('.govuk-service-navigation__link[href="/auth/sign-out"]')
    ).toHaveLength(1)
    expect(
      $('.govuk-service-navigation__link[href="/auth/sign-in"]')
    ).toHaveLength(0)
  })
})
