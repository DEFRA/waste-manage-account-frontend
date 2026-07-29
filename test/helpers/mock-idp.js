import crypto from 'node:crypto'
import http from 'node:http'

import { SignJWT, exportJWK, generateKeyPair } from 'jose'

// Spec §11.1: a self-contained mock of Defra ID — issuer, `/authorize`
// persona picker, `/token`, `/jwks`, `/logout` — reachable over a real
// loopback HTTP connection rather than a stubbed fetch, so the app's genuine
// OIDC code path (discovery, PKCE, JWKS verification, token exchange) runs
// completely unmodified against it. Reused by the §13 integration suite and
// (later) the `npm run demo` script: the only difference between "point at
// this mock" and "point at real CPDEV" is DEFRA_ID_DISCOVERY_URL + creds.
// Signing keys are generated fresh per instance, so nothing leaks across
// test files or processes.

const KID = 'mock-idp-key'
const ID_TOKEN_TTL_SECONDS = 300
const AUTHORIZATION_CODE_TTL_MS = 60_000

// Defra-shaped personas (raw id_token claims, not the app's parsed profile
// shape) covering the org-membership fixtures the §13 integration tests need:
// multi-org, single-org, and no-org-at-all.
const PERSONAS = [
  {
    id: 'amina-khan',
    label: 'Amina Khan — Acme Recycling Ltd + Beta Waste Ltd',
    claims: {
      sub: 'defra-amina-khan',
      email: 'amina.khan@example.test',
      firstName: 'Amina',
      lastName: 'Khan',
      contactId: 'contact-amina-khan',
      currentRelationshipId: 'rel-amina-1',
      relationships: [
        'rel-amina-1:org-acme:Acme Recycling Ltd',
        'rel-amina-2:org-beta:Beta Waste Ltd'
      ],
      roles: []
    }
  },
  {
    id: 'ben-carter',
    label: 'Ben Carter — Gamma Skips Ltd',
    claims: {
      sub: 'defra-ben-carter',
      email: 'ben.carter@example.test',
      firstName: 'Ben',
      lastName: 'Carter',
      contactId: 'contact-ben-carter',
      currentRelationshipId: 'rel-ben-1',
      relationships: ['rel-ben-1:org-gamma:Gamma Skips Ltd'],
      roles: ['submitter']
    }
  },
  {
    id: 'chidi-okoro',
    label: 'Chidi Okoro — no organisation relationships',
    claims: {
      sub: 'defra-chidi-okoro',
      email: 'chidi.okoro@example.test',
      firstName: 'Chidi',
      lastName: 'Okoro',
      contactId: 'contact-chidi-okoro',
      currentRelationshipId: null,
      relationships: [],
      roles: []
    }
  }
]

function codeChallengeS256(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendHtml(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
}

function sendRedirect(res, location) {
  res.writeHead(302, { location })
  res.end()
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Carries every OIDC request param straight through the persona-picker form
// as hidden fields (no server-side state for the GET->POST hop), so whatever
// /auth/login sent — client_id, redirect_uri, state, nonce, code_challenge,
// code_challenge_method, scope, serviceId, forceReselection, relationshipId
// — reaches the POST handler unchanged. Plain HTML form, no client-side JS.
function personaPickerPage(authorizeParams) {
  const hiddenFields = Object.entries(authorizeParams)
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
    )
    .join('\n')

  const personaOptions = PERSONAS.map(
    (persona) =>
      `<label><input type="radio" name="personaId" value="${persona.id}"> ${escapeHtml(persona.label)}</label><br>`
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head><title>Mock Defra ID</title></head>
<body>
<h1>Mock Defra ID — choose a persona</h1>
<form method="POST" action="/authorize">
${hiddenFields}
${personaOptions}
<label><input type="checkbox" name="tamper" value="true"> Issue a tampered id_token (signature will not verify)</label><br>
<button type="submit">Continue</button>
</form>
</body>
</html>`
}

function loggedOutPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head><title>Mock Defra ID — signed out</title></head>
<body><h1>Signed out of the mock Defra ID</h1></body>
</html>`
}

// Starts the mock on an ephemeral loopback port by default (port: 0) so
// concurrent test files never collide; the demo script can pass a fixed port.
export async function startMockIdp({ port = 0 } = {}) {
  const [signingKeyPair, tamperKeyPair] = await Promise.all([
    generateKeyPair('RS256'),
    generateKeyPair('RS256')
  ])
  const publicJwk = await exportJWK(signingKeyPair.publicKey)

  // code -> { personaId, tamper, clientId, redirectUri, nonce, codeChallenge, codeChallengeMethod, expiresAt }
  const authorizationCodes = new Map()

  // Mutable holder rather than a reassigned `let`: the request handlers
  // below close over this reference and are wired up before the server's
  // ephemeral port (and therefore its base URL) is known.
  const idpState = { baseUrl: undefined }

  // The "tamper" toggle (spec §11.3 acceptance criterion) signs with a key
  // that is never published at /jwks, using the same `kid` header as the real
  // key — reproducing a genuine "wrong signing key" failure rather than a
  // "kid not found" one, so the app's normal JWKS-verification path rejects it.
  async function issueIdToken({ personaId, tamper, clientId, nonce }) {
    const persona = PERSONAS.find((candidate) => candidate.id === personaId)
    const now = Math.floor(Date.now() / 1000)
    const signingKey = tamper
      ? tamperKeyPair.privateKey
      : signingKeyPair.privateKey

    return new SignJWT({ ...persona.claims, nonce })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(idpState.baseUrl)
      .setAudience(clientId)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + ID_TOKEN_TTL_SECONDS)
      .sign(signingKey)
  }

  function handleDiscovery(res) {
    sendJson(res, 200, {
      issuer: idpState.baseUrl,
      authorization_endpoint: `${idpState.baseUrl}/authorize`,
      token_endpoint: `${idpState.baseUrl}/token`,
      end_session_endpoint: `${idpState.baseUrl}/logout`,
      jwks_uri: `${idpState.baseUrl}/jwks`
    })
  }

  function handleJwks(res) {
    // Only the real key is ever published — the tamper key deliberately
    // never appears here (see issueIdToken above).
    sendJson(res, 200, {
      keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }]
    })
  }

  function handleAuthorizeGet(url, res) {
    const params = Object.fromEntries(url.searchParams)
    if (!params.client_id || !params.redirect_uri || !params.state) {
      return sendHtml(
        res,
        400,
        'missing required authorize parameter(s): client_id, redirect_uri, state'
      )
    }
    return sendHtml(res, 200, personaPickerPage(params))
  }

  async function handleAuthorizePost(req, res) {
    const body = new URLSearchParams(await readRequestBody(req))
    const personaId = body.get('personaId')
    const clientId = body.get('client_id')
    const redirectUri = body.get('redirect_uri')
    const state = body.get('state')

    if (!PERSONAS.some((persona) => persona.id === personaId)) {
      return sendHtml(res, 400, `unknown personaId: ${personaId}`)
    }
    if (!clientId || !redirectUri || !state) {
      return sendHtml(
        res,
        400,
        'missing required authorize parameter(s): client_id, redirect_uri, state'
      )
    }

    const code = crypto.randomBytes(32).toString('base64url')
    authorizationCodes.set(code, {
      personaId,
      tamper: body.get('tamper') === 'true',
      clientId,
      redirectUri,
      nonce: body.get('nonce') ?? undefined,
      codeChallenge: body.get('code_challenge') ?? undefined,
      codeChallengeMethod: body.get('code_challenge_method') ?? undefined,
      expiresAt: Date.now() + AUTHORIZATION_CODE_TTL_MS
    })

    const redirectLocation = new URL(redirectUri)
    redirectLocation.searchParams.set('code', code)
    redirectLocation.searchParams.set('state', state)
    return sendRedirect(res, redirectLocation.toString())
  }

  async function handleToken(req, res) {
    const body = new URLSearchParams(await readRequestBody(req))
    if (body.get('grant_type') !== 'authorization_code') {
      return sendJson(res, 400, { error: 'unsupported_grant_type' })
    }

    const code = body.get('code')
    const record = code ? authorizationCodes.get(code) : undefined
    // Codes are single-use (mirrors the real token endpoint, spec §6.3):
    // consumed immediately regardless of what happens next in this request,
    // so a replayed callback always finds nothing left to spend.
    if (record) {
      authorizationCodes.delete(code)
    }
    if (!record || record.expiresAt < Date.now()) {
      return sendJson(res, 400, { error: 'invalid_grant' })
    }

    if (record.codeChallenge) {
      const codeVerifier = body.get('code_verifier')
      if (
        !codeVerifier ||
        codeChallengeS256(codeVerifier) !== record.codeChallenge
      ) {
        return sendJson(res, 400, { error: 'invalid_grant' })
      }
    }

    const idToken = await issueIdToken({
      personaId: record.personaId,
      tamper: record.tamper,
      clientId: record.clientId,
      nonce: record.nonce
    })

    return sendJson(res, 200, {
      token_type: 'Bearer',
      id_token: idToken,
      access_token: `mock-access-token-${code}`,
      refresh_token: `mock-refresh-token-${code}`,
      expires_in: ID_TOKEN_TTL_SECONDS
    })
  }

  function handleLogout(url, res) {
    const postLogoutRedirectUri = url.searchParams.get(
      'post_logout_redirect_uri'
    )
    if (!postLogoutRedirectUri) {
      return sendHtml(res, 200, loggedOutPage())
    }
    const redirectLocation = new URL(postLogoutRedirectUri)
    const state = url.searchParams.get('state')
    if (state) {
      redirectLocation.searchParams.set('state', state)
    }
    return sendRedirect(res, redirectLocation.toString())
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url, idpState.baseUrl)

    if (
      url.pathname === '/.well-known/openid-configuration' &&
      req.method === 'GET'
    ) {
      return handleDiscovery(res)
    }
    if (url.pathname === '/jwks' && req.method === 'GET') {
      return handleJwks(res)
    }
    if (url.pathname === '/authorize' && req.method === 'GET') {
      return handleAuthorizeGet(url, res)
    }
    if (url.pathname === '/authorize' && req.method === 'POST') {
      return handleAuthorizePost(req, res)
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      return handleToken(req, res)
    }
    if (url.pathname === '/logout' && req.method === 'GET') {
      return handleLogout(url, res)
    }

    res.writeHead(404)
    res.end()
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({ error: 'mock_idp_error', message: error.message })
      )
    })
  })

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  idpState.baseUrl = `http://127.0.0.1:${server.address().port}`
  const { baseUrl } = idpState

  return {
    url: baseUrl,
    discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
    authorizeUrl: `${baseUrl}/authorize`,
    tokenUrl: `${baseUrl}/token`,
    jwksUri: `${baseUrl}/jwks`,
    logoutUrl: `${baseUrl}/logout`,
    personas: PERSONAS.map(({ id, label }) => ({ id, label })),
    async stop() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }
}
