// Fail-fast boot validation of the spec §9 rule matrix. Pure function over a
// config object (rather than the environment) so tests can exercise every
// rule with literal configs.

const ENVIRONMENTS = ['local', 'dev', 'test', 'pre-prod', 'prod']
const HTTPS_REQUIRED_ENVIRONMENTS = ['pre-prod', 'prod']
const MIN_SESSION_SECRET_LENGTH = 32

// Required as a set whenever stub auth is off and the real OIDC flow runs.
const DEFRA_ID_REQUIRED = [
  ['DEFRA_ID_DISCOVERY_URL', 'discoveryUrl'],
  ['DEFRA_ID_CLIENT_ID', 'clientId'],
  ['DEFRA_ID_CLIENT_SECRET', 'clientSecret'],
  ['DEFRA_ID_SERVICE_ID', 'serviceId']
]

export function validateConfig(config) {
  const problems = []

  // An unrecognised value (e.g. ENVIRONMENT=production) would silently skip
  // every prod-only rule below, so it is itself a hard error.
  if (!ENVIRONMENTS.includes(config.environment)) {
    problems.push(
      `ENVIRONMENT must be one of ${ENVIRONMENTS.join(', ')}; got '${config.environment}'`
    )
  }

  // H-8: a misconfigured env var must never enable fake sign-in in prod.
  if (config.environment === 'prod' && config.auth.stubEnabled) {
    problems.push(
      'AUTH_STUB_ENABLED must be false when ENVIRONMENT is prod: stub auth would allow fake sign-in'
    )
  }

  for (const [envVar, key] of DEFRA_ID_REQUIRED) {
    if (!config.auth.stubEnabled && !config.defraId[key]) {
      problems.push(`${envVar} is required when AUTH_STUB_ENABLED is false`)
    }
  }

  // Sessions are real everywhere except under vitest (NODE_ENV=test).
  const secret = config.session.secret
  if (
    !config.isTest &&
    (!secret || secret.length < MIN_SESSION_SECRET_LENGTH)
  ) {
    problems.push(
      `SESSION_SECRET must be set to at least ${MIN_SESSION_SECRET_LENGTH} characters unless NODE_ENV is test`
    )
  }

  if (
    HTTPS_REQUIRED_ENVIRONMENTS.includes(config.environment) &&
    !config.auth.callbackBaseUrl.startsWith('https://')
  ) {
    problems.push(
      `AUTH_CALLBACK_BASE_URL must be an https:// URL when ENVIRONMENT is ${config.environment}`
    )
  }

  // Numeric env vars parse with Number.parseInt, so a typo arrives here as
  // NaN; catch it at boot rather than as a broken cookie/JWT policy later.
  const numeric = [
    ['SESSION_IDLE_TTL_MINUTES', config.session.idleTtlMinutes, 1],
    ['SESSION_ABSOLUTE_TTL_MINUTES', config.session.absoluteTtlMinutes, 1],
    [
      'DEFRA_ID_CLOCK_TOLERANCE_SECONDS',
      config.defraId.clockToleranceSeconds,
      0
    ],
    [
      'DEFRA_ID_DISCOVERY_CACHE_TTL_SECONDS',
      config.defraId.discoveryCacheTtlSeconds,
      1
    ]
  ]
  for (const [envVar, value, min] of numeric) {
    if (!Number.isInteger(value) || value < min) {
      problems.push(`${envVar} must be an integer >= ${min}; got '${value}'`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`)
  }
}
