# Defra ID Integration Specification

**Version:** 1.0 · **Date:** 22 July 2026 · **Author:** drafted for Ibrahim Uylas
**Status:** Draft for review

A framework-agnostic specification for integrating **Defra ID** (Defra's Customer Identity platform, an Azure AD B2C-based OpenID Connect provider) into a web application, based on the working implementation in `epr-register-enrol-frontend`, with security improvements applied.

---

## 1. Purpose and scope

### 1.1 Goal

Allow external users ("operators" / customers) to sign in to the service using their Defra ID account, establish an application session from the verified identity, expose the user's organisation relationships to the application, and support federated logout.

### 1.2 In scope

- OIDC Authorization Code flow (confidential client) against Defra ID
- OIDC discovery, JWKS-based `id_token` verification
- Application session management (server-side session + cookie)
- Organisation relationship parsing and authorisation checks
- Federated logout (RP-initiated logout)
- Stub/local auth mode for development and automated tests
- Full configurability of secrets and environment-specific values
- Demo flow (see §11)

### 1.3 Out of scope

- Calling downstream APIs with the Defra ID access token (noted as an extension in §12)
- Multi-provider setups (e.g. an additional Entra ID login for internal staff) — the architecture supports adding one later using the same pattern
- Defra ID onboarding paperwork (client registration, redirect URI allow-listing, service ID issuance) — a prerequisite, see §3

### 1.4 Definitions

| Term             | Meaning                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| **Defra ID**     | Defra's Customer Identity platform (CUI/IDPhub), an Azure AD B2C custom-policy IdP exposing OIDC |
| **RP**           | Relying Party — your web application                                                             |
| **Relationship** | Defra ID's link between a user and an organisation, delivered as a claim                         |
| **Service ID**   | Identifier issued to your service during Defra ID onboarding; passed on the authorize request    |
| **Stub mode**    | Local fake login (no real IdP) for development/tests                                             |

---

## 2. Architecture overview

> **Note (28 Jul 2026):** the flow below is the original, correct description
> of _what_ the app does and _why_. _Where_ the code that does it now lives
> was restructured by `specs/003-auth-refactor.md` into layered
> `core/`/`clients/oidc/`/`providers/defra-id/`/`service.js` modules with a
> provider registry — see that spec §2 for the current file layout and
> import-direction rules. This section is kept as the historical record of
> the flow's design and is not updated for the refactor.

```
┌────────────┐   1. GET /auth/login          ┌──────────────────────┐
│            │──────────────────────────────▶│                      │
│  Browser   │   2. 302 → authorize URL      │   Your web app (RP)  │
│            │◀──────────────────────────────│                      │
│            │                               │  - session store     │
│            │   3. authorize (login UI)     │  - OIDC client       │
│            │──────────────┐                │  - JWKS cache        │
│            │              ▼                └──────────┬───────────┘
│            │   ┌─────────────────────┐               │
│            │   │      Defra ID       │  5. POST code │ 6. GET JWKS
│            │   │  (Azure B2C / CUI)  │◀──────────────┤
│            │   └─────────────────────┘  ──tokens──▶  │
│            │   4. 302 → /auth/callback?code&state    │
│            │──────────────────────────────▶ verify id_token,
│            │   7. Set session cookie,       build session
│            │      302 → /
└────────────┘
```

Key architectural decisions (carried over from the reference implementation, all validated in production use):

1. **Server-side sessions, not JWT-in-cookie.** After the OIDC exchange, the verified profile is stored in a server-side session; the browser only holds an opaque session cookie. Tokens never reach the browser.
2. **Deny by default.** Every route requires an authenticated session unless explicitly marked public (health check, static assets, the auth endpoints themselves).
3. **OIDC discovery, not hard-coded endpoints.** Only the discovery document URL is configured; `authorization_endpoint`, `token_endpoint`, `end_session_endpoint`, `jwks_uri` and `issuer` are read from it. This makes environment switches (CPDEV → CPTEST → pre-prod → prod) a one-variable change.
4. **Full local verification of the `id_token`** (signature via JWKS, issuer, audience, expiry, nonce) — the app never trusts the token endpoint response blind.
5. **Pluggable auth strategy** so that stub mode can replace the real flow wholesale in dev/test without touching business routes.

---

## 3. Prerequisites (Defra ID onboarding)

Before the real flow can work in any shared environment you must have, per environment:

- a **client ID** and **client secret** (confidential client registration)
- a **service ID** (issued at onboarding; sent as `serviceId` on the authorize request)
- your **redirect URI(s)** (`{BASE_URL}/auth/callback`) registered with Defra ID
- your **post-logout redirect URI** (`{BASE_URL}/auth/signed-out` or equivalent) registered
- the **discovery URL** for that environment, e.g.:

| Environment | Discovery URL pattern                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| CPDEV       | `https://<account>.cpdev.cui.defra.gov.uk/idphub/b2c/b2c_1a_cui_cpdev_signupsignin/.well-known/openid-configuration` |
| CPTEST      | `https://<account>.cptst.cui.defra.gov.uk/idphub/b2c/b2c_1a_cui_signupsignin/.well-known/openid-configuration`       |
| Pre-prod    | `https://<account>.pre.cui.defra.gov.uk/idphub/b2c/b2c_1a_cui_signupsignin/.well-known/openid-configuration`         |
| Prod        | `https://<account>.defra.gov.uk/idphub/b2c/b2c_1a_cui_signupsignin/.well-known/openid-configuration`                 |

> None of these values may be hard-coded. All are configuration (§9). Client ID and secret are secrets.

---

## 4. Functional requirements

### FR-1 Login initiation — `GET /auth/login`

Public route. On request the app MUST:

1. Load provider endpoints via discovery (§6.1).
2. Generate three cryptographically random values: `state` (CSRF binding), `nonce` (token replay binding), and a **PKCE** `code_verifier` (43–128 chars) with its S256 `code_challenge`.
3. Store `state`, `nonce`, `code_verifier`, and an optional `returnTo` path in the (pre-auth) session.
4. Redirect (302) to the `authorization_endpoint` with:

| Parameter                       | Value                                    |
| ------------------------------- | ---------------------------------------- |
| `client_id`                     | configured client ID                     |
| `serviceId`                     | configured Defra ID service ID           |
| `response_type`                 | `code`                                   |
| `redirect_uri`                  | `{AUTH_CALLBACK_BASE_URL}/auth/callback` |
| `scope`                         | `openid offline_access {client_id}`      |
| `state`                         | generated state                          |
| `nonce`                         | generated nonce                          |
| `code_challenge`                | S256 challenge                           |
| `code_challenge_method`         | `S256`                                   |
| `forceReselection` _(optional)_ | `true` to force the organisation picker  |
| `relationshipId` _(optional)_   | pre-select a specific relationship       |

Notes:

- The scope set follows B2C conventions: `openid` yields the `id_token`, `offline_access` yields a refresh token, and the client ID as a scope yields an access token for your own API surface.
- **Improvement over reference:** the reference project uses PKCE for its Entra ID flow but not for Defra ID. Defra ID's B2C policies accept PKCE for confidential clients; this spec REQUIRES it (defence in depth on top of the client secret). If a target Defra ID environment rejects PKCE parameters, make it a config switch (`DEFRA_ID_PKCE_ENABLED`, default `true`) rather than removing it.

### FR-2 Callback — `GET /auth/callback`

Public route (the IdP redirect must reach it). On request the app MUST, in order, and MUST fail closed (redirect to `/auth/login`, optionally with a generic error flash — never leak detail) at any failed step:

1. **Validate `state`:** `state` query param present and strictly equal to the stored value. Clear stored `state`/`nonce`/`code_verifier` immediately after reading them (single-use).
2. **Handle IdP errors:** if `error` is present (e.g. `access_denied` when the user cancels), abort cleanly to a friendly page — do not attempt the code exchange.
3. **Exchange the code:** `POST` to `token_endpoint` (`application/x-www-form-urlencoded`) with `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `redirect_uri` (identical to FR-1), `code_verifier`, and `scope`.
4. **Verify the `id_token`** (§6.2). Reject if absent.
5. **Build the user profile** from verified claims (§5) and derive `scope`/roles for authorisation.
6. **Regenerate the session ID** (session-fixation defence — see §7), then store the profile, the raw `id_token` (needed only as `id_token_hint` at logout), and — if token refresh is implemented — the `refresh_token` and access-token expiry.
7. Redirect to the stored `returnTo` path if it is a **safe relative path** (must start with `/`, must not start with `//` or contain a scheme), else to `/`.

### FR-3 Session validation on every request

Every non-public request MUST resolve the session cookie to a stored profile; absence → 401 handling, which for browser routes means redirect to `/auth/login` (storing the originally requested path as `returnTo`). Authenticated credentials are exposed to handlers/templates as `{ id, email, name, userType, roles, contactId, currentRelationshipId, relationships, scope }`.

### FR-4 Route-level authorisation

- Scope/role checks happen **before the handler runs** (framework guard/middleware), returning 403 — never inside controllers.
- Organisation-level checks use the relationship helpers (§5.2) and MUST fail closed: missing/null linked-organisation data denies.

### FR-5 Logout — `GET /auth/logout`

1. Read profile and stored `id_token` from the session.
2. **Destroy the local session first** (so a bounce-back finds no session).
3. If an `id_token` exists (real Defra ID login), redirect to `end_session_endpoint` with `id_token_hint={id_token}` and `post_logout_redirect_uri={BASE_URL}/auth/signed-out`.
4. Otherwise (stub session or already signed out), go straight to the signed-out page.
5. `/auth/signed-out` is a public confirmation page with a "sign in again" link. _(Improvement over reference, which loops the post-logout redirect back to `/auth/logout` — functional but harder to follow and easy to break; an explicit terminal page is clearer.)_

### FR-6 Stub auth mode (development and test)

Enabled by `AUTH_STUB_ENABLED` (default: `true` when environment ≠ `prod`; the config layer MUST refuse `stubEnabled=true` when environment = `prod` — see §10 hardening H-8).

- **Dev stub:** `/auth/login` redirects to `/auth/stub/login`, a chooser page listing predefined fake users. Selecting one writes the same session shape as a real login (no `id_token`). Stub users include realistic `relationships` strings so organisation logic is exercised.
- **Real-provider escape hatch in dev:** when stub mode is on **and** real Defra ID credentials are configured, also register `/auth/defra-id` (initiates real flow) and the callback, and show a "Sign in with Defra ID" button on the chooser. This lets you smoke-test the real integration from local without flipping the whole app.
- **Test bypass:** when `NODE_ENV=test`, an auth scheme auto-authenticates every request with a default test user; tests may select an alternative canned user via an `x-test-user-type` request header. No cookies/sessions needed in tests.
- The stub chooser and test bypass MUST live behind the same strategy name as the real flow so business routes are identical in all modes.

### FR-7 Everything configurable

All environment-specific values and secrets come from environment variables with schema validation at boot (§9). The app MUST fail fast at startup on invalid combinations (e.g. stub disabled but no client credentials).

---

## 5. Defra ID claims and the user model

### 5.1 Claims of interest in the `id_token`

| Claim                                      | Meaning                                                  | Used for                               |
| ------------------------------------------ | -------------------------------------------------------- | -------------------------------------- |
| `sub`                                      | Unique user ID                                           | `user.id`                              |
| `email`                                    | Email address                                            | `user.email`                           |
| `firstName`, `lastName`                    | Names (B2C custom claims)                                | `user.name` (trimmed join)             |
| `contactId`                                | Defra customer contact ID                                | Downstream API calls / record matching |
| `uniqueReference`                          | Defra unique reference (if present)                      | Optional record matching               |
| `relationships`                            | Array of colon-delimited strings                         | Organisation authorisation (§5.2)      |
| `currentRelationshipId`                    | Relationship the user chose to act under                 | Current-organisation context           |
| `roles`                                    | Array of role strings (per relationship, where provided) | Fine-grained authorisation             |
| `nonce`, `iss`, `aud`, `exp`, `nbf`, `iat` | Standard OIDC                                            | Token verification only                |

Application user model (session shape):

```js
{
  id: string,            // sub
  email: string,
  name: string,          // `${firstName} ${lastName}`.trim()
  contactId: string,
  currentRelationshipId: string,
  relationships: Array<{ relationshipId: string, organisationId: string, organisationName: string }>,
  roles: string[],
  userType: 'operator',  // literal for this integration
  scope: ['operator']    // derived, for route guards
}
```

> **Note (28 Jul 2026):** `relationships` holds **parsed structured objects**, not the raw
> colon-delimited claim strings. `specs/003-auth-refactor.md` §2.4 moved the wire-format parse
> into the Defra ID provider layer (`auth/providers/defra-id/relationships.js`) so the
> provider-neutral `auth/core/organisation-access.js` only ever sees this structured shape. The
> raw `id_token` claim is still colon-delimited (§5.2 below) — that is the provider's _input_, not
> the session shape.

### 5.2 Relationships claim

Each entry in the raw `id_token` claim is a colon-delimited string:

```
{relationshipId}:{organisationId}:{organisationName}[:...additional segments]
```

The wire-format parse and the lookups now live in **separate layers** (spec-003 §2.4): the
provider parses the colon format into structured objects
(`auth/providers/defra-id/relationships.js` → `parseDefraRelationships`), and the
provider-neutral lookups in `auth/core/organisation-access.js` operate over that structured shape
only — they never see a colon. Required helpers (pure functions, unit-tested):

- `getUserOrganisationIds(user)` → array of `organisationId`s, skipping malformed entries.
- `userIsRelatedToOrg(user, organisationId)` → boolean; **fail closed** on `null`/`undefined`/empty target.
- `getCurrentRelationship(user)` → the structured relationship `{ relationshipId, organisationId, organisationName }` whose `relationshipId` equals `currentRelationshipId`, or `null`.
- `getUserRelationships(user)` → the full list of valid structured relationships, **display-only**; authorisation must still go through `userIsRelatedToOrg`.

⚠️ **ID-space warning (learned in the reference project):** organisation IDs in your own application's URLs or database are _your_ IDs, not Defra IDs. Before comparing, resolve your internal organisation to its linked Defra organisation ID via your own mapping, and pass **that** to the helper. Never compare a URL/database ID directly against relationship IDs. Document this at the helper definition.

Parse defensively: treat `relationships` as untrusted-shaped data (skip non-string entries, empty segments). Organisation _names_ in the claim are display hints only — never use them for authorisation.

---

## 6. OIDC mechanics

### 6.1 Discovery and endpoint caching

- Config holds only `DEFRA_ID_DISCOVERY_URL` (the full `.well-known/openid-configuration` URL).
- On first use, fetch it (with a request timeout, e.g. 5 s) and read: `authorization_endpoint`, `token_endpoint`, `end_session_endpoint`, `jwks_uri`, `issuer`.
- **Cache** the result. _Improvements over reference:_
  - Key the cache **by discovery URL** (the reference caches a single global object — a latent bug if the URL ever changes at runtime or in tests).
  - Give the cache a **TTL** (e.g. 1 hour) with stale-while-revalidate: on refresh failure, keep serving the stale copy and log a warning. B2C endpoints rotate rarely, but a process that never re-reads discovery can outlive an endpoint migration.
  - A discovery failure on a login attempt is a 502-class failure: show a friendly "sign-in unavailable" page; never fall back to hard-coded endpoints.

### 6.2 `id_token` verification (MUST — all of these)

Using a maintained JOSE library (Node: `jose`; other stacks: an equivalent that supports remote JWKS with caching):

1. **Signature** against the JWKS at `jwks_uri` (remote JWKS client with built-in caching, rate limiting, and refresh-on-unknown-`kid`).
2. **`iss`** equals the discovery document's `issuer`.
3. **`aud`** equals your client ID.
4. **`exp` / `nbf`** honoured, with a small clock tolerance (≤ 60 s) — _improvement: make the tolerance explicit rather than library-default._
5. **`iat`** present.
6. **`nonce`** equals the stored value, which must exist (absence ⇒ reject).
7. Reject `alg=none` / non-RS256 family implicitly by using the JWKS route (never `decode` without `verify`).

Any failure ⇒ no session, redirect to login, log the failure class (not the token).

### 6.3 Token endpoint call

- Server-to-server only, over TLS, with timeout and no automatic retry of the `authorization_code` grant (codes are single-use).
- Read `id_token`, and if refresh is implemented, `access_token`, `refresh_token`, `expires_in`.
- Treat non-2xx as terminal for the attempt; log status code, never response bodies that may echo secrets.

### 6.4 Session lifetime vs token lifetime (recommended improvement)

The reference app's session lives independently of the token's `exp` — a user stays signed in as long as the session cookie lives. Choose one deliberately:

- **Option A (simple, acceptable for many services):** session TTL (e.g. 4 h idle, 12 h absolute) independent of token expiry; the `id_token` is only kept for logout. Document it.
- **Option B (stricter):** store `expires_in`/`refresh_token`; when the access token is expired and a refresh token exists, refresh server-side (grant `refresh_token`); if refresh fails, end the session. Required if you will call Defra-protected downstream APIs.

The demo implements Option A and stubs the seams for Option B.

---

## 7. Session and cookie requirements

- Server-side session store (in-memory only for dev/demo; Redis or equivalent for real deployments — configurable).
- Cookie: `HttpOnly`; `Secure` (except `localhost`); `SameSite=Lax` (Lax, not Strict — the OIDC redirect back from Defra ID is a top-level cross-site navigation and Strict would drop the pre-auth session, breaking `state` validation); `Path=/`; no `Domain` attribute unless required. Prefer a `__Host-` cookie-name prefix in production.
- Session cookie is **signed/encrypted** with a configured secret (≥ 32 random bytes), rotatable (accept-old/sign-new list).
- **Regenerate the session identifier at login** (FR-2 step 6). _Improvement: the reference stores into the same yar session across the auth boundary; explicit regeneration closes session fixation._
- Set sensible TTLs (idle + absolute). Destroy server-side state on logout, not just the cookie.
- Pre-auth values (`state`, `nonce`, `code_verifier`, `returnTo`) live in the same session mechanism, are single-use, and are cleared on first read.

---

## 8. Route map

| Route                   | Auth                           | Purpose                                                  |
| ----------------------- | ------------------------------ | -------------------------------------------------------- |
| `GET /auth/login`       | public                         | Initiate flow (or redirect to stub chooser in stub mode) |
| `GET /auth/callback`    | public                         | OIDC redirect target                                     |
| `GET /auth/logout`      | public                         | Destroy session, federated logout                        |
| `GET /auth/signed-out`  | public                         | Post-logout landing                                      |
| `GET /auth/stub/login`  | public, stub mode only         | Fake-user chooser                                        |
| `POST /auth/stub/login` | public, stub mode only         | Set stub session (CSRF-protect this form)                |
| `GET /auth/defra-id`    | public, stub mode + creds only | Real login while stub mode is on                         |
| `GET /health`           | public                         | Liveness                                                 |
| `GET /public/*`         | public                         | Static assets                                            |
| everything else         | **session required**           | Application                                              |

---

## 9. Configuration

All values via environment variables, loaded through a validating config layer (convict / zod / envalid / typed options pattern — stack's choice). Secrets marked ✱ must be treated as sensitive (never logged, injected via secret manager in deployed environments).

| Variable                               | Description                                        | Default                          |
| -------------------------------------- | -------------------------------------------------- | -------------------------------- |
| `ENVIRONMENT`                          | `local` \| `dev` \| `test` \| `pre-prod` \| `prod` | `local`                          |
| `PORT`                                 | Listen port                                        | `3000`                           |
| `AUTH_STUB_ENABLED`                    | Enable stub auth                                   | `true` iff `ENVIRONMENT != prod` |
| `AUTH_CALLBACK_BASE_URL`               | Public base URL for redirect URIs                  | `http://localhost:3000`          |
| `SESSION_SECRET` ✱                     | Cookie signing/encryption key (≥ 32 chars)         | — (required)                     |
| `SESSION_IDLE_TTL_MINUTES`             | Idle session timeout                               | `240`                            |
| `SESSION_ABSOLUTE_TTL_MINUTES`         | Absolute session lifetime                          | `720`                            |
| `DEFRA_ID_DISCOVERY_URL`               | Full OIDC metadata URL                             | —                                |
| `DEFRA_ID_CLIENT_ID` ✱                 | Client ID                                          | —                                |
| `DEFRA_ID_CLIENT_SECRET` ✱             | Client secret                                      | —                                |
| `DEFRA_ID_SERVICE_ID`                  | Service ID from onboarding                         | —                                |
| `DEFRA_ID_PKCE_ENABLED`                | Send PKCE params                                   | `true`                           |
| `DEFRA_ID_CLOCK_TOLERANCE_SECONDS`     | JWT clock skew allowance                           | `60`                             |
| `DEFRA_ID_DISCOVERY_CACHE_TTL_SECONDS` | Endpoint cache TTL                                 | `3600`                           |
| `DEFRA_ID_REFRESH_ENABLED`             | Enable refresh-token handling (Option B, §6.4)     | `false`                          |

**Boot-time validation rules (fail fast):**

- `ENVIRONMENT=prod` ⇒ `AUTH_STUB_ENABLED` must be `false` (hard error if forced true).
- `AUTH_STUB_ENABLED=false` ⇒ `DEFRA_ID_DISCOVERY_URL`, `DEFRA_ID_CLIENT_ID`, `DEFRA_ID_CLIENT_SECRET`, `DEFRA_ID_SERVICE_ID` all required.
- `SESSION_SECRET` required and ≥ 32 chars whenever sessions are real (i.e. not `NODE_ENV=test`).
- `AUTH_CALLBACK_BASE_URL` must be `https://` when `ENVIRONMENT` ∈ {pre-prod, prod}.

Ship a commented `.env.example` with every variable and no real values.

---

## 10. Security hardening checklist

Carried-over strengths of the reference implementation: ✔ state (CSRF) binding · ✔ nonce binding with mandatory presence · ✔ full JWKS signature/issuer/audience verification · ✔ single-use pre-auth values · ✔ tokens never sent to the browser · ✔ deny-by-default routing · ✔ fail-closed organisation checks · ✔ federated logout with `id_token_hint`.

Improvements this spec adds over the reference:

| #    | Item                                                                                                                                 | Rationale                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| H-1  | **PKCE on the Defra ID flow** (S256)                                                                                                 | Reference omits it for Defra ID; codes intercepted in transit/logs become unusable      |
| H-2  | **Session ID regeneration at login**                                                                                                 | Session fixation defence                                                                |
| H-3  | **Discovery cache keyed by URL + TTL + stale-fallback**                                                                              | Latent single-global-cache bug; survives endpoint rotation                              |
| H-4  | **Explicit clock tolerance** on JWT validation                                                                                       | Deterministic behaviour across environments                                             |
| H-5  | **`returnTo` open-redirect guard** (relative-path allow-list)                                                                        | Prevents `?returnTo=https://evil` phishing bounce                                       |
| H-6  | **Handle `error` param on callback** (user cancel etc.)                                                                              | Reference redirects blindly into a retry loop                                           |
| H-7  | **Dedicated `/auth/signed-out` page** as post-logout URI                                                                             | Removes the logout→logout redirect loop shape                                           |
| H-8  | **Boot-time refusal of stub mode in prod**                                                                                           | Reference only defaults it off; a misconfigured env var could enable fake login in prod |
| H-9  | **CSRF token on the stub login POST**                                                                                                | The stub chooser form is a state-changing POST                                          |
| H-10 | **Timeouts on discovery/token/JWKS fetches**                                                                                         | A hung IdP must not exhaust server resources                                            |
| H-11 | **Structured auth audit logging** (login success/failure class, logout, denied org access; user ID but never tokens/claims payloads) | Traceability without PII/token leakage                                                  |
| H-12 | **Rate limiting on `/auth/*`**                                                                                                       | Blunt-force and DoS mitigation on the unauthenticated surface                           |

---

## 11. Demo flow

Deliverable: a runnable demo (`defra-id-demo/`) proving the full journey with **zero real credentials**, plus the ability to point the same code at real Defra ID (CPDEV) by changing only environment variables.

### 11.1 Components

1. **`app/`** — the RP web app implementing this spec (login, callback with PKCE + full token verification, protected home page showing the session and parsed relationships, an organisation-guarded page, logout, stub mode).
2. **`mock-idp/`** — a local mock of Defra ID: a tiny OIDC provider exposing `/.well-known/openid-configuration`, `/authorize` (user-picker page in place of a login form), `/token` (issues RS256-signed `id_token`s with Defra-shaped claims: `contactId`, `relationships`, `currentRelationshipId`, `roles`), `/jwks`, and `/logout` (end-session). Signing keys are generated at startup.

Because the mock IdP implements the same contract the app discovers via OIDC metadata, **the app's real code path runs unmodified** — the only difference between demo and CPDEV is `DEFRA_ID_DISCOVERY_URL` + credentials. (For team-wide use, Defra's official [cdp-defra-id-stub](https://github.com/DEFRA/cdp-defra-id-stub) container serves the same purpose; the bundled mock keeps the demo dependency-free.)

### 11.2 Demo script

```
npm install
npm run demo          # starts mock IdP on :3939 and app on :3000
```

1. Open `http://localhost:3000/` → redirected to `/auth/login` (demo runs with stub mode off, so the real OIDC path is exercised).
2. `/auth/login` redirects to the mock IdP's persona picker — this is the real OIDC authorize redirect, with `state`/`nonce`/PKCE visible on the URL.
3. Pick a persona (e.g. _Amina Khan — Acme Recycling Ltd + Beta Waste Ltd_) → authorize redirects back with a code → app exchanges it, verifies the RS256 `id_token` against the mock JWKS, builds the session.
4. Home page shows the verified claims, parsed relationships, and current organisation.
5. Visit the organisation-guarded page for an org the persona belongs to (200) and one it doesn't (403) — demonstrates fail-closed checks.
6. Logout → federated logout via the mock end-session endpoint → signed-out page.
7. Repeat with stub mode (`AUTH_STUB_ENABLED=true`) to show the no-IdP path, and run `npm test` to show the test bypass.

### 11.3 Demo acceptance criteria

- [ ] Full journey completes with no external network access
- [ ] Tampering with `state` or the `id_token` (mock IdP offers a "tamper" toggle) is rejected
- [ ] Replaying a callback URL is rejected (single-use state)
- [ ] `returnTo=https://evil.example` is ignored
- [ ] Org-guarded route: member 200 / non-member 403 / unknown link 403
- [ ] Switching to real CPDEV requires only env-var changes

---

## 12. Extensions (roadmap, not in v1)

- **Downstream API calls** with the Defra ID access token + refresh handling (Option B, §6.4).
- **Second provider** (e.g. Entra ID for internal staff) using the same strategy pattern with per-provider callback routes and a `userType`/scope split, as in the reference project.
- **Back-channel logout** if/when the Defra ID environment supports it.
- **Distributed session store** (Redis) and horizontal scaling.

---

## 13. Test plan

| Layer       | Coverage                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | relationship parsing (malformed, empty, non-string entries); token verification (bad sig, wrong iss/aud, expired, missing iat, nonce mismatch/absent); returnTo guard; config validation matrix |
| Integration | full authorize→callback→session→logout against the mock IdP; state mismatch; replay; error param; stub login; test bypass header                                                                |
| Manual/UAT  | CPDEV end-to-end with real onboarded credentials, including organisation selection and forceReselection                                                                                         |

---

## Appendix A — Sequence: successful login

```
Browser          App (RP)                    Defra ID
   │ GET /some/page │                             │
   │───────────────▶│ 302 /auth/login (returnTo)  │
   │ GET /auth/login│                             │
   │───────────────▶│ gen state,nonce,PKCE; save  │
   │◀───302─────────│ authorize?client_id&serviceId&state&nonce&code_challenge…
   │ GET authorize ─────────────────────────────▶│ login + org selection
   │◀───302 /auth/callback?code&state────────────│
   │ GET /auth/callback                          │
   │───────────────▶│ state ✓ (single-use)        │
   │                │ POST token (code, secret, verifier)──▶
   │                │◀── id_token (+refresh)──────│
   │                │ verify sig/iss/aud/exp/nonce (JWKS)
   │                │ regenerate session, store profile
   │◀───302 returnTo│                             │
```

## Appendix B — Reference implementation mapping

| Spec section   | Reference file (epr-register-enrol-frontend)                                               |
| -------------- | ------------------------------------------------------------------------------------------ |
| FR-1/FR-2/FR-5 | `src/server/auth/controller.js`                                                            |
| §6.1           | `src/server/common/helpers/auth/providers/defra-id.js`                                     |
| §6.2           | `src/server/common/helpers/auth/providers/defra-id-token.js`                               |
| §5.2           | `src/server/common/helpers/auth/organisation-access.js`                                    |
| FR-6           | `src/server/auth/stub/controller.js`, `src/server/common/helpers/auth/stub-auth-plugin.js` |
| §9             | `src/config/config.js` (`auth.*`)                                                          |
| Route wiring   | `src/server/auth/index.js`                                                                 |
