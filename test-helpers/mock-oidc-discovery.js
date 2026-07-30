export const oidcDiscoveryDocument = {
  authorization_endpoint: 'https://defra-id.example/authorize',
  token_endpoint: 'https://defra-id.example/token',
  jwks_uri: 'https://defra-id.example/.well-known/jwks.json',
  end_session_endpoint: 'https://defra-id.example/logout'
}

/**
 * Queues a mocked fetch response for the OIDC discovery document that
 * `createServer()` fetches at startup to register the bell `defra-id`
 * strategy — needed by every test that spins up a real server, since the
 * global fetch mock otherwise returns an empty body and fails discovery.
 */
export function mockOidcDiscovery() {
  fetch.mockResponseOnce(JSON.stringify(oidcDiscoveryDocument))
}
