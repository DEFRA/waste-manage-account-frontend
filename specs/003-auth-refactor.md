# Auth Architecture Refactor — Provider / Client / Service Layering

**Version:** 2.0 · **Date:** 28 July 2026 · **Author:** Ibrahim Uylas
**Status:** Ready for implementation (refined via clarify workshop, 28 Jul 2026)
**Type:** Task (refactor — no user-facing change) · **Priority:** P1 — blocks the next auth implementation
**Depends on:** `specs/002-defra-id-integration-spec.md` (the working Defra ID implementation)

---

## 1. Problem / Opportunity

The Defra ID integration (spec 002) is functionally complete and well-hardened, but it grew organically and its concerns are now mixed together. More auth implementations are planned — Entra ID (or another OIDC IdP) for internal staff is the likely next one, and a non-OIDC mechanism (magic link, API key) is possible later. Today, adding a second provider would mean editing route handlers, the router plugin, and config policy functions all at once.

Concretely:

1. **`src/auth/` is a flat bag of four concerns:** generic OIDC protocol clients (`discovery.js`, `token-endpoint.js`, `verify-token.js`), Defra-specific claim parsing (`organisation-access.js`), provider-agnostic app auth core (`session.js`, `return-to.js`, `audit.js`, `guards.js`), and dev/test fixtures (`stub-users.js`, `test-users.js`).
2. **Flow orchestration lives inside route handlers.** `routes/auth/login.js` contains `randomToken()`, PKCE generation, the Defra-specific `buildAuthorizeUrl()` and `initiateRealLogin()`. `routes/auth/callback.js` contains `buildProfile()` (Defra claim mapping) plus the whole discovery → exchange → verify → session orchestration inline. `routes/auth/logout.js` builds the end-session URL itself.
3. **Route → route imports:** `routes/auth/stub.js` imports from `routes/auth/login.js`.
4. **Provider selection is scattered** across `plugins/router.js`, `routes/auth/login.js`, and `config/index.js` (`isDefraIdConfigured`).
5. **The hapi auth scheme knows about test fixtures** (`plugins/auth.js` branches on `config.isTest` and imports `test-users.js`).
6. **Config discipline leak:** `plugins/rate-limit.js` reads `process.env` directly, bypassing `config/index.js` and `validateConfig()` — the only file that does.

What must NOT change: the security invariants of spec 002 (H-1…H-12 — deny-by-default, fail-closed callback, single-use pre-auth, session regeneration, no token logging, open-redirect guard, stub blocked in prod), the plugin registration order in `server.js`, the `x-test-user-type` test bypass, and every `/auth/*` URL.

## 2. Proposed Solution

Restructure `src/auth/` into four layers with a one-way import direction, so a new provider is a new folder plus a registry entry — nothing else.

### 2.1 Layers

```
routes/auth/*  (thin HTTP handlers: parse request, call service, redirect/render)
      │
      ▼
src/auth/service.js            SERVICE — orchestrates flows against the
                               provider registry; owns "which provider,
                               which step, what happens to the session"
      │
      ▼
src/auth/providers/<name>/     PROVIDER — one folder per identity source;
                               adapts one IdP to the AuthProvider interface
                               (defra-id, stub, later entra-id, magic-link…)
      │
      ▼
src/auth/clients/oidc/         CLIENT — reusable protocol machinery with no
                               provider knowledge (discovery, token exchange,
                               JWKS verification, PKCE)

src/auth/core/                 CORE — provider-agnostic primitives used by all
                               layers above: session vocabulary, guards, audit,
                               return-to, random tokens, the hapi auth scheme
```

**Import direction rules (CI-enforced, see AC-2):**

- `routes` may import: `service`, `core` (guards), never `providers` or `clients`
- `service` may import: `providers` (via the registry), `core`
- `providers` may import: `clients`, `core`, `config`
- `clients` may import: `config`, `core`; nothing else from `auth/`
- `core` imports nothing from `providers`/`clients`/`routes`
- Nothing outside `config/` reads `process.env`

### 2.2 Target file tree

```
src/
  auth/
    core/
      session.js            ← src/auth/session.js (move, unchanged)
      return-to.js          ← src/auth/return-to.js (move, unchanged)
      audit.js              ← src/auth/audit.js (move, unchanged)
      guards.js             ← src/auth/guards.js (move, unchanged)
      organisation-access.js← src/auth/organisation-access.js, reduced to
                              lookups over structured relationship objects
                              (parsing moves to providers/defra-id, §2.4)
      random.js             ← randomToken() extracted from routes/auth/login.js
      scheme.js             ← session-auth scheme extracted from plugins/auth.js
    clients/
      oidc/
        discovery.js        ← src/auth/discovery.js (move, unchanged)
        token-endpoint.js   ← src/auth/token-endpoint.js (move, unchanged)
        verify-token.js     ← src/auth/verify-token.js (move, unchanged)
        pkce.js             ← codeChallengeS256() extracted from routes/auth/login.js
                              + createCodeVerifier() (wraps core/random.js)
    providers/
      registry.js           NEW — name → provider map; resolves the default
                              provider from config; lists route definitions
                              each enabled provider contributes
      defra-id/
        index.js            NEW — DefraIdProvider (implements AuthProvider);
                              absorbs isDefraIdConfigured() as its `enabled`
        authorize-url.js    ← buildAuthorizeUrl() from routes/auth/login.js
        profile.js          ← buildProfile() from routes/auth/callback.js,
                              now emitting parsed relationships (§2.4)
        relationships.js    NEW — Defra colon-delimited claim parsing, moved
                              out of organisation-access.js
      stub/
        index.js            NEW — StubProvider (implements AuthProvider)
        users.js            ← src/auth/stub-users.js (relationships become
                              structured objects, §2.4)
    testing/
      users.js              ← src/auth/test-users.js (move; structured
                              relationships — this is a scheme bypass fixture,
                              NOT a provider, and must stay out of providers/)
    service.js              NEW — beginLogin / completeLogin / logout
                              orchestration, moved out of the route handlers
  plugins/
    auth.js                 shrinks: registers core/scheme.js, no fixture import
    router.js               registers business routes + routes contributed by
                              the provider registry
  routes/
    auth/
      login.js              thin: delegates to service.beginLogin
      callback.js           thin: delegates to service.completeLogin
      logout.js             thin: delegates to service.logout
      stub.js               thin: chooser GET/POST delegate to StubProvider
                              via the service; no imports from login.js
```

Each moved module's co-located `.test.js` moves with it.

### 2.3 The `AuthProvider` interface

Plain-JS duck typing, documented with JSDoc in `providers/registry.js`. Deliberately minimal and redirect-shaped so it fits OIDC **and** non-OIDC mechanisms (a magic-link provider's `beginLogin` sends an email and returns a "check your inbox" view instead of a redirect; its `completeLogin` verifies the link token):

```js
/**
 * @typedef {object} AuthProvider
 * @property {string} name                    // 'defra-id', 'stub', 'entra-id'…
 * @property {(request) => boolean} enabled   // config-driven availability
 * @property {(request) => Promise<BeginResult>} beginLogin
 *   // writes pre-auth state to the session if it needs any;
 *   // BeginResult = { redirectUrl } | { view, context, statusCode? }
 * @property {(request) => Promise<CompleteResult>} completeLogin
 *   // consumes pre-auth state, returns the verified profile;
 *   // CompleteResult = { profile, idToken? } — throws typed errors otherwise
 * @property {({ idToken, request }) => Promise<string|null>} logoutRedirectUrl
 *   // federated end-session URL, or null for local-only sign-out
 * @property {() => RouteDefinition[]} extraRoutes
 *   // provider-specific routes (stub chooser GET/POST, /auth/defra-id)
 */
```

What stays in the **service**, never in a provider: session writes of the verified profile, `regenerateSession()` at auth boundaries, audit events, `safeReturnTo` handling, the fail-closed redirect policy (today's `failClosed()`). Providers return data; the service decides what it means for the session. This keeps H-2/H-5/H-7/H-11 enforced in exactly one place regardless of how many providers exist.

### 2.4 Relationships normalisation — DECIDED (was §5.4 Option A in v1)

Defra's colon-delimited relationships claim (`{relationshipId}:{organisationId}:{organisationName}`) is provider-specific wire format and must not leak past the provider boundary:

- `providers/defra-id/relationships.js` parses the claim; `providers/defra-id/profile.js` stores relationships in the session profile as structured objects `{ relationshipId, organisationId, organisationName }`.
- `core/organisation-access.js` shrinks to fail-closed lookups over that structured data (no string splitting) and stays provider-neutral, so `core/guards.js` and business routes keep importing it without touching any provider.
- Stub users (`providers/stub/users.js`) and test fixtures (`auth/testing/users.js`) switch to structured relationships in the same commit, together with their tests.
- The existing invariants carry over: malformed entries are skipped, all helpers fail closed on missing input, organisation names remain display-only, and the internal-vs-Defra ID-space warning stays on `organisation-access.js` and `guards.js`.
- **Deploy note:** sessions created before the release hold the old string-shaped profile. With normal session TTLs this self-heals; the parsed lookups fail closed on the old shape (no matching structured fields → no access, user re-logs in). Call this out in the release notes; no migration code.

### 2.5 URL stability constraint (hard requirement)

Redirect URIs are **registered with Defra ID per environment** (spec 002 §3). Therefore `/auth/callback` and `/auth/signed-out` must not move or be renamed — they stay bound to the Defra ID provider. `/auth/login` stays the canonical entry point (`errors.js` redirects 401s there) and dispatches to the configured default provider. Future providers get their own namespaced paths (e.g. `/auth/entra/login`, `/auth/entra/callback`) contributed via `extraRoutes()`. Nothing in this refactor changes any URL.

### 2.6 Configuration changes (shape only, no env-var renames)

All existing env vars keep their names and semantics.

1. Add `config.auth.defaultProvider` — computed, not a new env var: `'stub'` when `stubEnabled`, else `'defra-id'`. This replaces the scattered "stub replaces the real flow" decisions with one value the registry reads. (A future `AUTH_DEFAULT_PROVIDER` env var can override it when a second real provider lands — out of scope now.)
2. Move `isDefraIdConfigured()` out of `config/index.js` into `providers/defra-id/index.js` as the provider's `enabled` logic — config describes values, not provider policy.
3. `AUTH_RATE_LIMIT_WINDOW_SECONDS` / `AUTH_RATE_LIMIT_MAX` move into `config/index.js` (`config.rateLimit`) with integer rules in `validate.js`; `plugins/rate-limit.js` stops touching `process.env`. These are currently read at **module scope**, so `rate-limit.test.js` likely manipulates env before import — check that test first when executing this step.

## 3. Acceptance Criteria

Structure:

- [ ] **AC-1** The `src/auth/` tree matches §2.2; none of the old flat files remain; every moved module's co-located test moved with it.
- [ ] **AC-2** The §2.1 import-direction rules are enforced by `eslint-plugin-import` `no-restricted-paths` zones in `eslint.config.js`, and `npm run lint` fails on a violating import (verified by temporarily adding one).
- [ ] **AC-3** No route file imports another route file; `process.env` is read only under `src/config/` (both also covered by AC-2's zones where expressible, and by grep otherwise).

Behaviour preservation:

- [ ] **AC-4** Every `/auth/*` URL, method, and auth mode is unchanged: `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/signed-out`, `/auth/stub/login` (GET+POST), `/auth/defra-id` — asserted by the integration suite, which passes unmodified except for import paths and the AC-6 fixture shape.
- [ ] **AC-5** `npm test` green with coverage not below the pre-refactor baseline; `test/auth-integration.test.js` covers stub login, real-flow callback happy path, all four fail-closed callback branches (`state_mismatch`, `missing_code`, `token_exchange_failed`, `token_verification_failed`), discovery-failure on login, and logout with and without an id_token — same failure classes in logs/audit as today.
- [ ] **AC-6** Session profiles store relationships as `{ relationshipId, organisationId, organisationName }` objects (§2.4); no colon-format parsing exists outside `providers/defra-id/`; stub and test fixtures use the structured shape; org guard still fails closed for unknown/missing/non-member IDs.
- [ ] **AC-7** The spec-002 invariants checklist (§6 below) is walked and every item verified at final review; grep confirms no new log site emits tokens, id_tokens, claims payloads, or IdP response bodies.

Extensibility (the point of the work):

- [ ] **AC-8** Adding a provider touches only: a new `providers/<name>/` folder, one `registry.js` entry, a config block + `validate.js` rules — demonstrated by the README "How to add an auth provider" checklist, and sanity-checked by the reviewer against the Entra ID scenario.
- [ ] **AC-9** Rate-limit settings flow through `config/index.js` and `validateConfig()` (integer rules), with `rate-limit.test.js` updated accordingly; `config.auth.defaultProvider` is the single source of provider selection (router and login route no longer branch on `stubEnabled` themselves).

## 4. Out of Scope

- Any second real provider (Entra ID, magic link, API key…) — this refactor only builds the seam; each addition is its own spec.
- Refresh-token support (spec 002 Option B) and calling downstream APIs with access tokens.
- Renaming env vars; changing session cookie/TTL semantics; touching views, GOV.UK styling, or business-route behaviour.
- Migration code for pre-deploy sessions (§2.4 deploy note covers it).
- TypeScript / JSDoc-`checkJs` migration — the provider interface is written so it could be adopted later without restructuring.

## 5. Implementation Phases

All 8 phases are in scope for this work item (decided in refinement — no MVP cut). Every phase ends green (`npm test` + `npm run lint`), one commit each (per `.claude/skills/commit`), no behaviour change, and is a safe stopping point across sessions.

### Phase 0 — Safety net (½ h)

Run the full suite and record the coverage baseline. Confirm `test/auth-integration.test.js` exercises every AC-5 branch; add a thin integration case for any branch covered only by unit tests of the current layout — the unit tests move, the integration suite proves the refactor changed nothing.

### Phase 1 — Extract `core/` (mechanical, ~1 h)

`git mv` `session.js`, `return-to.js`, `audit.js`, `guards.js` (+ tests) → `src/auth/core/`. Extract `randomToken()` → `core/random.js`. Update importers (§7). `stub.js` now takes `randomToken` from core, killing half of the route→route import.

### Phase 2 — Extract `clients/oidc/` (mechanical, ~1 h)

`git mv` `discovery.js`, `token-endpoint.js`, `verify-token.js` (+ tests) → `src/auth/clients/oidc/`. Extract `codeChallengeS256()` → `clients/oidc/pkce.js`, add `createCodeVerifier()`. The module-level caches in `discovery.js`/`verify-token.js` are keyed by URL and therefore already safe to share across future providers — do not per-provider-ify them. `discovery.js`'s config import for its default TTL is acceptable under §2.1; optionally invert to caller-passed TTL.

### Phase 3 — Defra ID provider (~2–3 h, the substantive one)

Create `providers/defra-id/` per §2.2: `authorize-url.js` (Defra-specific `serviceId`, B2C scope convention, org-picker passthrough), `profile.js` + `relationships.js` implementing §2.4 normalisation (stub/test fixtures and `core/organisation-access.js` update in this same phase), and `index.js` — `DefraIdProvider` with `beginLogin` (today's `initiateRealLogin`), `completeLogin` (today's callback orchestration minus session/audit/redirect), `logoutRedirectUrl` (today's end-session URL building), `enabled` (the moved `isDefraIdConfigured`). Typed errors (`DiscoveryError`, `TokenExchangeError`, `TokenVerificationError`) stay in the client layer; the provider maps them to today's failure classes.

### Phase 4 — Stub provider + fixtures split (~1 h)

`providers/stub/{index,users}.js` implementing the same interface (`beginLogin` renders the chooser, `completeLogin` validates CSRF + resolves the chosen user, `logoutRedirectUrl` → null, `extraRoutes` → chooser GET/POST and `/auth/defra-id`). `auth/testing/users.js` ← `test-users.js`. `plugins/auth.js` shrinks to registering `core/scheme.js`; the scheme keeps its `config.isTest` branch but imports the fixture from `auth/testing/`.

### Phase 5 — Service layer + thin routes (~2 h)

`src/auth/service.js`: `beginLogin` / `completeLogin` / `logout`, each picking the provider from the registry and owning session writes, `regenerateSession`, audit, `safeReturnTo`, and the fail-closed policy. Routes become ~10-line handlers; `stub.js` imports nothing from `login.js` (the `/auth/defra-id` escape hatch resolves the defra-id provider through the registry). `plugins/router.js` builds its route list from static business routes + `registry.enabledProviders().flatMap(p => p.extraRoutes())`, deleting its stub/`isDefraIdConfigured` conditionals.

### Phase 6 — Config + rate-limit discipline (~1 h)

The §2.6 changes: `config.auth.defaultProvider`, rate-limit values into config + `validate.js`, `isDefraIdConfigured` relocation.

### Phase 7 — Docs, lint enforcement, spec sync (~1½ h)

README "How to add an auth provider" checklist (create `providers/<name>/`, implement the interface, register in `registry.js`, config block + `validate.js` rules, provider tests, register redirect URIs with the IdP). Add the `eslint-plugin-import` `no-restricted-paths` zones (AC-2) — this is in scope, not optional. Update spec 002 §2's architecture sketch (or add a pointer to this spec).

## 6. Invariants Checklist (verify at the end of every phase; AC-7 at final review)

1. All `/auth/*` URLs unchanged; `/auth/callback` and `/auth/signed-out` still the registered redirect URIs.
2. Deny-by-default still set before any route registration (plugin order in `server.js` untouched).
3. Callback still: single-use pre-auth read first → state check → error param → code → discovery → exchange → verify → regenerate → write profile — same order, same failure classes in logs/audit.
4. No token, id_token, claims payload, or IdP response body ever logged.
5. Session regeneration at both auth boundaries (login success, logout) — now asserted in exactly one file (`service.js`).
6. Stub routes absent when `AUTH_STUB_ENABLED=false`; stub hard-blocked in prod by `validateConfig`.
7. `x-test-user-type` bypass behaviour identical.
8. `process.env` read only in `src/config/` (after Phase 6).
9. No route file imports another route file (after Phase 5).

## 7. Import Map (what breaks when each file moves)

Complete list from the current import graph, verified 28 Jul 2026, so each phase's mechanical scope is known up front:

| Moved module                                      | Importers to update                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `auth/session.js` → `core/`                       | `plugins/auth.js`, `routes/auth/{callback,login,logout,stub}.js`                     |
| `auth/audit.js` → `core/`                         | `auth/guards.js`, `routes/auth/{callback,login,logout,stub}.js`                      |
| `auth/return-to.js` → `core/`                     | `routes/auth/{callback,login,stub}.js`                                               |
| `auth/guards.js` → `core/`                        | `routes/organisation.js`                                                             |
| `auth/organisation-access.js` → `core/` (§2.4)    | `auth/guards.js`, `routes/home.js`, `routes/organisation.js`                         |
| `auth/discovery.js` → `clients/oidc/`             | `routes/auth/{callback,login,logout}.js` (Phase 3 collapses these into the provider) |
| `auth/token-endpoint.js` → `clients/oidc/`        | `routes/auth/callback.js` (then provider)                                            |
| `auth/verify-token.js` → `clients/oidc/`          | `routes/auth/callback.js` (then provider)                                            |
| `auth/stub-users.js` → `providers/stub/`          | `routes/auth/stub.js`                                                                |
| `auth/test-users.js` → `auth/testing/`            | `plugins/auth.js` (then `core/scheme.js`)                                            |
| `randomToken` out of `routes/auth/login.js`       | `routes/auth/stub.js`                                                                |
| `initiateRealLogin` out of `routes/auth/login.js` | `routes/auth/stub.js` (via registry after Phase 5)                                   |

Plus each module's own co-located `.test.js`, and `test/auth-integration.test.js` where fixture shapes change (AC-6).

## 8. Risks and Uncertainties

**Overall risk: medium-low.** The flows are end-to-end covered by an integration suite, and phases are individually revertible commits.

- **Session-shape change (§2.4)** is the only intentional behavioural delta: pre-deploy sessions fail closed and re-authenticate. Mitigation: release note; deploy at a low-traffic time if it matters.
- **`rate-limit.test.js` module-scope env coupling** — the one test most likely to need real rework rather than path updates. Mitigation: read it before Phase 6, adapt to config-shaped overrides.
- **Silent auth-mode drift in tests**: the `config.isTest` scheme bypass means route tests never exercise the real session scheme; the refactor must not accidentally widen that bypass. Mitigation: invariant 7 + AC-5's integration branches, which run with the bypass disabled via mocked IdP.
- **Scope creep**: this refactor invites "while I'm here" improvements. Anything not in §3 is out (§4) — new ideas become new work items.

## 9. Effort Estimate

Roughly one focused day (~9–10 h): Phases 0–2 mechanical (~2½ h), Phase 3 substantive (~2–3 h), Phases 4–7 (~4½ h). Each phase is a safe stopping point, so it also splits cleanly across sessions — or hand each phase to an agent with §6 as its acceptance gate.

## 10. Next Steps

1. Work through the tracked work items in §11, in order — WI-1 first; nothing is parallelisable (each item builds on the layer the previous one created).
2. Treat §3 as the definition of done for the whole initiative and §6 as the gate at the end of every work item.

## 11. Work Item Breakdown (added by decomposition workshop, 28 Jul 2026)

The 8 phases merge into 5 tracked work items, sized for one focused session each (1–3 h). The chain is strictly sequential — each item depends on the layer the previous one extracted:

```
WI-1: Safety net + extract core/            (Phases 0–1, ~1½ h)
  └─ WI-2: Extract OIDC client layer        (Phase 2,    ~1 h)
       └─ WI-3: Defra ID provider           (Phase 3,    ~2–3 h)
            └─ WI-4: Stub provider, service layer, thin routes
                                            (Phases 4–5, ~3 h)
                 └─ WI-5: Config, docs, lint enforcement
                                            (Phases 6–7, ~2½ h)
```

Every work item inherits the standing constraints: no behaviour change, no URL change, `npm test` + `npm run lint` green at completion, §6 invariants walked before closing, one commit per phase within the item.

### WI-1: Safety net + extract auth core

**Type:** Task · **Priority:** P1 · **Depends on:** None · **Phases:** 0–1

Record the coverage baseline and confirm `test/auth-integration.test.js` covers every AC-5 branch (add thin integration cases for any branch covered only by unit tests of the current layout). Then `git mv` `session.js`, `return-to.js`, `audit.js`, `guards.js` (+ tests) into `src/auth/core/` and extract `randomToken()` into `core/random.js`, updating importers per §7.

- [ ] Coverage baseline recorded (number noted in the WI-1 commit message or PR description)
- [ ] Integration suite exercises: stub login, callback happy path, all four fail-closed branches, discovery-failure on login, logout with/without id_token
- [ ] `core/` contains session, return-to, audit, guards, random (+ tests); old locations gone
- [ ] `routes/auth/stub.js` imports `randomToken` from `core/random.js`, not from `login.js`
- [ ] Suite and lint green; zero behaviour change

### WI-2: Extract OIDC client layer

**Type:** Task · **Priority:** P1 · **Depends on:** WI-1 · **Phases:** 2

`git mv` `discovery.js`, `token-endpoint.js`, `verify-token.js` (+ tests) into `src/auth/clients/oidc/`; extract `codeChallengeS256()` into `clients/oidc/pkce.js` and add `createCodeVerifier()` (wrapping `core/random.js` — hence the WI-1 dependency).

- [ ] `clients/oidc/` contains discovery, token-endpoint, verify-token, pkce (+ tests)
- [ ] Module-level caches unchanged and still URL-keyed (not per-provider-ified)
- [ ] `routes/auth/login.js` uses `clients/oidc/pkce.js`; no protocol crypto remains in route files
- [ ] Suite and lint green; zero behaviour change

### WI-3: Defra ID provider + relationships normalisation

**Type:** Task · **Priority:** P1 · **Depends on:** WI-2 · **Phases:** 3

Create `providers/defra-id/` (`index.js`, `authorize-url.js`, `profile.js`, `relationships.js`) implementing the §2.3 interface, absorbing `initiateRealLogin`, the callback orchestration, the end-session URL building, and `isDefraIdConfigured` as `enabled`. Implement §2.4 normalisation in the same item: structured relationship objects in the profile, `core/organisation-access.js` reduced to structured lookups, stub/test fixtures and their tests updated in the same commit.

- [ ] `DefraIdProvider` implements `name`/`enabled`/`beginLogin`/`completeLogin`/`logoutRedirectUrl`/`extraRoutes`
- [ ] Session profile stores `{ relationshipId, organisationId, organisationName }` objects (AC-6); no colon parsing outside `providers/defra-id/`
- [ ] `core/organisation-access.js` is provider-neutral; guard fail-closed behaviour preserved for unknown/missing/non-member IDs
- [ ] Typed client errors mapped to today's failure classes; identical log/audit output shapes
- [ ] Stub and test fixtures use structured relationships; suite and lint green

### WI-4: Stub provider, service layer, thin routes

**Type:** Task · **Priority:** P1 · **Depends on:** WI-3 · **Phases:** 4–5

Create `providers/stub/` (chooser as `beginLogin`/`extraRoutes`, CSRF-checked `completeLogin`, null `logoutRedirectUrl`) and move `test-users.js` to `auth/testing/`. Extract `core/scheme.js` from `plugins/auth.js`. Create `src/auth/service.js` owning session writes, `regenerateSession`, audit, `safeReturnTo`, and the fail-closed policy; thin all four auth routes to delegating handlers; `plugins/router.js` composes routes from the registry.

- [ ] `service.js` is the only file writing the verified profile or calling `regenerateSession`
- [ ] All auth route handlers are thin delegates; no route file imports another route file
- [ ] `plugins/router.js` gets provider routes from `registry.enabledProviders().flatMap(p => p.extraRoutes())`; its stub/`isDefraIdConfigured` conditionals deleted
- [ ] Every `/auth/*` URL, method, and auth mode unchanged (AC-4); stub routes still absent when `AUTH_STUB_ENABLED=false`
- [ ] `x-test-user-type` bypass behaviour identical; suite and lint green

### WI-5: Config discipline, docs, lint enforcement

**Type:** Task · **Priority:** P1 · **Depends on:** WI-4 · **Phases:** 6–7

Apply §2.6 (read `rate-limit.test.js` first — module-scope env coupling, §8): `config.auth.defaultProvider` as the single provider-selection source, rate-limit values through `config/index.js` + `validate.js`, `isDefraIdConfigured` fully relocated. Then the README "How to add an auth provider" checklist, the `eslint-plugin-import` `no-restricted-paths` zones, and the spec 002 pointer. Close with the full AC-7 invariants walk.

- [ ] No `process.env` reads outside `src/config/`; rate-limit values validated at boot (AC-9)
- [ ] `npm run lint` fails on a layer-violating import (AC-2, verified by temporarily adding one)
- [ ] README provider checklist present; adding a provider touches only `providers/<name>/`, `registry.js`, config + validation (AC-8)
- [ ] Spec 002 §2 updated or pointed at this spec
- [ ] Final review: all §3 acceptance criteria checked, §6 invariants walked, coverage ≥ WI-1 baseline (AC-7)
