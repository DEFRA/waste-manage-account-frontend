import { afterEach, describe, expect, test } from 'vitest'

import { createServer } from '../server.js'

describe('GET /organisation/{organisationId} (FR-4, §5.2 example route)', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('member of the organisation gets 200', async () => {
    server = await createServer()
    await server.initialize()

    // Default NODE_ENV=test canned user belongs to org-1 (test-users.js).
    const res = await server.inject('/organisation/org-1')

    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('org-1')
  })

  test('non-member of the organisation gets 403', async () => {
    server = await createServer()
    await server.initialize()

    // Default canned user belongs to org-1 only, not org-2.
    const res = await server.inject('/organisation/org-2')

    expect(res.statusCode).toBe(403)
  })

  test('user with no relationships at all gets 403 (fails closed)', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject({
      url: '/organisation/org-1',
      headers: { 'x-test-user-type': 'no-org-operator' }
    })

    expect(res.statusCode).toBe(403)
  })
})
