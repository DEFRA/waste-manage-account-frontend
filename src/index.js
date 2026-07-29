import process from 'node:process'

import { createServer } from './server.js'

const server = await createServer()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server
      .stop({ timeout: 10_000 })
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  })
}

process.on('unhandledRejection', (error) => {
  process.exitCode = 1
  throw error
})

await server.start()
