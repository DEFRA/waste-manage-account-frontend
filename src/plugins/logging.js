import HapiPino from 'hapi-pino'

import { config } from '../config/index.js'

// Structured JSON logging via hapi-pino/pino (spec NFR4). Silenced under test
// so runner output stays readable; /health is ignored to keep platform
// liveness probes from flooding the logs.
export const logging = {
  plugin: HapiPino,
  options: {
    enabled: !config.isTest,
    level: config.logLevel,
    ignorePaths: ['/health'],
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers'],
      remove: true
    }
  }
}
