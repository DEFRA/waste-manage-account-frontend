import { createServer } from '#/server/server.js'
import { mockOidcDiscovery } from '#/test-helpers/mock-oidc-discovery.js'

describe('#crumb', () => {
  let server

  beforeAll(async () => {
    mockOidcDiscovery()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should register without breaking server initialisation', () => {
    expect(server.registrations['@hapi/crumb']).toBeDefined()
  })

  test('Should not break an existing GET route inject', async () => {
    const resp = await server.inject({
      method: 'GET',
      url: '/'
    })

    expect(resp.statusCode).toBe(200)
  })

  test('Should set a crumb cookie on a GET request', async () => {
    const resp = await server.inject({
      method: 'GET',
      url: '/'
    })

    const crumbCookie = resp.headers['set-cookie'].find((cookie) =>
      cookie.startsWith('crumb=')
    )

    expect(crumbCookie).toBeDefined()
  })

  test('Should mark the crumb cookie consistently with the session cookie settings', async () => {
    const resp = await server.inject({
      method: 'GET',
      url: '/'
    })

    const crumbCookie = resp.headers['set-cookie'].find((cookie) =>
      cookie.startsWith('crumb=')
    )

    expect(crumbCookie).toContain('SameSite=Lax')
  })
})
