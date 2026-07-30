import { createServer } from '#/server/server.js'
import { mockOidcDiscovery } from '#/test-helpers/mock-oidc-discovery.js'

describe('#contentSecurityPolicy', () => {
  let server

  beforeAll(async () => {
    mockOidcDiscovery()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should set the CSP policy header', async () => {
    const resp = await server.inject({
      method: 'GET',
      url: '/about'
    })

    expect(resp.headers['content-security-policy']).toBeDefined()
  })

  test('Should not loosen form-action to the DEFRA ID host', async () => {
    const resp = await server.inject({
      method: 'GET',
      url: '/about'
    })

    expect(resp.headers['content-security-policy']).toContain(
      "form-action 'self'"
    )
  })

  test('Should not block the sign-in redirect to the DEFRA ID host, despite the restrictive CSP', async () => {
    const resp = await server.inject({
      method: 'GET',
      url: '/auth/sign-in'
    })

    expect(resp.statusCode).toBe(302)
    const location = new URL(resp.headers.location)
    expect(location.origin).toBe('https://defra-id.example')
    expect(resp.headers['content-security-policy']).toContain(
      "form-action 'self'"
    )
  })
})
