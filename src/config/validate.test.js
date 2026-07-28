import { afterEach, describe, expect, test, vi } from 'vitest'

import { validateConfig } from './validate.js'

// A fully valid non-test config (stub off, real Defra ID values) that each
// test breaks in exactly one way, proving the rule under test is what fired.
function validConfig(overrides = {}) {
  return {
    environment: 'dev',
    isTest: false,
    auth: {
      stubEnabled: false,
      callbackBaseUrl: 'http://localhost:3000'
    },
    session: {
      secret: 'a'.repeat(32),
      idleTtlMinutes: 240,
      absoluteTtlMinutes: 720
    },
    defraId: {
      discoveryUrl:
        'https://idp.example/tenant/policy/v2.0/.well-known/openid-configuration',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      serviceId: 'service-id',
      clockToleranceSeconds: 60,
      discoveryCacheTtlSeconds: 3600
    },
    rateLimit: {
      windowSeconds: 60,
      maxRequests: 20
    },
    ...overrides
  }
}

// config/index.js reads env at import time, so env-driven cases re-import it
// with a fresh module graph after stubbing (same idiom as server.test.js).
async function importConfigFromEnv() {
  vi.resetModules()
  const { config } = await import('./index.js')
  return config
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('validateConfig', () => {
  test('accepts a valid stub-off configuration', () => {
    expect(() => validateConfig(validConfig())).not.toThrow()
  })

  test('accepts a stub-on configuration with no Defra ID values', () => {
    const config = validConfig({
      auth: { stubEnabled: true, callbackBaseUrl: 'http://localhost:3000' }
    })
    config.defraId.discoveryUrl = undefined
    config.defraId.clientId = undefined
    config.defraId.clientSecret = undefined
    config.defraId.serviceId = undefined

    expect(() => validateConfig(config)).not.toThrow()
  })

  test('rejects an unknown ENVIRONMENT so prod-only rules cannot be skipped by a typo', () => {
    const config = validConfig({ environment: 'production' })
    config.auth.callbackBaseUrl = 'https://service.example'

    expect(() => validateConfig(config)).toThrow(
      /ENVIRONMENT must be one of local, dev, test, pre-prod, prod/
    )
  })

  test('hard-errors when stub auth is forced on in prod (H-8)', () => {
    const config = validConfig({ environment: 'prod' })
    config.auth.stubEnabled = true
    config.auth.callbackBaseUrl = 'https://service.example'

    expect(() => validateConfig(config)).toThrow(
      /AUTH_STUB_ENABLED must be false when ENVIRONMENT is prod/
    )
  })

  test.each([
    ['DEFRA_ID_DISCOVERY_URL', 'discoveryUrl'],
    ['DEFRA_ID_CLIENT_ID', 'clientId'],
    ['DEFRA_ID_CLIENT_SECRET', 'clientSecret'],
    ['DEFRA_ID_SERVICE_ID', 'serviceId']
  ])('requires %s when the stub is off', (envVar, key) => {
    const config = validConfig()
    config.defraId[key] = undefined

    expect(() => validateConfig(config)).toThrow(
      new RegExp(`${envVar} is required when AUTH_STUB_ENABLED is false`)
    )
  })

  test('does not require Defra ID values when the stub is on', () => {
    const config = validConfig()
    config.auth.stubEnabled = true
    config.defraId.clientSecret = undefined

    expect(() => validateConfig(config)).not.toThrow()
  })

  test('requires SESSION_SECRET outside NODE_ENV=test', () => {
    const config = validConfig()
    config.session.secret = undefined

    expect(() => validateConfig(config)).toThrow(
      /SESSION_SECRET must be set to at least 32 characters/
    )
  })

  test('rejects a SESSION_SECRET shorter than 32 characters', () => {
    const config = validConfig()
    config.session.secret = 'a'.repeat(31)

    expect(() => validateConfig(config)).toThrow(/SESSION_SECRET/)
  })

  test('waives SESSION_SECRET under NODE_ENV=test', () => {
    const config = validConfig({ isTest: true })
    config.session.secret = undefined

    expect(() => validateConfig(config)).not.toThrow()
  })

  test.each(['pre-prod', 'prod'])(
    'requires an https callback base URL in %s',
    (environment) => {
      const config = validConfig({ environment })

      expect(() => validateConfig(config)).toThrow(
        new RegExp(
          `AUTH_CALLBACK_BASE_URL must be an https:// URL when ENVIRONMENT is ${environment}`
        )
      )
    }
  )

  test('allows an http callback base URL in local/dev', () => {
    expect(() => validateConfig(validConfig())).not.toThrow()
  })

  test.each([
    'SESSION_IDLE_TTL_MINUTES',
    'SESSION_ABSOLUTE_TTL_MINUTES',
    'DEFRA_ID_CLOCK_TOLERANCE_SECONDS',
    'DEFRA_ID_DISCOVERY_CACHE_TTL_SECONDS',
    'AUTH_RATE_LIMIT_WINDOW_SECONDS',
    'AUTH_RATE_LIMIT_MAX'
  ])('rejects a non-numeric %s (NaN after parseInt)', (envVar) => {
    const byVar = {
      SESSION_IDLE_TTL_MINUTES: (c) => {
        c.session.idleTtlMinutes = Number.NaN
      },
      SESSION_ABSOLUTE_TTL_MINUTES: (c) => {
        c.session.absoluteTtlMinutes = Number.NaN
      },
      DEFRA_ID_CLOCK_TOLERANCE_SECONDS: (c) => {
        c.defraId.clockToleranceSeconds = Number.NaN
      },
      DEFRA_ID_DISCOVERY_CACHE_TTL_SECONDS: (c) => {
        c.defraId.discoveryCacheTtlSeconds = Number.NaN
      },
      AUTH_RATE_LIMIT_WINDOW_SECONDS: (c) => {
        c.rateLimit.windowSeconds = Number.NaN
      },
      AUTH_RATE_LIMIT_MAX: (c) => {
        c.rateLimit.maxRequests = Number.NaN
      }
    }
    const config = validConfig()
    byVar[envVar](config)

    expect(() => validateConfig(config)).toThrow(
      new RegExp(`${envVar} must be an integer`)
    )
  })

  test('reports every violation at once for a single fix-up pass', () => {
    const config = validConfig({ environment: 'prod' })
    config.auth.stubEnabled = true
    config.session.secret = 'short'

    expect(() => validateConfig(config)).toThrow(
      /AUTH_STUB_ENABLED[\s\S]*SESSION_SECRET/
    )
  })
})

describe('config defaults composed with validateConfig', () => {
  test('the bare test environment (no auth vars set) is valid', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENVIRONMENT', undefined)
    vi.stubEnv('AUTH_STUB_ENABLED', undefined)
    vi.stubEnv('SESSION_SECRET', undefined)
    const config = await importConfigFromEnv()

    expect(config.environment).toBe('local')
    expect(config.auth.stubEnabled).toBe(true)
    expect(config.defraId.pkceEnabled).toBe(true)
    expect(config.defraId.refreshEnabled).toBe(false)
    expect(config.session.idleTtlMinutes).toBe(240)
    expect(config.session.absoluteTtlMinutes).toBe(720)
    expect(config.defraId.clockToleranceSeconds).toBe(60)
    expect(config.defraId.discoveryCacheTtlSeconds).toBe(3600)
    expect(config.rateLimit.windowSeconds).toBe(60)
    expect(config.rateLimit.maxRequests).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => validateConfig(config)).not.toThrow()
  })

  test('stub auth defaults off in prod and forcing it on is rejected end to end', async () => {
    vi.stubEnv('ENVIRONMENT', 'prod')
    vi.stubEnv('AUTH_STUB_ENABLED', undefined)
    expect((await importConfigFromEnv()).auth.stubEnabled).toBe(false)

    vi.stubEnv('AUTH_STUB_ENABLED', 'true')
    const forced = await importConfigFromEnv()
    expect(() => validateConfig(forced)).toThrow(/AUTH_STUB_ENABLED/)
  })

  test('flag parsing treats only the literal string true as true', async () => {
    vi.stubEnv('DEFRA_ID_PKCE_ENABLED', 'TRUE')
    vi.stubEnv('DEFRA_ID_REFRESH_ENABLED', 'true')
    const config = await importConfigFromEnv()

    expect(config.defraId.pkceEnabled).toBe(false)
    expect(config.defraId.refreshEnabled).toBe(true)
  })
})
