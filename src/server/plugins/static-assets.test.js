import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { mockOidcDiscovery } from '#/test-helpers/mock-oidc-discovery.js'

describe('#staticAssets (Vite dev middleware)', () => {
  let server

  beforeAll(async () => {
    // Force the local-development branch so the route mounts the real Vite
    // dev middleware rather than the prebuilt .public directory.
    config.set('isDevelopment', true)
    mockOidcDiscovery()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    config.set('isDevelopment', false)
    await server.stop({ timeout: 0 })
  })

  test('Should serve a source stylesheet to a signed-out request without redirecting to sign-in', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/public/src/client/stylesheets/application.scss'
    })

    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should return not found for an asset Vite cannot resolve', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/public/no-such-asset.css'
    })

    expect(statusCode).toBe(statusCodes.notFound)
  })
})
