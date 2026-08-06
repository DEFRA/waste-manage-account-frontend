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
    doc: 'True when NODE_ENV=production: the app is running as a built artifact. This is every deployed CDP environment (including dev and test), not just the CDP prod environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'True when NODE_ENV=development: local development via `npm run dev`. Not the CDP dev environment, which runs the built artifact with NODE_ENV=production',
    format: Boolean,
    default: isDevelopment
  },
  isTest: {
    doc: 'True when NODE_ENV=test: the Vitest suite (vitest sets NODE_ENV=test itself). Not the CDP test environment, which runs the built artifact with NODE_ENV=production',
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
      // 'req.headers.cookie' covers every request cookie — the DEFRA ID
      // session cookie, bell's temporary state cookie, and yar's pre-auth
      // cookie — as one property, so no individual cookie name needs
      // listing here. 'res.headers' likewise covers any Set-Cookie on the
      // way out. See src/config/config.test.js#log.redact.
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
        default: '',
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
      default: '',
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
      // Left empty for environments running cdp-defra-id-stub, which rejects
      // the B2C-only `p` param. The real value is confirmed with the DEFRA ID
      // team during onboarding and also determines SSO grouping with other
      // services — set it only where a real tenant is in use.
      doc: 'DEFRA ID (Azure B2C) policy, sent as the `p` provider param when set — shared policy value groups SSO across services',
      format: String,
      default: '',
      env: 'DEFRA_ID_POLICY'
    },
    responseMode: {
      // Left empty for environments running cdp-defra-id-stub, which
      // rejects the param outright — its authorize schema (src/server/oidc/
      // helpers/schemas/login-validation.js) has no response_mode key and
      // isn't .unknown(true); stub PR #38 added a form_post branch to the
      // controller but left that schema untouched, so validation 400s
      // before the branch is reached. With the param omitted the stub
      // redirects back with query params on a GET, which is the only shape
      // anything downstream can consume today.
      // Real DEFRA ID (CIDM 2.0) behaves differently when the param is
      // omitted: per the Technical Onboarding Guide for Core Service
      // (§6.1), it defaults to form_post, POSTing the response to the
      // redirect_uri. Environments using a real tenant must therefore set
      // this explicitly — `query` for now, because nothing here is ready
      // for form_post: /auth/sign-in-oidc is GET-only, @hapi/bell reads
      // the response from request.query, crumb would reject the cross-site
      // POST, and bell's state cookie is SameSite=Lax so the browser
      // wouldn't send it. Once a POST callback exists, prefer form_post
      // (DEFRA's recommendation — keeps code/state out of URL logs).
      doc: 'OAuth2 response_mode provider param, sent only when set (e.g. form_post)',
      format: ['', 'query', 'form_post'],
      default: '',
      env: 'DEFRA_ID_RESPONSE_MODE'
    },
    scopes: {
      // A real DEFRA ID (Azure B2C) tenant additionally needs the client id
      // in this list for an access token to be issued (e.g.
      // "openid,offline_access,<client id>"); cdp-defra-id-stub rejects the
      // bare client id, so environments running the stub keep the default.
      // The app's own authorisation is unaffected either way — session scope
      // is derived from token claims in get-permissions.js.
      doc: 'OAuth2 scopes requested at sign-in, comma separated',
      format: Array,
      default: ['openid', 'offline_access'],
      env: 'DEFRA_ID_SCOPES'
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
