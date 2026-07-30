import { vi } from 'vitest'

import { config } from '#/config/config.js'

const wellKnownDocument = {
  authorization_endpoint: 'https://defra-id.example/authorize',
  token_endpoint: 'https://defra-id.example/token',
  jwks_uri: 'https://defra-id.example/.well-known/jwks.json',
  end_session_endpoint: 'https://defra-id.example/logout'
}

function createFakeYar() {
  const store = new Map()

  return {
    set: (key, value) => store.set(key, value),
    get: (key, clear) => {
      const value = store.get(key)
      if (clear) {
        store.delete(key)
      }
      return value
    },
    clear: (key) => store.delete(key)
  }
}

describe('#getSignOutUrl', () => {
  beforeEach(() => {
    fetch.resetMocks()
    vi.resetModules()
  })

  test('Should build the end session URL with id_token_hint, post_logout_redirect_uri and state', async () => {
    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    const { getSignOutUrl } = await import('./get-sign-out-url.js')
    const request = { yar: createFakeYar() }

    const signOutUrl = await getSignOutUrl(request, 'the-id-token')

    const url = new URL(signOutUrl)
    expect(url.origin + url.pathname).toBe(
      wellKnownDocument.end_session_endpoint
    )
    expect(url.searchParams.get('id_token_hint')).toBe('the-id-token')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      `${config.get('defraId.callbackBaseUrl')}/auth/sign-out-oidc`
    )
    expect(url.searchParams.get('state')).toBeTruthy()
  })

  test('Should store a state value in yar that can be validated later', async () => {
    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    const { getSignOutUrl } = await import('./get-sign-out-url.js')
    const { validateState } = await import('./state.js')
    const request = { yar: createFakeYar() }

    const signOutUrl = await getSignOutUrl(request, 'the-id-token')
    const state = new URL(signOutUrl).searchParams.get('state')

    expect(validateState(request, state)).toBe(true)
  })

  test('Should generate a different state on each call', async () => {
    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    fetch.mockResponseOnce(JSON.stringify(wellKnownDocument))
    const { getSignOutUrl } = await import('./get-sign-out-url.js')
    const request = { yar: createFakeYar() }

    const firstUrl = new URL(await getSignOutUrl(request, 'the-id-token'))
    const secondUrl = new URL(await getSignOutUrl(request, 'the-id-token'))

    expect(firstUrl.searchParams.get('state')).not.toBe(
      secondUrl.searchParams.get('state')
    )
  })
})
