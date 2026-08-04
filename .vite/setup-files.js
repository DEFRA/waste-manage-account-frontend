import { vi } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

// Secrets have no defaults in src/config/config.js (they are supplied via
// environment variables in deployed environments and via .env locally).
// Tests never load .env, so provide well-known test values here before any
// test file imports the config.
process.env.SESSION_COOKIE_PASSWORD ??=
  'test-session-cookie-password-at-least-32-characters'
process.env.DEFRA_ID_CLIENT_SECRET ??= 'test_value'

const fetchMock = createFetchMock(vi)

fetchMock.enableMocks()
global.fetch = fetchMock

vi.mock('ioredis')
