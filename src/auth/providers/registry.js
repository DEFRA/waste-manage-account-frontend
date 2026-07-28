// §2.6/AC-9: the single name → provider map. `service.js` and `router.js`
// resolve providers through here rather than importing provider modules
// directly, so adding a provider (AC-8) never touches either of those files.

import { DefraIdProvider } from './defra-id/index.js'
import { StubProvider } from './stub/index.js'

const PROVIDERS = {
  [DefraIdProvider.name]: DefraIdProvider,
  [StubProvider.name]: StubProvider
}

export function getProvider(name) {
  const provider = PROVIDERS[name]
  if (!provider) {
    throw new Error(`unknown auth provider: '${name}'`)
  }
  return provider
}

// Router route composition (spec §11 WI-4): every provider whose `enabled`
// check passes contributes its `extraRoutes()` to the app.
export function enabledProviders() {
  return Object.values(PROVIDERS).filter((provider) => provider.enabled())
}
