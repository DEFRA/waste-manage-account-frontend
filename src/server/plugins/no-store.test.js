import { vi } from 'vitest'

import { noStoreHeader } from './no-store.js'
import { createServer } from '../server.js'
import { mockOidcDiscovery } from '#/test-helpers/mock-oidc-discovery.js'

describe('#noStoreHeader', () => {
  const continueSymbol = Symbol('continue')
  const mockToolkit = { continue: continueSymbol }

  test('Should set cache-control: no-store on a non-excluded path', () => {
    const mockHeader = vi.fn()
    const request = {
      path: '/account',
      response: { header: mockHeader }
    }

    const result = noStoreHeader(request, mockToolkit)

    expect(mockHeader).toHaveBeenCalledWith('cache-control', 'no-store')
    expect(result).toBe(continueSymbol)
  })

  test('Should not set the header for the health check path', () => {
    const mockHeader = vi.fn()
    const request = {
      path: '/health',
      response: { header: mockHeader }
    }

    const result = noStoreHeader(request, mockToolkit)

    expect(mockHeader).not.toHaveBeenCalled()
    expect(result).toBe(continueSymbol)
  })

  test('Should not set the header for the favicon path', () => {
    const mockHeader = vi.fn()
    const request = {
      path: '/favicon.ico',
      response: { header: mockHeader }
    }

    noStoreHeader(request, mockToolkit)

    expect(mockHeader).not.toHaveBeenCalled()
  })

  test('Should not set the header for static assets under the public path', () => {
    const mockHeader = vi.fn()
    const request = {
      path: '/public/stylesheets/application.css',
      response: { header: mockHeader }
    }

    noStoreHeader(request, mockToolkit)

    expect(mockHeader).not.toHaveBeenCalled()
  })
})

describe('#noStore integration', () => {
  let server

  beforeAll(async () => {
    mockOidcDiscovery()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should mark an HTML page response no-store', async () => {
    const { headers, statusCode } = await server.inject({
      method: 'GET',
      url: '/about'
    })

    expect(statusCode).toBe(200)
    expect(headers['cache-control']).toBe('no-store')
  })

  test('Should not mark the health check response no-store', async () => {
    const { headers } = await server.inject({
      method: 'GET',
      url: '/health'
    })

    expect(headers['cache-control']).not.toBe('no-store')
  })

  test('Should not mark static assets under the public path no-store', async () => {
    const { headers } = await server.inject({
      method: 'GET',
      url: '/public/does-not-exist.js'
    })

    expect(headers['cache-control']).not.toBe('no-store')
  })

  test('Should still mark rendered error pages no-store', async () => {
    const { headers, statusCode } = await server.inject({
      method: 'GET',
      url: '/non-existent-path'
    })

    expect(statusCode).toBe(404)
    expect(headers['cache-control']).toBe('no-store')
  })
})
