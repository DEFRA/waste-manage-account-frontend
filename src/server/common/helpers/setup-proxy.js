import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { bootstrap } from 'global-agent'

import { config } from '#/config/config.js'

/**
 * Routes all outbound HTTP through the CDP egress (squid) proxy, keyed off
 * the `httpProxy` config value (the HTTP_PROXY env var CDP injects into
 * deployed containers). Locally httpProxy is null, so this is a no-op and
 * the stub flow is unaffected.
 *
 * Must be called before any outbound request is made — in practice, before
 * `startServer()`, because the auth plugin fetches the OIDC discovery
 * document during registration.
 *
 * Two mechanisms are needed because the app has two HTTP clients:
 * https://github.com/DEFRA/cdp-node-frontend-template uses the same pair.
 */
export function setupProxy() {
  const proxyUrl = config.get('httpProxy')

  if (!proxyUrl) {
    return
  }

  // 1. undici — covers the global `fetch` used by get-oidc-config.js
  //    (discovery), verify-token.js (JWKS) and refresh-tokens.js (token
  //    endpoint). npm undici shares its global dispatcher with Node's
  //    built-in fetch via Symbol.for('undici.globalDispatcher.1'), so this
  //    single call proxies every fetch in the app without touching the
  //    call sites. NB: undici is deliberately pinned to the same major (7)
  //    as the copy bundled in Node 24 — undici 8 moved to a new dispatcher
  //    symbol, which would break this cross-instance sharing.
  setGlobalDispatcher(new ProxyAgent(proxyUrl))

  // 2. node core http/https — covers @hapi/wreck, which @hapi/bell uses
  //    for the authorisation-code → token exchange on sign-in. bootstrap()
  //    patches http.globalAgent/https.globalAgent, and assigning
  //    global.GLOBAL_AGENT.HTTP_PROXY afterwards is global-agent's
  //    documented runtime configuration (it applies to both http and
  //    https requests).
  bootstrap()
  global.GLOBAL_AGENT.HTTP_PROXY = proxyUrl
}
