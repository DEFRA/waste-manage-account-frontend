import process from 'node:process'

import { setupProxy } from '#/server/common/helpers/setup-proxy.js'
import { startServer } from '#/server/common/helpers/start-server.js'
import { createLogger } from '#/server/common/helpers/logging/logger.js'

// Must run before startServer(): the auth plugin fetches the OIDC discovery
// document while registering, so the egress proxy has to be wired up before
// the first outbound call. No-ops locally, where httpProxy is null.
setupProxy()

await startServer()

process.on('unhandledRejection', (error) => {
  const logger = createLogger()
  logger.info('Unhandled rejection')
  logger.error(error)
  process.exitCode = 1
})
