import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { mockOidcDiscovery } from '#/test-helpers/mock-oidc-discovery.js'

describe('#serveStaticFiles', () => {
  let server

  describe('When secure context is disabled', () => {
    beforeEach(async () => {
      mockOidcDiscovery()
      server = await createServer()
      await server.initialize()
    })

    afterEach(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Should serve favicon as expected', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/favicon.ico'
      })

      expect(statusCode).toBe(statusCodes.noContent)
    })

    test('Should serve a stylesheet to a signed-out request without redirecting to sign-in', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/public/stylesheets/application.css'
      })

      expect(statusCode).toBe(statusCodes.ok)
    })
  })
})
