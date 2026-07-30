import convict from 'convict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import convictFormatWithValidator from 'convict-format-with-validator'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const thirtyMinutesMs = 1800000
const fourHoursMs = 14400000
const oneWeekMs = 604800000

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'

convict.addFormats(convictFormatWithValidator)

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 3000,
    env: 'PORT'
  },
  staticCacheTimeout: {
    doc: 'Static cache timeout in milliseconds',
    format: Number,
    default: oneWeekMs,
    env: 'STATIC_CACHE_TIMEOUT'
  },
  serviceName: {
    doc: 'Applications Service Name',
    format: String,
    default: 'waste-manage-account-frontend'
  },
  root: {
    doc: 'Project root',
    format: String,
    default: path.resolve(dirname, '../..')
  },
  assetPath: {
    doc: 'Asset path',
    format: String,
    default: '/public',
    env: 'ASSET_PATH'
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDevelopment
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  log: {
    enabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: process.env.NODE_ENV !== 'test',
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in.',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : [],
      env: 'LOG_REDACT'
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  session: {
    idleTtl: {
      doc: 'Session idle timeout in milliseconds — signs the user out after this period of inactivity',
      format: Number,
      default: thirtyMinutesMs,
      env: 'SESSION_IDLE_TTL'
    },
    absoluteTtl: {
      doc: 'Session absolute timeout in milliseconds — signs the user out this long after sign-in, regardless of activity',
      format: Number,
      default: fourHoursMs,
      env: 'SESSION_ABSOLUTE_TTL'
    },
    cache: {
      engine: {
        doc: 'backend cache is written to',
        format: ['redis', 'memory'],
        default: isProduction ? 'redis' : 'memory',
        env: 'SESSION_CACHE_ENGINE'
      },
      name: {
        doc: 'server side session cache name',
        format: String,
        default: 'session',
        env: 'SESSION_CACHE_NAME'
      },
      ttl: {
        doc: 'server side session cache ttl',
        format: Number,
        default: fourHoursMs,
        env: 'SESSION_CACHE_TTL'
      }
    },
    cookie: {
      ttl: {
        doc: 'Session cookie ttl',
        format: Number,
        default: fourHoursMs,
        env: 'SESSION_COOKIE_TTL'
      },
      password: {
        doc: 'session cookie password',
        format: String,
        default: 'the-password-must-be-at-least-32-characters-long',
        env: 'SESSION_COOKIE_PASSWORD',
        sensitive: true
      },
      secure: {
        doc: 'set secure flag on cookie',
        format: Boolean,
        default: isProduction,
        env: 'SESSION_COOKIE_SECURE'
      }
    }
  },
  defraId: {
    discoveryUrl: {
      // Port 3200 and the /cdp-defra-id-stub base path match the stub's own
      // published defaults (docker.io/defradigital/cdp-defra-id-stub) — see
      // https://github.com/DEFRA/cdp-defra-id-stub#oidc-url. `localhost:3200`
      // resolves both from a host-run `npm run dev` (compose publishes the
      // stub's port) and from the `your-frontend` container itself, which
      // compose.yml remaps via `extra_hosts: localhost:host-gateway` back to
      // the same published port — so this one default works unmodified in
      // both local dev modes.
      doc: 'DEFRA ID OIDC well-known discovery document URL',
      format: String,
      default:
        'http://localhost:3200/cdp-defra-id-stub/.well-known/openid-configuration',
      env: 'DEFRA_ID_DISCOVERY_URL'
    },
    clientId: {
      // Matches cdp-defra-id-stub's own default `oidc.clientId` so the stub
      // doesn't log an "Invalid client ID" warning on every sign-in.
      doc: 'DEFRA ID OAuth2 client id',
      format: String,
      default: '63983fc2-cfff-45bb-8ec2-959e21062b9a',
      env: 'DEFRA_ID_CLIENT_ID'
    },
    clientSecret: {
      // Must equal cdp-defra-id-stub's own default `oidc.clientSecret` —
      // unlike the client id, the stub's token endpoint rejects a mismatched
      // secret outright (401), so this exact value is required for local
      // sign-in to complete, not just cosmetic.
      doc: 'DEFRA ID OAuth2 client secret. No production default — deployed environments must supply this via a CDP secret.',
      format: String,
      default: 'test_value',
      sensitive: true,
      env: 'DEFRA_ID_CLIENT_SECRET'
    },
    serviceId: {
      doc: 'DEFRA ID registered service id',
      format: String,
      default: 'stub-service-id',
      env: 'DEFRA_ID_SERVICE_ID'
    },
    policy: {
      // Stub placeholder only — the real value is confirmed with the DEFRA ID team during onboarding and also determines SSO grouping with other services.
      doc: 'DEFRA ID policy (the `p` provider param) — shared policy value groups SSO across services',
      format: String,
      default: 'stub-policy',
      env: 'DEFRA_ID_POLICY'
    },
    callbackBaseUrl: {
      doc: 'Base URL this service is reachable on, used to build DEFRA ID sign-in/sign-out callback URLs',
      format: String,
      default: 'http://localhost:3000',
      env: 'DEFRA_ID_CALLBACK_BASE_URL'
    },
    refreshEnabled: {
      doc: 'Whether to transparently refresh expired tokens using the refresh token',
      format: Boolean,
      default: true,
      env: 'DEFRA_ID_REFRESH_ENABLED'
    },
    clockToleranceSeconds: {
      doc: 'Clock skew tolerance, in seconds, applied when checking token expiry',
      format: Number,
      default: 60,
      env: 'DEFRA_ID_CLOCK_TOLERANCE_SECONDS'
    },
    discoveryCacheTtlSeconds: {
      doc: 'How long, in seconds, to cache the fetched OIDC discovery document in memory',
      format: Number,
      default: 3600,
      env: 'DEFRA_ID_DISCOVERY_CACHE_TTL_SECONDS'
    },
    pkceEnabled: {
      doc: 'Whether to use PKCE (S256) for the OAuth2 authorisation code flow. Stays false until stub/tenant PKCE support is confirmed.',
      format: Boolean,
      default: false,
      env: 'DEFRA_ID_PKCE_ENABLED'
    },
    stubEnabled: {
      doc: 'Whether the app is running against the local cdp-defra-id-stub rather than a real DEFRA ID tenant',
      format: Boolean,
      default: !isProduction,
      env: 'DEFRA_ID_STUB_ENABLED'
    }
  },
  redis: {
    host: {
      doc: 'Redis cache host',
      format: String,
      default: '127.0.0.1',
      env: 'REDIS_HOST'
    },
    username: {
      doc: 'Redis cache username',
      format: String,
      default: '',
      env: 'REDIS_USERNAME'
    },
    password: {
      doc: 'Redis cache password',
      format: '*',
      default: '',
      sensitive: true,
      env: 'REDIS_PASSWORD'
    },
    keyPrefix: {
      doc: 'Redis cache key prefix name used to isolate the cached results across multiple clients',
      format: String,
      default: 'waste-manage-account-frontend:',
      env: 'REDIS_KEY_PREFIX'
    },
    useSingleInstanceCache: {
      doc: 'Connect to a single instance of redis instead of a cluster.',
      format: Boolean,
      default: !isProduction,
      env: 'USE_SINGLE_INSTANCE_CACHE'
    },
    useTLS: {
      doc: 'Connect to redis using TLS',
      format: Boolean,
      default: isProduction,
      env: 'REDIS_TLS'
    }
  },
  nunjucks: {
    watch: {
      doc: 'Reload templates when they are changed.',
      format: Boolean,
      default: isDevelopment
    },
    noCache: {
      doc: 'Use a cache and recompile templates each time',
      format: Boolean,
      default: isDevelopment
    }
  },
  tracing: {
    header: {
      doc: 'Which header to track',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  }
})

config.validate({ allowed: 'strict' })
