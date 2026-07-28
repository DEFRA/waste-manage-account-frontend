import { afterEach, describe, expect, test, vi } from 'vitest'

const DEFRA_ID_ENV = {
  DEFRA_ID_DISCOVERY_URL:
    'https://idp.example/.well-known/openid-configuration',
  DEFRA_ID_CLIENT_ID: 'client-id',
  DEFRA_ID_CLIENT_SECRET: 'client-secret',
  DEFRA_ID_SERVICE_ID: 'service-id'
}

// config (read at import time) drives both providers' `enabled()`, so each
// combination needs a fresh module graph (same idiom used across auth/*.test.js).
async function importFresh(envOverrides = {}) {
  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  return import('./registry.js')
}

describe('providers/registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('getProvider', () => {
    test('resolves defra-id and stub by name', async () => {
      const { getProvider } = await importFresh()

      expect(getProvider('defra-id').name).toBe('defra-id')
      expect(getProvider('stub').name).toBe('stub')
    })

    test('throws on an unrecognised provider name (AC-8 seam: adding one is a registry entry away)', async () => {
      const { getProvider } = await importFresh()

      expect(() => getProvider('entra-id')).toThrow(
        /unknown auth provider: 'entra-id'/i
      )
    })
  })

  describe('enabledProviders', () => {
    test('only the stub when stub is on and Defra ID is unconfigured', async () => {
      const { enabledProviders } = await importFresh({
        AUTH_STUB_ENABLED: 'true'
      })

      expect(enabledProviders().map((provider) => provider.name)).toStrictEqual(
        ['stub']
      )
    })

    test('only defra-id when the stub is off and Defra ID is configured', async () => {
      const { enabledProviders } = await importFresh({
        AUTH_STUB_ENABLED: 'false',
        ...DEFRA_ID_ENV
      })

      expect(enabledProviders().map((provider) => provider.name)).toStrictEqual(
        ['defra-id']
      )
    })

    test('both when the stub is on and Defra ID is also configured (FR-6 escape hatch)', async () => {
      const { enabledProviders } = await importFresh({
        AUTH_STUB_ENABLED: 'true',
        ...DEFRA_ID_ENV
      })

      expect(
        enabledProviders()
          .map((provider) => provider.name)
          .sort()
      ).toStrictEqual(['defra-id', 'stub'])
    })

    test('neither when the stub is off and Defra ID is unconfigured', async () => {
      const { enabledProviders } = await importFresh({
        AUTH_STUB_ENABLED: 'false'
      })

      expect(enabledProviders()).toStrictEqual([])
    })
  })
})
