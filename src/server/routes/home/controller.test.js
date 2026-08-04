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

describe('#homeController', () => {
  let server

  beforeAll(async () => {
    mockOidcDiscovery()
    server = await createServer()

    /**
     * Test-only route that signs a request in with an arbitrary `scope`,
     * bypassing the full bell OAuth2 exchange (already covered elsewhere),
     * so the scope-protected `/` route can be exercised via `server.inject`
     * for both an authorised and an unauthorised signed-in user.
     */
    server.route({
      method: 'GET',
      path: '/__test-sign-in-as',
      options: { auth: false },
      handler: async (request, h) => {
        const sessionId = randomUUID()
        const scope = request.query.scope.split(',')

        await request.server.app.cache.set(sessionId, {
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          idToken: 'id-token',
          scope,
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

  async function signInWithScope(scope) {
    const response = await server.inject({
      method: 'GET',
      url: `/__test-sign-in-as?scope=${scope.join(',')}`
    })

    return extractSessionCookie(response.headers['set-cookie'])
  }

  test('Should redirect an unauthenticated request to sign in', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe(
      `/auth/sign-in?redirect=${encodeURIComponent('/')}`
    )
  })

  test('Should provide expected response for a signed-in user with the "user" scope', async () => {
    const cookie = await signInWithScope(['user'])

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/',
      headers: { cookie }
    })

    expect(result).toEqual(expect.stringContaining('Home |'))
    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should render the unauthorised view with a 403 for a signed-in user missing the "user" scope', async () => {
    const cookie = await signInWithScope(['some-other-scope'])

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/',
      headers: { cookie }
    })

    expect(statusCode).toBe(statusCodes.forbidden)

    const $ = load(result)
    expect($('h1').text()).toContain(
      'You do not have permission to access this page'
    )
    expect($('.govuk-body').text()).toContain(
      'You do not have the necessary permissions to view this page.'
    )
  })
})
