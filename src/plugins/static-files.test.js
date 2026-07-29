import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

import { createServer } from '../server.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(dirname, '..', '..', '.public')

// A fixture keeps these tests independent of `npm run build:frontend` having
// been run first; the real stylesheet's presence is a build concern.
const fixture = path.join(publicDir, 'stylesheets', 'static-files.fixture.css')

describe('static files plugin', () => {
  let server

  beforeAll(async () => {
    await mkdir(path.dirname(fixture), { recursive: true })
    await writeFile(fixture, '.fixture { colour: definitely }')
  })

  afterAll(async () => {
    await rm(fixture, { force: true })
  })

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('serves build output from .public under /public', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject(
      '/public/stylesheets/static-files.fixture.css'
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/css')
    expect(res.payload).toContain('.fixture')
  })

  test('returns 404 for assets that do not exist', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/public/stylesheets/no-such-file.css')

    expect(res.statusCode).toBe(404)
  })

  test('does not expose directory listings', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/public/stylesheets/')

    expect(res.statusCode).toBe(403)
  })

  test('rejects path traversal out of .public', async () => {
    server = await createServer()
    await server.initialize()

    const res = await server.inject('/public/../package.json')

    expect(res.statusCode).toBe(404)
  })
})
