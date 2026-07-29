import crypto from 'node:crypto'

import { afterEach, describe, expect, test } from 'vitest'

import {
  TokenVerificationError,
  verifyIdToken
} from '../../src/auth/verify-token.js'
import { startMockIdp } from './mock-idp.js'

// The mock IdP is a real loopback HTTP server (not a stubbed fetch), so
// these tests exercise the same wire format the app's genuine OIDC code path
// (discovery -> authorize -> token -> JWKS verification) will see.

function codeChallengeS256(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

async function authorizeAndExchange(
  idp,
  { personaId, clientId = 'client-123', tamper = false, codeVerifier } = {}
) {
  const nonce = 'test-nonce'
  const redirectUri = 'https://app.example/auth/callback'
  const state = 'test-state'
  const codeChallenge = codeVerifier
    ? codeChallengeS256(codeVerifier)
    : undefined

  const body = new URLSearchParams({
    personaId,
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    nonce,
    ...(tamper ? { tamper: 'true' } : {}),
    ...(codeChallenge
      ? { code_challenge: codeChallenge, code_challenge_method: 'S256' }
      : {})
  })

  const authorizeResponse = await fetch(idp.authorizeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual'
  })

  expect(authorizeResponse.status).toBe(302)
  const callbackUrl = new URL(authorizeResponse.headers.get('location'))
  const code = callbackUrl.searchParams.get('code')
  expect(callbackUrl.searchParams.get('state')).toBe(state)

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {})
  })

  const tokenResponse = await fetch(idp.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString()
  })

  return { tokenResponse, nonce, clientId, code }
}

describe('startMockIdp', () => {
  let idp

  afterEach(async () => {
    if (idp) {
      await idp.stop()
      idp = undefined
    }
  })

  test('serves discovery metadata pointing back at itself', async () => {
    idp = await startMockIdp()

    const response = await fetch(idp.discoveryUrl)
    const document = await response.json()

    expect(response.status).toBe(200)
    expect(document).toMatchObject({
      issuer: idp.url,
      authorization_endpoint: idp.authorizeUrl,
      token_endpoint: idp.tokenUrl,
      end_session_endpoint: idp.logoutUrl,
      jwks_uri: idp.jwksUri
    })
  })

  test('serves a JWKS containing only the real signing key', async () => {
    idp = await startMockIdp()

    const response = await fetch(idp.jwksUri)
    const jwks = await response.json()

    expect(response.status).toBe(200)
    expect(jwks.keys).toHaveLength(1)
    expect(jwks.keys[0]).toMatchObject({ kid: 'mock-idp-key', alg: 'RS256' })
  })

  test('GET /authorize renders a persona picker carrying request params through as hidden fields', async () => {
    idp = await startMockIdp()

    const authorizeUrl = new URL(idp.authorizeUrl)
    authorizeUrl.searchParams.set('client_id', 'client-123')
    authorizeUrl.searchParams.set(
      'redirect_uri',
      'https://app.example/auth/callback'
    )
    authorizeUrl.searchParams.set('state', 'test-state')

    const response = await fetch(authorizeUrl)
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('name="state" value="test-state"')
    for (const persona of idp.personas) {
      expect(html).toContain(persona.id)
    }
  })

  test('GET /authorize without required params is rejected', async () => {
    idp = await startMockIdp()

    const response = await fetch(idp.authorizeUrl)

    expect(response.status).toBe(400)
  })

  test('drives authorize -> token and issues an id_token that verifies against the mock JWKS', async () => {
    idp = await startMockIdp()
    const codeVerifier = 'a'.repeat(64)

    const { tokenResponse, nonce, clientId } = await authorizeAndExchange(idp, {
      personaId: idp.personas[0].id,
      codeVerifier
    })
    const tokenBody = await tokenResponse.json()

    expect(tokenResponse.status).toBe(200)
    expect(tokenBody.id_token).toEqual(expect.any(String))

    const claims = await verifyIdToken(tokenBody.id_token, {
      jwksUri: idp.jwksUri,
      issuer: idp.url,
      audience: clientId,
      nonce
    })

    expect(claims.sub).toBe('defra-amina-khan')
    expect(claims.relationships).toEqual([
      'rel-amina-1:org-acme:Acme Recycling Ltd',
      'rel-amina-2:org-beta:Beta Waste Ltd'
    ])
  })

  test('rejects an authorization code replay (single-use)', async () => {
    idp = await startMockIdp()
    const codeVerifier = 'b'.repeat(64)

    const { code, clientId } = await authorizeAndExchange(idp, {
      personaId: idp.personas[1].id,
      codeVerifier
    })

    const replayResponse = await fetch(idp.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: 'https://app.example/auth/callback',
        code_verifier: codeVerifier
      }).toString()
    })

    expect(replayResponse.status).toBe(400)
  })

  test('rejects a token exchange with the wrong PKCE code_verifier', async () => {
    idp = await startMockIdp()
    const clientId = 'client-123'
    const redirectUri = 'https://app.example/auth/callback'
    const correctVerifier = 'a'.repeat(64)
    const wrongVerifier = 'b'.repeat(64)

    const authorizeResponse = await fetch(idp.authorizeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        personaId: idp.personas[0].id,
        client_id: clientId,
        redirect_uri: redirectUri,
        state: 'test-state',
        nonce: 'test-nonce',
        code_challenge: codeChallengeS256(correctVerifier),
        code_challenge_method: 'S256'
      }).toString(),
      redirect: 'manual'
    })
    const code = new URL(
      authorizeResponse.headers.get('location')
    ).searchParams.get('code')

    const tokenResponse = await fetch(idp.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: wrongVerifier
      }).toString()
    })

    expect(tokenResponse.status).toBe(400)
  })

  test('the tamper toggle issues an id_token that fails signature verification', async () => {
    idp = await startMockIdp()
    const codeVerifier = 'c'.repeat(64)

    const { tokenResponse, nonce, clientId } = await authorizeAndExchange(idp, {
      personaId: idp.personas[2].id,
      tamper: true,
      codeVerifier
    })
    const tokenBody = await tokenResponse.json()

    expect(tokenResponse.status).toBe(200)
    await expect(
      verifyIdToken(tokenBody.id_token, {
        jwksUri: idp.jwksUri,
        issuer: idp.url,
        audience: clientId,
        nonce
      })
    ).rejects.toBeInstanceOf(TokenVerificationError)
  })

  test('GET /logout without a post_logout_redirect_uri renders a local signed-out page', async () => {
    idp = await startMockIdp()

    const response = await fetch(idp.logoutUrl)
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Signed out')
  })

  test('GET /logout with a post_logout_redirect_uri redirects, passing state through', async () => {
    idp = await startMockIdp()

    const logoutUrl = new URL(idp.logoutUrl)
    logoutUrl.searchParams.set(
      'post_logout_redirect_uri',
      'https://app.example/auth/signed-out'
    )
    logoutUrl.searchParams.set('state', 'logout-state')

    const response = await fetch(logoutUrl, { redirect: 'manual' })

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location'))
    expect(location.origin + location.pathname).toBe(
      'https://app.example/auth/signed-out'
    )
    expect(location.searchParams.get('state')).toBe('logout-state')
  })

  test('runs multiple concurrent instances on independent ephemeral ports', async () => {
    const first = await startMockIdp()
    const second = await startMockIdp()

    try {
      expect(first.url).not.toBe(second.url)
    } finally {
      await Promise.all([first.stop(), second.stop()])
    }
  })
})
