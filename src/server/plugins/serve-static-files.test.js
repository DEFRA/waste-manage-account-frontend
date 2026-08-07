import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'

import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { mockOidcDiscovery } from '#/test-helpers/mock-oidc-discovery.js'

// Written under .public because that's where the directory route serves
// from. A fixture of our own is used rather than a real built asset —
// .public is gitignored, so real assets only exist where a frontend
// build has run and a test relying on them would fail in CI.
const fixtureDir = path.resolve(config.get('root'), '.public/stylesheets')
const fixtureFile = path.join(fixtureDir, 'test-fixture.css')

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

    describe('With a static asset present', () => {
      beforeEach(async () => {
        await mkdir(fixtureDir, { recursive: true })
        await writeFile(fixtureFile, 'body { color: black; }')
      })

      afterEach(async () => {
        await rm(fixtureDir, { recursive: true, force: true })
      })

      test('Should serve the asset to a signed-out request without redirecting to sign-in', async () => {
        const { statusCode } = await server.inject({
          method: 'GET',
          url: '/public/stylesheets/test-fixture.css'
        })

        expect(statusCode).toBe(statusCodes.ok)
      })
    })
  })
})
