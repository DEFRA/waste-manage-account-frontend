import { vi } from 'vitest'

const mockReadFileSync = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('node:fs', async () => {
  const nodeFs = await import('node:fs')

  return {
    ...nodeFs,
    readFileSync: () => mockReadFileSync()
  }
})
vi.mock('../../../server/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ error: (...args) => mockLoggerError(...args) })
}))
vi.mock(import('#/config/config.js'), async (importOriginal) => {
  const originalModule = await importOriginal()
  return {
    config: {
      get(key) {
        if (key === 'isProduction') return true
        return originalModule.config.get(key)
      }
    }
  }
})

describe('context and cache', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
    mockLoggerError.mockReset()
    vi.resetModules()
  })

  describe('#context', () => {
    const mockRequest = { path: '/' }

    describe('When Vite manifest file read succeeds', () => {
      let contextImport
      let contextResult

      beforeAll(async () => {
        contextImport = await import('./context.js')
      })

      beforeEach(async () => {
        // Return JSON string
        mockReadFileSync.mockReturnValue(`{
        "application.js": "javascripts/application.js",
        "stylesheets/application.scss": "stylesheets/application.css"
      }`)

        contextResult = await contextImport.context(mockRequest)
      })

      test('Should provide expected context', () => {
        expect(contextResult).toEqual({
          assetPath: '/public/assets',
          auth: { isAuthenticated: false },
          breadcrumbs: [],
          getAssetPath: expect.any(Function),
          navigation: [
            {
              current: true,
              text: 'Home',
              href: '/'
            },
            {
              current: false,
              text: 'About',
              href: '/about'
            }
          ],
          serviceName: 'waste-manage-account-frontend',
          serviceUrl: '/'
        })
      })

      describe('With valid asset path', () => {
        test('Should provide expected asset path', () => {
          expect(contextResult.getAssetPath('application.js')).toBe(
            '/public/application.js'
          )
        })
      })

      describe('With invalid asset path', () => {
        test('Should provide expected asset', () => {
          expect(contextResult.getAssetPath('an-image.png')).toBe(
            '/public/an-image.png'
          )
        })
      })
    })

    describe('When Vite manifest file read fails', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('./context.js')
      })

      beforeEach(() => {
        mockReadFileSync.mockReturnValue(new Error('File not found'))

        contextImport.context(mockRequest)
      })

      test('Should log that the Vite Manifest file is not available', () => {
        expect(mockLoggerError).toHaveBeenCalledWith(
          'Vite manifest.json not found'
        )
      })
    })

    describe('When the request is authenticated', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('./context.js')
      })

      beforeEach(() => {
        mockReadFileSync.mockReturnValue(`{
        "application.js": "javascripts/application.js",
        "stylesheets/application.scss": "stylesheets/application.css"
      }`)
      })

      function authenticatedRequest(cacheGet) {
        return {
          path: '/',
          auth: {
            isAuthenticated: true,
            credentials: { sessionId: 'session-id' }
          },
          server: { app: { cache: { get: cacheGet } } }
        }
      }

      test('Should expose the signed-in flag and display name from the cached session', async () => {
        const cacheGet = vi
          .fn()
          .mockResolvedValue({ profile: { displayName: 'Ada Lovelace' } })

        const result = await contextImport.context(
          authenticatedRequest(cacheGet)
        )

        expect(cacheGet).toHaveBeenCalledWith('session-id')
        expect(result.auth).toEqual({
          isAuthenticated: true,
          displayName: 'Ada Lovelace'
        })
      })

      test('Should default to an empty display name when the cached session has none', async () => {
        const cacheGet = vi.fn().mockResolvedValue(undefined)

        const result = await contextImport.context(
          authenticatedRequest(cacheGet)
        )

        expect(result.auth).toEqual({
          isAuthenticated: true,
          displayName: ''
        })
      })

      test('Should degrade to signed-out without throwing when the cache read fails', async () => {
        const cacheGet = vi.fn().mockRejectedValue(new Error('cache down'))

        const result = await contextImport.context(
          authenticatedRequest(cacheGet)
        )

        expect(result.auth).toEqual({ isAuthenticated: false })
        expect(mockLoggerError).toHaveBeenCalledWith(
          expect.stringContaining(
            'Failed to load auth session for view context'
          )
        )
      })

      test('Should never expose token or claim fields from the cached session', async () => {
        const cacheGet = vi.fn().mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          idToken: 'id-token',
          scope: ['user'],
          profile: {
            crn: 'crn-1',
            organisationId: 'org-1',
            displayName: 'Ada Lovelace'
          }
        })

        const result = await contextImport.context(
          authenticatedRequest(cacheGet)
        )

        expect(result.auth).toEqual({
          isAuthenticated: true,
          displayName: 'Ada Lovelace'
        })
      })
    })
  })

  describe('#context cache', () => {
    const mockRequest = { path: '/' }
    let contextResult

    describe('Vite manifest file cache', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('./context.js')
      })

      beforeEach(async () => {
        // Return JSON string
        mockReadFileSync.mockReturnValue(`{
        "application.js": "javascripts/application.js",
        "stylesheets/application.scss": "stylesheets/application.css"
      }`)

        contextResult = await contextImport.context(mockRequest)
      })

      test('Should read file', () => {
        expect(mockReadFileSync).toHaveBeenCalled()
      })

      test('Should use cache', () => {
        expect(mockReadFileSync).not.toHaveBeenCalled()
      })

      test('Should provide expected context', () => {
        expect(contextResult).toEqual({
          assetPath: '/public/assets',
          auth: { isAuthenticated: false },
          breadcrumbs: [],
          getAssetPath: expect.any(Function),
          navigation: [
            {
              current: true,
              text: 'Home',
              href: '/'
            },
            {
              current: false,
              text: 'About',
              href: '/about'
            }
          ],
          serviceName: 'waste-manage-account-frontend',
          serviceUrl: '/'
        })
      })
    })
  })
})
