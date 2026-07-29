import process from 'node:process'

import { startMockIdp } from '../test/helpers/mock-idp.js'

// Spec §11.2 demo: proves the full Defra ID journey with zero real
// credentials, then the exact same app code path works against real Defra ID
// by changing only environment variables. `src/config/index.js` reads
// process.env at import time, so every env var below is set BEFORE the
// dynamic import that pulls in the server — a static top-level import would
// already have evaluated (and cached) the config module against the wrong
// values.
// `||` (not `??`): a `.env` line like `PORT=` loads as an empty string,
// which must fall back to the default the same way an unset var does.
const APP_PORT = process.env.PORT || '3000'
const MOCK_IDP_PORT = 3939

async function main() {
  const mockIdp = await startMockIdp({ port: MOCK_IDP_PORT })

  // Force development semantics regardless of the invoking shell's
  // environment: NODE_ENV=test would trip the FR-6 auto-auth bypass and
  // skip the real OIDC flow this demo exists to exercise.
  process.env.NODE_ENV = 'development'
  process.env.PORT = APP_PORT
  process.env.AUTH_STUB_ENABLED = 'false'
  process.env.DEFRA_ID_DISCOVERY_URL = mockIdp.discoveryUrl
  // `||=` (not `??=`): blank `.env` entries (`DEFRA_ID_CLIENT_ID=`) load as
  // empty strings, which would defeat `??=` and then fail validateConfig().
  process.env.ENVIRONMENT ||= 'local'
  process.env.AUTH_CALLBACK_BASE_URL ||= `http://localhost:${APP_PORT}`
  process.env.SESSION_SECRET ||= 'demo-only-session-secret-not-for-real-use-00'
  process.env.DEFRA_ID_CLIENT_ID ||= 'demo-client'
  process.env.DEFRA_ID_CLIENT_SECRET ||= 'demo-client-secret'
  process.env.DEFRA_ID_SERVICE_ID ||= 'demo-service'

  const { createServer } = await import('../src/server.js')
  const server = await createServer()
  await server.start()

  console.log('')
  console.log('Defra ID demo running — zero real credentials (spec §11.2)')
  console.log(`  App:           http://localhost:${APP_PORT}/`)
  console.log(`  Mock Defra ID: ${mockIdp.url}`)
  console.log('')
  console.log('Personas available at the mock IdP persona picker:')
  for (const persona of mockIdp.personas) {
    console.log(`  - ${persona.label}`)
  }
  console.log('')
  console.log(
    `Open http://localhost:${APP_PORT}/ and follow the journey in README.md.`
  )
  console.log('Press Ctrl+C to stop the app and the mock IdP.')

  const shutdown = async () => {
    await Promise.allSettled([server.stop({ timeout: 10_000 }), mockIdp.stop()])
    process.exit(0)
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, shutdown)
  }
}

await main()
