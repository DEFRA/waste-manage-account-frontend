import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { bootstrap } from 'global-agent'

import { config } from '#/config/config.js'
import { setupProxy } from '#/server/common/helpers/setup-proxy.js'

vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),
  setGlobalDispatcher: vi.fn()
}))

vi.mock('global-agent', () => ({
  // Mirror the real bootstrap()'s observable side effect so the runtime
  // configuration assignment in setupProxy has something to write to.
  bootstrap: vi.fn(() => {
    global.GLOBAL_AGENT = { HTTP_PROXY: '' }
  })
}))

const proxyUrl = 'http://proxy.example.com:8080'

describe('#setupProxy', () => {
  afterEach(() => {
    config.set('httpProxy', null)
    delete global.GLOBAL_AGENT
    vi.clearAllMocks()
  })

  test('Should be a no-op when no proxy is configured (local dev)', () => {
    setupProxy()

    expect(setGlobalDispatcher).not.toHaveBeenCalled()
    expect(bootstrap).not.toHaveBeenCalled()
  })

  test('Should route undici/global fetch through the configured proxy', () => {
    config.set('httpProxy', proxyUrl)

    setupProxy()

    expect(ProxyAgent).toHaveBeenCalledExactlyOnceWith(proxyUrl)
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1)
  })

  test('Should route node core http (wreck/bell) through the configured proxy', () => {
    config.set('httpProxy', proxyUrl)

    setupProxy()

    expect(bootstrap).toHaveBeenCalledTimes(1)
    expect(global.GLOBAL_AGENT.HTTP_PROXY).toBe(proxyUrl)
  })
})
