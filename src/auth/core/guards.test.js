import { afterEach, describe, expect, test } from 'vitest'

import { requireOrgMembership, requireRole, requireScope } from './guards.js'
import { createServer } from '../../server.js'

// Temporary routes exercising each guard directly, in the style of
// session.test.js / auth.test.js — guards are framework pre-handlers, so
// the only way to observe their 403-before-handler behaviour is a real
// route (NODE_ENV=test auth bypass supplies credentials, test-users.js).
function guardedRoute(pre) {
  return {
    method: 'GET',
    path: '/test-guards/target',
    options: { pre: [{ method: pre }] },
    handler: () => ({ reachedHandler: true })
  }
}

describe('requireScope (FR-4)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('403s a user missing the required scope, before the handler runs', async () => {
    server = await createServer()
    // Default canned user (test-users.js) has scope ['operator'].
    server.route(guardedRoute(requireScope('admin')))
    await server.initialize()

    const res = await server.inject('/test-guards/target')

    expect(res.statusCode).toBe(403)
    expect(res.result.reachedHandler).toBeUndefined()
  })

  test('200s a user holding the required scope', async () => {
    server = await createServer()
    server.route(guardedRoute(requireScope('operator')))
    await server.initialize()

    const res = await server.inject('/test-guards/target')

    expect(res.statusCode).toBe(200)
    expect(res.result.reachedHandler).toBe(true)
  })
})

describe('requireRole (FR-4)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('403s a user missing the required role', async () => {
    server = await createServer()
    // Default canned user has an empty roles array.
    server.route(guardedRoute(requireRole('waste-manager')))
    await server.initialize()

    const res = await server.inject('/test-guards/target')

    expect(res.statusCode).toBe(403)
  })

  test('200s a user holding the required role', async () => {
    server = await createServer()
    server.route(guardedRoute(requireRole('waste-manager')))
    await server.initialize()

    const res = await server.inject({
      url: '/test-guards/target',
      headers: { 'x-test-user-type': 'org-manager' }
    })

    expect(res.statusCode).toBe(200)
  })
})

describe('requireOrgMembership (§5.2, FR-4)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('200s a member of the target organisation', async () => {
    server = await createServer()
    // Default canned user belongs to org-1 (test-users.js).
    server.route(guardedRoute(requireOrgMembership(() => 'org-1')))
    await server.initialize()

    const res = await server.inject('/test-guards/target')

    expect(res.statusCode).toBe(200)
  })

  test('403s a non-member of the target organisation', async () => {
    server = await createServer()
    server.route(guardedRoute(requireOrgMembership(() => 'org-999')))
    await server.initialize()

    const res = await server.inject('/test-guards/target')

    expect(res.statusCode).toBe(403)
  })

  test('fails closed when the organisation id to check is missing', async () => {
    server = await createServer()
    server.route(guardedRoute(requireOrgMembership(() => undefined)))
    await server.initialize()

    const res = await server.inject('/test-guards/target')

    expect(res.statusCode).toBe(403)
  })

  test('fails closed when the user has no relationships at all', async () => {
    server = await createServer()
    server.route(guardedRoute(requireOrgMembership(() => 'org-1')))
    await server.initialize()

    const res = await server.inject({
      url: '/test-guards/target',
      headers: { 'x-test-user-type': 'no-org-operator' }
    })

    expect(res.statusCode).toBe(403)
  })
})
