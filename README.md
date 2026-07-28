# waste-manage-account-frontend

GOV.UK frontend for the Defra waste management account service.

The service will become the public-facing account area for managing waste
services. This repository is built from the
[DEFRA CDP Node.js Frontend Template](https://github.com/DEFRA/cdp-node-frontend-template)
and currently serves a GOV.UK-styled home page at `/`, a CDP health check at
`/health`, GOV.UK-styled 404/500 error pages, and sign-in to the service via
Defra ID, Defra's OpenID Connect identity platform (see
[`specs/002-defra-id-integration-spec.md`](specs/002-defra-id-integration-spec.md)).
Every route other than `/health` and `/public/*` requires a signed-in session.

The stack is Hapi + Nunjucks + [GOV.UK Frontend](https://design-system.service.gov.uk/),
with Vite for client asset builds, Vitest for tests, and structured pino
logging. All work follows the
[Defra Software Development Standards](https://defra.github.io/software-development-standards/).

## Prerequisites

- [Node.js](https://nodejs.org/) Active LTS (currently v24), ideally managed
  with [nvm](https://github.com/nvm-sh/nvm) — the version is pinned in
  [`.nvmrc`](.nvmrc)
- [npm](https://docs.npmjs.com/) v11+ (bundled with Node 24)
- [Docker](https://www.docker.com/) with Docker Compose (optional — only needed
  for container builds and the local stack)

## Setup

```bash
nvm use
npm install
npm run git:hooks
```

> **Note:** `npm run git:hooks` is a required manual step. The repository's
> [`.npmrc`](.npmrc) sets `ignore-scripts=true` (a Defra supply-chain security
> setting), so Husky cannot self-install via a `prepare` script. The hooks run
> format/lint checks on commit and tests on push.

## Running in development

```bash
npm run build:frontend
npm run dev
```

This builds the client assets (GOV.UK Frontend styles into `.public/`) and
starts the server on http://localhost:3000 with nodemon reloading on `js`,
`njk`, and `json` changes.

### Configuration

All configuration comes from environment variables — no secrets are ever
committed to this repository. Copy [`.env.example`](.env.example) to `.env`
(git-ignored) as a starting point; every variable below is documented there
with its default and purpose.

| Variable               | Default                               | Description                                    |
| ---------------------- | ------------------------------------- | ---------------------------------------------- |
| `PORT`                 | `3000`                                | Port the server listens on                     |
| `HOST`                 | `0.0.0.0`                             | Address the server binds to                    |
| `LOG_LEVEL`            | `info`                                | pino log level                                 |
| `SESSION_CACHE_ENGINE` | `memory` (`redis` when in production) | Catbox cache engine: `memory` or `redis`       |
| `SESSION_CACHE_NAME`   | `session`                             | Name of the provisioned Catbox cache           |
| `REDIS_HOST`           | `127.0.0.1`                           | Redis host (only used with the `redis` engine) |
| `REDIS_PORT`           | `6379`                                | Redis port (only used with the `redis` engine) |

#### Defra ID authentication (spec §9)

| Variable                               | Default                          | Description                                                                                                             |
| -------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`                          | `local`                          | `local` \| `dev` \| `test` \| `pre-prod` \| `prod` — drives the validation rules below                                  |
| `AUTH_STUB_ENABLED`                    | `true` unless `ENVIRONMENT=prod` | Fake sign-in with predefined canned users, no IdP required — refused at boot when `ENVIRONMENT=prod` even if set `true` |
| `AUTH_CALLBACK_BASE_URL`               | `http://localhost:3000`          | Public base URL used to build the OIDC redirect URI; must be `https://` when `ENVIRONMENT` is `pre-prod` or `prod`      |
| `SESSION_SECRET`                       | — (required)                     | Cookie signing key, ≥ 32 chars — required everywhere except `NODE_ENV=test`                                             |
| `SESSION_IDLE_TTL_MINUTES`             | `240`                            | Idle session timeout                                                                                                    |
| `SESSION_ABSOLUTE_TTL_MINUTES`         | `720`                            | Absolute session lifetime                                                                                               |
| `DEFRA_ID_DISCOVERY_URL`               | —                                | Full `.well-known/openid-configuration` URL — required whenever `AUTH_STUB_ENABLED=false`                               |
| `DEFRA_ID_CLIENT_ID`                   | —                                | Client ID from Defra ID onboarding — required whenever `AUTH_STUB_ENABLED=false`                                        |
| `DEFRA_ID_CLIENT_SECRET`               | —                                | Client secret from Defra ID onboarding — required whenever `AUTH_STUB_ENABLED=false`                                    |
| `DEFRA_ID_SERVICE_ID`                  | —                                | Service ID from Defra ID onboarding — required whenever `AUTH_STUB_ENABLED=false`                                       |
| `DEFRA_ID_PKCE_ENABLED`                | `true`                           | Send PKCE (`code_challenge`/`code_verifier`) params                                                                     |
| `DEFRA_ID_CLOCK_TOLERANCE_SECONDS`     | `60`                             | Allowed clock skew when checking `id_token` `exp`/`nbf`                                                                 |
| `DEFRA_ID_DISCOVERY_CACHE_TTL_SECONDS` | `3600`                           | How long a fetched discovery document is cached                                                                         |
| `DEFRA_ID_REFRESH_ENABLED`             | `false`                          | Enables refresh-token handling — roadmap extension, not used in v1                                                      |

`createServer()` runs a fail-fast `validateConfig()` check
(`src/config/validate.js`) against this matrix at boot: an invalid
combination (e.g. stub disabled with no client credentials, or a
misconfigured `ENVIRONMENT`) throws immediately instead of surfacing as a
broken sign-in flow later.

With no `.env` at all, the app boots in stub mode: every route redirects
unauthenticated visitors to a chooser of predefined fake users
(`/auth/stub/login`) rather than a real IdP — this is the default for
`npm run dev`. To exercise the real Defra ID OIDC flow with zero real
credentials, use the demo below; to point at real Defra ID (e.g. CPDEV), set
`AUTH_STUB_ENABLED=false` plus the four `DEFRA_ID_*` onboarding values and an
`https://` `AUTH_CALLBACK_BASE_URL`.

### Demo: Defra ID sign-in

```bash
npm install
npm run demo
```

This builds the client assets, starts an in-process mock Defra ID on `:3939`
(`test/helpers/mock-idp.js` — the same mock the integration tests use), and
starts the app on `:3000` with stub mode off, so the real OIDC code path runs
end to end against it. No external network access or real credentials are
involved (spec §11).

1. Open <http://localhost:3000/> — redirected to `/auth/login`, which
   redirects to the mock IdP's persona picker (the real OIDC authorize
   redirect, with `state`/`nonce`/PKCE visible on the URL).
2. Pick a persona (e.g. _Amina Khan — Acme Recycling Ltd + Beta Waste Ltd_) —
   the mock IdP redirects back with a code, the app exchanges it, verifies the
   RS256 `id_token` against the mock's JWKS, and builds the session.
3. The home page shows the verified claims, parsed relationships, and current
   organisation.
4. Visit `/organisation/org-acme` (a member of that persona's organisation — 200) and `/organisation/org-does-not-exist` (403) to see the fail-closed
   organisation guard.
5. Sign out — federated logout via the mock's end-session endpoint, landing on
   `/auth/signed-out`.
6. Try the mock's "tamper" toggle on the persona picker, or replay a callback
   URL, to see both rejected.

To see the no-IdP path instead, stop the demo and run
`npm run build:frontend && npm run dev` — stub mode is on by default outside
`ENVIRONMENT=prod`, so `/auth/login` goes straight to the stub chooser. Run
`npm test` to see the `NODE_ENV=test` auth bypass used by the automated suite.

Switching either the demo or a stub-mode run to real Defra ID (CPDEV) only
ever requires environment variable changes — no code changes.

### Adding a new auth provider

Auth is layered per `specs/003-auth-refactor.md` §2 so a second identity
source (e.g. Entra ID for internal staff, or a non-OIDC mechanism like a
magic link) never touches `src/routes/`, `src/auth/service.js`, or the
existing providers. Adding one touches only:

1. **A new `src/auth/providers/<name>/` folder** implementing the
   `AuthProvider` interface (`specs/003-auth-refactor.md` §2.3): `name`,
   `enabled(request)`, `beginLogin(request)`, `completeLogin(request)`,
   `logoutRedirectUrl({ idToken, request })`, `extraRoutes()`. Reuse
   `src/auth/clients/oidc/` for any OIDC-based provider (discovery, token
   exchange, JWKS verification, PKCE); a non-OIDC provider only needs
   `src/auth/core/` (session, guards, audit, return-to, random tokens).
2. **One entry in `src/auth/providers/registry.js`** — add the provider to
   the `PROVIDERS` map; `enabledProviders()` and `service.js` pick it up
   automatically.
3. **A config block + `validate.js` rules** — add the provider's env vars to
   `src/config/index.js` (mirroring the existing `defraId` block) and any
   required-value/format rules to `src/config/validate.js` (mirroring the
   existing `DEFRA_ID_REQUIRED` matrix).
4. **Provider tests** — a colocated `index.test.js` covering `beginLogin`/
   `completeLogin`/`logoutRedirectUrl`/`extraRoutes`, plus an integration
   test in `test/auth-integration.test.js` exercising it end to end (a mock
   IdP for OIDC providers, following `test/helpers/mock-idp.js`).
5. **Register redirect URIs with the IdP** — a real (non-mock) provider needs
   its callback and post-logout redirect URIs allow-listed with the IdP for
   every environment, same as the Defra ID prerequisites in
   `specs/002-defra-id-integration-spec.md` §3.

`src/routes/auth/{login,callback,logout}.js` stay on their existing,
URL-stable paths (spec §2.5) and only ever call `src/auth/service.js`, which
resolves the right provider by name — no route, service, or router change is
needed to add a provider. `npm run lint` enforces the layer boundaries
(`eslint.config.js`'s `import/no-restricted-paths` zones): a provider that
reaches into `service.js` or `routes/`, or a route that imports a provider or
client directly, fails lint.

## Running the tests

```bash
npm test
```

Runs the Vitest suite, including route tests for `/`, `/health`, and the error
pages, plus an automated axe-core accessibility check of the home page.
`npm run test:watch` runs the suite in watch mode.

### Linting and formatting

```bash
npm run lint          # ESLint (neostandard, unmodified) + Stylelint (GDS)
npm run format:check  # Prettier check
npm run format        # Prettier write
```

## Running in production mode

```bash
npm run build:frontend
npm start
```

### Docker

The [`Dockerfile`](Dockerfile) has `development` and `production` targets:

```bash
docker build --target development --tag waste-manage-account-frontend:dev .
docker build --target production --tag waste-manage-account-frontend .
docker run -e SESSION_CACHE_ENGINE=memory -p 3000:3000 waste-manage-account-frontend
```

The production image defaults to the Redis session cache and fails fast if
Redis is unreachable — pass `SESSION_CACHE_ENGINE=memory` for a standalone run,
or use the Compose stack below which provides Redis.

### Docker Compose local stack

```bash
docker compose up --build -d
```

Starts the frontend with Redis, MongoDB, and Floci (AWS emulation), matching
the CDP local development stack.

## Branching and contributing

- `main` is protected: changes land via pull request with required status
  checks (lint, format, tests) and at least one approving review — no direct
  pushes.
- Work happens on short-lived feature branches created from `main` and merged
  back via pull request, per the
  [Defra version control standards](https://defra.github.io/software-development-standards/standards/version_control_standards/).
- Commits follow conventional-commit style (`feat:`, `fix:`, `build:`,
  `chore:`, ...), and the Husky hooks enforce the quality gates locally before
  commit and push.
- Releases are tagged with semantic versioning (e.g. `v0.1.0`) and the version
  is kept in [`package.json`](package.json).

Pull requests run CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
`npm ci`, asset build, Prettier format check, ESLint/Stylelint, the Vitest
suite, and the SonarCloud quality gate.

## Licence

This project is licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
— see [LICENSE](LICENSE).

> Contains public sector information licensed under the Open Government
> Licence v3.0.
