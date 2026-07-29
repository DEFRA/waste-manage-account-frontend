import { afterEach, describe, expect, test } from 'vitest'

import { createServer } from '../src/server.js'

describe('error pages (FR3)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('unknown routes render a GOV.UK-styled 404 page', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/no-such-page')

    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.payload).toContain('Page not found')
    expect(res.payload).toContain('govuk-heading-xl')
    expect(res.payload).toContain('govuk-header')
    expect(res.payload).toContain('govuk-footer')
  })

  test('unhandled server errors render a GOV.UK-styled 500 page', async () => {
    server = await createServer()
    server.route({
      method: 'GET',
      path: '/test-boom',
      handler() {
        throw new Error('forced failure for the 500 error page test')
      }
    })
    await server.initialize()

    const res = await server.inject('/test-boom')

    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.payload).toContain('Something went wrong')
    expect(res.payload).toContain('govuk-heading-xl')
    // The Boom payload must not leak internals to the user (spec NFR5)
    expect(res.payload).not.toContain('forced failure')
  })

  test('the 404 page does not fall back to Hapi JSON Boom output', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/no-such-page')

    expect(res.headers['content-type']).not.toContain('application/json')
    expect(res.payload).not.toContain('"statusCode"')
  })
})
