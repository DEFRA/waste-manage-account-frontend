# DEFRA ID (Defra Identity) Implementation Plan — waste-manage-account-frontend

Based on a review of [DEFRA/fcp-defra-id-example](https://github.com/DEFRA/fcp-defra-id-example) and the current state of this repo (CDP frontend template: Hapi 21 + Nunjucks + govuk-frontend, convict config, yar session cache backed by catbox memory/Redis).

**Agreed decisions**

- Plan is a standalone document (this file); work items can be broken into `IMPLEMENTATION_PLAN.md` entries later.
- Permissions/scopes derived **from DEFRA ID token claims only** (no Siti Agri — that is FCP-specific).
- **All routes protected by default** (`server.auth.default('session')`); public routes opt out explicitly.
- Local development against the **cdp-defra-id-stub**, swappable to real DEFRA ID via config only.
- **No `.env` files.** All configurable values live as convict keys in `src/config/config.js` with working local defaults; deployed environments override them through CDP platform-injected environment variables (via the keys' `env:` bindings). Code reads config only through `config.get(…)`.

---

## 1. How the example works (summary)

The example implements the full journey with two hapi auth strategies:

1. **`defra-id` (@hapi/bell, OAuth2/OIDC)** — used only on the auth routes. Bell handles the redirect to DEFRA ID, state/nonce CSRF protection, and the authorisation-code→token exchange. Endpoints are discovered at startup from the OIDC well-known URL. A `profile` function decodes the JWT and maps claims (`contactId`→crn, `currentRelationshipId`→organisationId, name).
2. **`session` (@hapi/cookie)** — the server-wide default. The cookie holds only a `sessionId`; the real session (token, refresh token, profile, scope) lives in the server-side cache (Redis). The `validate` function loads the session from cache, checks JWT expiry (60s clock skew tolerance), and transparently refreshes tokens when expired (refresh is hand-rolled — bell doesn't support it).

Supporting modules (`src/auth/`): `get-oidc-config` (well-known fetch), `verify-token` (JWKS → PEM → RS256 signature verification via @hapi/jwt), `refresh-tokens`, `get-sign-out-url` + `state` (sign-out is hand-rolled with its own state param since bell doesn't cover it), `get-permissions` (FCP/Siti Agri — we replace this), and `get-safe-redirect` (open-redirect guard: only relative single-slash paths).

Auth routes: `/auth/sign-in`, `/auth/sign-in-oidc` (callback: verify token → build scope → write session to cache → set cookie → redirect to original path), `/auth/sign-out`, `/auth/sign-out-oidc` (callback: validate state, drop cache, clear cookie), `/auth/organisation` (org re-selection via `forceReselection`).

Other patterns worth copying: `@hapi/yar` for pre-auth state (requested-path redirect, sign-out state) with `isSameSite: 'Lax'` so cookies survive the IdP redirect; strict no-store cache headers on authenticated pages (back-button-after-sign-out protection); auth data injected into the Nunjucks view context; 403/unauthorised views; scope-based route authorisation (`options.auth.scope`).

FCP-specific parts we deliberately **drop or defer**: Siti Agri permissions lookup, the `sso`/`ssoOrgId` cross-service plugin, and org-switching (defer — see Phase 8).

## 2. Gap analysis — what this repo has vs needs

| Concern                   | Example repo                          | This repo today                                           | Action                                                                              |
| ------------------------- | ------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| OAuth client              | @hapi/bell                            | —                                                         | Add dependency                                                                      |
| Session cookie auth       | @hapi/cookie                          | —                                                         | Add dependency                                                                      |
| JWT decode/verify         | @hapi/jwt                             | —                                                         | Add dependency                                                                      |
| HTTP calls to IdP         | @hapi/wreck                           | native `fetch` available                                  | Use native fetch (no new dep)                                                       |
| CSRF on forms             | @hapi/crumb                           | —                                                         | Add (recommended alongside auth)                                                    |
| Server-side session store | `server.cache()` catbox-redis segment | yar over catbox (memory/redis) via `getCacheEngine`       | Add a second cache segment for auth sessions; keep yar for transient pre-auth state |
| Config                    | convict `defra-id.js`, `cache.js`     | convict `config.js` (has redis, session, cookie password) | Extend with `defraId` block                                                         |
| Cookie password           | `cookie.password` config              | `session.cookie.password` config (exists)                 | Reuse                                                                               |
| Views                     | flat `src/views`                      | `src/server/routes/<name>/index.njk` + layouts            | Follow repo convention                                                              |
| Security headers          | custom `headers.js` plugin + no-store | hapi route `security` options + CSP plugin                | Add no-store cache-control ext for authenticated pages                              |
| Local IdP                 | fcp-defra-id-stub in compose          | none                                                      | Add cdp-defra-id-stub to `compose.yml`                                              |

**Configuration approach — no `.env` files.** All configurable values are defined as convict keys in `src/config/config.js` with working local defaults, so the app runs locally with no environment setup at all. Each key keeps an `env:` binding purely so CDP platform-injected environment variables can override it in deployed environments (the standard CDP pattern already used by `redis.*` and `session.*` in this repo). Secrets (`defraId.clientSecret`, cookie password) are marked `sensitive: true`; their production values come from CDP secrets as platform env vars, never from files in the repo.

New `defraId` config block in `config.js` (this repo is the source of truth for naming — the example's names shown for traceability):

| Config key (`config.js`)                    | Local default                          | Example equivalent                   | Notes                                                                              |
| ------------------------------------------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `defraId.discoveryUrl`                      | local cdp-defra-id-stub well-known URL | `wellKnownUrl`                       | OIDC discovery document URL                                                        |
| `defraId.clientId` / `defraId.clientSecret` | stub client id / dummy secret          | same                                 | secret is `sensitive: true`, no production default                                 |
| `defraId.serviceId`                         | stub service id                        | same                                 |                                                                                    |
| `defraId.policy`                            | stub policy                            | `policy`                             | **must add** — the `p` provider param; shared policy = SSO with other services     |
| `defraId.callbackBaseUrl`                   | `http://localhost:3000`                | `redirectUrl` + `signOutRedirectUrl` | both callback URLs derived from one base                                           |
| `defraId.refreshEnabled`                    | `true`                                 | `refreshTokens`                      |                                                                                    |
| `defraId.clockToleranceSeconds`             | `60`                                   | hard-coded 60                        |                                                                                    |
| `defraId.discoveryCacheTtlSeconds`          | e.g. `3600`                            | none (fetches every time)            | improvement: cache discovery doc                                                   |
| `defraId.pkceEnabled`                       | `false`                                | not used                             | bell supports `provider.pkce: 'S256'`; confirm stub/tenant support before enabling |
| `defraId.stubEnabled`                       | `!isProduction`                        | n/a                                  | convenience flag for local stub defaults                                           |
| `session.idleTtl` / `session.absoluteTtl`   | 30m / 4h (decide)                      | single cache TTL                     | drive cookie ttl + cache expiry                                                    |
| `session.cookie.password`                   | existing dev default                   | `cookie.password`                    | reuse the existing key — do not introduce a second secret key                      |

## 3. Target file layout (repo conventions)

```
src/
  config/
    config.js                          # + defraId + auth session config blocks
  server/
    auth/                              # new — mirrors example's src/auth/
      get-oidc-config.js               # fetch + TTL-cache the discovery document
      verify-token.js                  # JWKS fetch, select key by kid, RS256 verify
      refresh-tokens.js                # POST to token endpoint (form-encoded body)
      get-sign-out-url.js              # end_session_endpoint + state
      state.js                         # createState / validateState (yar-backed)
      get-permissions.js               # claims→scope mapping (roles/relationships)
      get-safe-redirect.js             # open-redirect guard
      *.test.js                        # colocated unit tests (repo convention)
    plugins/
      auth.js                          # registers bell + cookie strategies, sets default
      session-cache.js                 # existing yar (keep for pre-auth state)
      no-store.js                      # cache-control no-store on authenticated pages
    routes/
      auth/
        index.js                       # /auth/sign-in, /auth/sign-in-oidc,
                                       # /auth/sign-out, /auth/sign-out-oidc
        controller.js + controller.test.js
      unauthorised/                    # unauthorised + 403 views if not covered by errors helper
  server/common/templates/
    layouts/page.njk                   # + sign in/out nav, user name display
```

## 4. Phased plan

### Phase 0 — Groundwork

1. Add pinned exact-version dependencies (repo rule: no ranges): `@hapi/bell`, `@hapi/cookie`, `@hapi/jwt`, and `@hapi/crumb`. No `@hapi/wreck` — use native `fetch`. Vet and note versions in the PR description.
2. Extend `src/config/config.js` with the `defraId` block from the table in section 2, plus session idle/absolute TTLs. Every key gets a working local default (stub URLs, dummy credentials) so local dev needs no environment setup, and an `env:` binding so CDP-injected environment variables override in deployed environments. Reuse the existing `session.cookie.password` key (≥32 chars, validated) as the single secret for bell, cookie, and yar — do not add a second one. All code reads configuration exclusively via `config.get(…)`; no direct `process.env` access in auth modules.
3. Add a **server-side auth session cache segment** in `createServer()` (`server.app.cache = server.cache({ cache: session.cache.name, segment: 'defra-id-session', expiresIn: … })`) reusing the existing `getCacheEngine` (memory locally, Redis in environments). Note: CDP Redis uses `keyPrefix` via ioredis — verify catbox + ioredis prefix interplay in a test.

### Phase 1 — OIDC discovery + bell strategy (sign-in)

4. `get-oidc-config.js`: fetch discovery doc from `defraId.discoveryUrl`, cache in memory for `discoveryCacheTtlSeconds` (improvement over the example, which fetches per call).
5. `plugins/auth.js`: port `getBellOptions` from the example —
   - provider: oauth2, `useParamsAuth: true`, auth/token endpoints from discovery, scope `['openid', 'offline_access', clientId]`
   - `profile()`: decode JWT, spread claims, map `contactId`→crn, `currentRelationshipId`→organisationId, build display name
   - `providerParams`: `serviceId`, `p: policy`, `response_mode: 'query'`
   - `location()`: store safe `redirect` query param in yar; return `${callbackBaseUrl}/auth/sign-in-oidc`
   - `isSecure` from existing `session.cookie.secure` config
   - if `pkceEnabled`, set `provider.pkce: 'S256'` (verify stub support first; keep off by default)
6. Register `Bell`, `Cookie`, `Crumb` and the auth plugin in `createServer()` **before** the router.

### Phase 2 — Cookie strategy + session validation + refresh

7. `getCookieOptions` (port from example): cookie holds `{ sessionId }` only; `isSameSite: 'Lax'`; `redirectTo: /auth/sign-in?redirect=<original path+search>`; `validate()` loads session from cache (missing → invalid), verifies token expiry with `clockToleranceSeconds` skew, on expiry: refresh if `refreshEnabled` else invalidate.
8. `refresh-tokens.js`: POST to discovered `token_endpoint` with `grant_type=refresh_token`. **Improvement over the example: send credentials in a form-encoded request body, not the query string** (secrets in URLs leak into logs).
9. Set `server.auth.default('session')`. Sweep existing routes: `/health` → `auth: false` (platform probe, must stay public); static assets/`serveStaticFiles` and the vite dev middleware path → `auth: false`; decide per existing page (`/`, `/about`, `home`) whether public (`auth: { mode: 'try' }`) or protected.

### Phase 3 — Auth routes

10. `src/server/routes/auth/` with the four routes, ported from the example:
    - `GET /auth/sign-in` (strategy `defra-id`) → redirect to post-sign-in landing page
    - `GET /auth/sign-in-oidc` (strategy `defra-id`, mode `try`): not authenticated → `unauthorised` view; else `verifyToken` (see 11), `getPermissions` (see 12), write session to cache keyed by the token's `sessionId` claim, `request.cookieAuth.set({ sessionId })`, redirect to yar-stored safe redirect (default landing page)
    - `GET /auth/sign-out` (mode `try`): drop cache session, clear cookie, redirect to `end_session_endpoint` with `id_token_hint`, `post_logout_redirect_uri`, and yar-backed `state`
    - `GET /auth/sign-out-oidc` (mode `try`): `validateState`, fail-safe cache drop + cookie clear, redirect to `/`
11. `verify-token.js`: fetch JWKS from discovery `jwks_uri`. **Improvement: select the key matching the token's `kid` header** (the example naively uses `keys[0]`), convert JWK→PEM, verify RS256 signature + times via @hapi/jwt.
12. `get-permissions.js` (claims-only, per decision): map the DEFRA ID token's `roles`/`relationships` claims to hapi `scope` array plus a baseline `'user'` scope. Keep it a single seam so a backend permissions API can replace it later. Never log claim contents (PII rule).
13. `get-safe-redirect.js` + `state.js`: port as-is (they're small and well-tested in the example); adjust default redirect target.

### Phase 4 — Route protection, errors, security headers

14. Scope-protect authenticated pages (`options.auth.scope`), starting with the account home page requiring `'user'`.
15. Extend the existing `catchAll` error helper for 401→redirect handled by cookie strategy and 403 → a GOV.UK-styled "you do not have permission" page; add `unauthorised` view.
16. `plugins/no-store.js`: port the example's cache-control ext — `no-store` on all authenticated/HTML responses (not `/public` assets, not `/health`) to stop back-button access after sign-out.
17. Check the CSP plugin (blankie) allows `form-action`/redirects to the DEFRA ID host if needed.

### Phase 5 — Views and navigation

18. Nunjucks context: extend `config/nunjucks/context/context.js` (or the vision context) to load the auth session from cache when `request.auth.isAuthenticated` and expose an `auth` object (as the example's views plugin does) — guard with try/catch so cache failures don't 500 the page.
19. `page.njk` layout: show signed-in user's name + "Sign out" link when authenticated, "Sign in" otherwise (GOV.UK header/service navigation patterns). Never render token contents.

### Phase 6 — Local development against cdp-defra-id-stub

20. Add the cdp-defra-id-stub to `compose.yml` on the `cdp-tenant` network. The local default of `defraId.discoveryUrl` in `config.js` points at the stub's well-known endpoint, so `docker compose up` + `npm run dev` just works with zero configuration. Document stub test-user setup in README. Confirm the stub's exact image name/ports and well-known path from its repo (DEFRA/cdp-defra-id-stub) when implementing.
21. Wire `defraId.stubEnabled` (default `!isProduction`) to sensible local behaviour (e.g. relax `isSecure`, skip PKCE if unsupported by the stub).
22. Register redirect URLs with the stub/real tenant: `{defraId.callbackBaseUrl}/auth/sign-in-oidc` and `/auth/sign-out-oidc`. In deployed environments `defraId.callbackBaseUrl` and real credentials are supplied as CDP environment variables/secrets overriding the config defaults.

### Phase 7 — Tests and hardening (gates every phase, listed once)

23. Unit tests colocated per repo convention, ≥90% coverage, negative paths included: bell profile mapping, cookie `validate` (missing session / expired+refresh / expired+no-refresh / valid), state mismatch → error, unsafe redirects (`//evil`, `https://…`, missing), verify-token bad kid/signature/expiry, refresh flow, permissions mapping, each auth route (authenticated + unauthenticated + tampered state), `/health` stays public, protected route redirects when signed out, 403 when scope missing.
24. Run the full gate: `npm run security-audit && npm run format:check && npm run lint && npm test`.
25. Security review pass against the example's checklist: state+nonce, code exchange only, signature verification, expiry validation, no-store headers, safe redirects, no PII/tokens in logs (extend pino redact paths for any new headers), cookies `Secure`+`HttpOnly`+`Lax` in environments.

### Phase 8 — Deferred / optional (do not build now)

- **Organisation switching** (`/auth/organisation`, `forceReselection`, `relationshipId`) — add only if waste journeys are org-scoped with multi-org users.
- **Cross-service SSO plugin** (`ssoOrgId` interception) — FCP pattern; only needed if users deep-link between Defra services sharing the policy.
- **Real permissions API** — swap the `get-permissions` seam when a waste backend endpoint exists.

## 5. Sequencing and PR slicing

Phases 0–3 are one coherent vertical slice but too big for one PR under the repo's "small, focused PRs" rule. Suggested slices, each independently shippable behind the absence of registered routes:

1. PR1: deps + config + auth session cache segment (no behaviour change)
2. PR2: auth helpers (`src/server/auth/*`) with tests (pure modules, unused yet)
3. PR3: auth plugin (strategies registered, default **not** yet switched) + auth routes + views
4. PR4: flip `server.auth.default('session')` + route sweep + no-store headers + 403 page
5. PR5: compose/stub wiring + README/local-dev docs

## 6. Risks / open questions

- **Policy value**: there is currently no policy key anywhere in the repo's config — `defraId.policy` must be added, and the real value confirmed with the DEFRA ID team during onboarding (it also determines SSO grouping).
- **PKCE**: confirm whether the cdp-defra-id-stub and the real tenant support PKCE for confidential clients before enabling `DEFRA_ID_PKCE_ENABLED`.
- **Claims shape outside FCP**: verify which claims the waste service's DEFRA ID registration actually returns (`roles`, `relationships`, `currentRelationshipId`) — the scope mapping in `get-permissions.js` depends on it. Inspect a stub token early in Phase 3.
- **catbox-redis vs ioredis keyPrefix**: the repo builds its Redis client with a key prefix; confirm auth session keys are prefixed consistently and TTLs behave (idle vs absolute: catbox gives one `expiresIn`; enforcing a separate absolute TTL needs a `createdAt` check in `validate()`).
- **Session lifetime**: example uses session cookies (cleared on browser close) to match farming services; this repo's yar cookie has a 4h TTL. Decide waste service policy (idle 30m / absolute 4h is a common GDS pattern) and apply consistently to cookie TTL + cache TTL + token refresh.
- **Onboarding**: real environments need the service registered with DEFRA ID (client id/secret via CDP secrets, redirect URLs per environment).
