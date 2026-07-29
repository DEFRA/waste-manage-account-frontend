import axe from 'axe-core'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { createServer } from '../src/server.js'

const DISCOVERY_URL = 'https://idp.example/.well-known/openid-configuration'

// config, discovery's module-level cache, and session.js are all read/created
// at import time, so exercising a non-default env combination needs a fresh
// module graph per test (same idiom as login.test.js/stub.test.js).
async function freshServer(envOverrides = {}) {
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const { createServer: freshCreateServer } = await import('../src/server.js')
  const server = await freshCreateServer()
  await server.initialize()
  return server
}

/**
 * Runs axe against server-rendered HTML inside a jsdom window, so the check
 * needs no browser. axe is evaluated inside the jsdom context (via eval of
 * axe.source) rather than imported globals, keeping the test environment
 * `node` and leaking nothing between tests.
 */
async function runAxe(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' })
  dom.window.eval(axe.source)
  return dom.window.axe.run(dom.window.document, {
    rules: {
      // jsdom has no layout/paint engine, so colour computation is
      // unavailable; contrast is covered by unmodified GOV.UK Frontend
      // components (NFR1) and cannot be meaningfully evaluated here.
      'color-contrast': { enabled: false }
    }
  })
}

describe('accessibility (NFR1)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('the home page has no axe violations', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/')
    expect(res.statusCode).toBe(200)

    const results = await runAxe(res.payload)

    // Surface rule ids and affected nodes on failure, not just a count
    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.html)
    }))
    expect(violations).toEqual([])
  })

  test('the organisation page has no axe violations', async () => {
    server = await createServer()
    await server.initialize()

    // Default NODE_ENV=test canned user belongs to org-1 (test-users.js).
    const res = await server.inject('/organisation/org-1')
    expect(res.statusCode).toBe(200)

    const results = await runAxe(res.payload)
    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.html)
    }))
    expect(violations).toEqual([])
  })
})

describe('accessibility (NFR1) — auth pages', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function expectNoViolations(html) {
    const results = await runAxe(html)
    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.html)
    }))
    expect(violations).toEqual([])
  }

  test('the stub chooser page has no axe violations', async () => {
    server = await freshServer({ AUTH_STUB_ENABLED: 'true' })

    const res = await server.inject('/auth/stub/login')
    expect(res.statusCode).toBe(200)

    await expectNoViolations(res.payload)
  })

  test('the signed-out page has no axe violations', async () => {
    server = await freshServer()

    const res = await server.inject('/auth/signed-out')
    expect(res.statusCode).toBe(200)

    await expectNoViolations(res.payload)
  })

  test('the sign-in-unavailable page has no axe violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused'))
    )
    server = await freshServer({
      AUTH_STUB_ENABLED: 'false',
      DEFRA_ID_DISCOVERY_URL: DISCOVERY_URL,
      DEFRA_ID_CLIENT_ID: 'client-id',
      DEFRA_ID_CLIENT_SECRET: 'client-secret',
      DEFRA_ID_SERVICE_ID: 'service-id'
    })

    const res = await server.inject('/auth/login')
    expect(res.statusCode).toBe(502)

    await expectNoViolations(res.payload)
  })
})
