import process from 'node:process'

// All configuration comes from environment variables (spec NFR5); no secrets here.
// createServer() runs validateConfig() against this object at boot (spec §9).
const nodeEnv = process.env.NODE_ENV ?? 'development'
const environment = process.env.ENVIRONMENT ?? 'local'

// Env vars are strings: only the literal 'true' enables a flag, anything else
// disables it, and an unset var takes the given default.
function envFlag(value, defaultValue) {
  return value === undefined ? defaultValue : value === 'true'
}

export const config = {
  serviceName: 'waste-manage-account-frontend',
  environment,
  host: process.env.HOST ?? '0.0.0.0',
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',
  isTest: nodeEnv === 'test',
  auth: {
    // Stub sign-in defaults on everywhere except prod, where validateConfig()
    // hard-blocks it even when forced on (spec §9, H-8).
    stubEnabled: envFlag(process.env.AUTH_STUB_ENABLED, environment !== 'prod'),
    callbackBaseUrl:
      process.env.AUTH_CALLBACK_BASE_URL ?? 'http://localhost:3000'
  },
  session: {
    // No default: real environments must supply their own secret (spec §9).
    secret: process.env.SESSION_SECRET,
    idleTtlMinutes: Number.parseInt(
      process.env.SESSION_IDLE_TTL_MINUTES ?? '240',
      10
    ),
    absoluteTtlMinutes: Number.parseInt(
      process.env.SESSION_ABSOLUTE_TTL_MINUTES ?? '720',
      10
    ),
    cache: {
      name: process.env.SESSION_CACHE_NAME ?? 'session',
      // Session state must never live on the app server in production (spec §4):
      // Redis is the production default, in-process memory is local-only.
      engine:
        process.env.SESSION_CACHE_ENGINE ??
        (nodeEnv === 'production' ? 'redis' : 'memory')
    }
  },
  defraId: {
    // No defaults for the onboarding values: required whenever the stub is
    // off, enforced by validateConfig().
    discoveryUrl: process.env.DEFRA_ID_DISCOVERY_URL,
    clientId: process.env.DEFRA_ID_CLIENT_ID,
    clientSecret: process.env.DEFRA_ID_CLIENT_SECRET,
    serviceId: process.env.DEFRA_ID_SERVICE_ID,
    pkceEnabled: envFlag(process.env.DEFRA_ID_PKCE_ENABLED, true),
    clockToleranceSeconds: Number.parseInt(
      process.env.DEFRA_ID_CLOCK_TOLERANCE_SECONDS ?? '60',
      10
    ),
    discoveryCacheTtlSeconds: Number.parseInt(
      process.env.DEFRA_ID_DISCOVERY_CACHE_TTL_SECONDS ?? '3600',
      10
    ),
    // Option B (§6.4) is a roadmap extension; v1 keeps the id_token for
    // logout only.
    refreshEnabled: envFlag(process.env.DEFRA_ID_REFRESH_ENABLED, false)
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10)
  }
}
