# waste-manage-account-frontend

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_waste-manage-account-frontend&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_waste-manage-account-frontend)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_waste-manage-account-frontend&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_waste-manage-account-frontend)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_waste-manage-account-frontend&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_waste-manage-account-frontend)

Core delivery platform Node.js Frontend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Server-side Caching](#server-side-caching)
- [Redis](#redis)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [DEFRA ID authentication](#defra-id-authentication)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Deployment](#deployment)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd waste-manage-account-frontend
nvm use
```

## Server-side Caching

We use Catbox for server-side caching. By default the service will use CatboxRedis when deployed and CatboxMemory for
local development.
You can override the default behaviour by setting the `SESSION_CACHE_ENGINE` environment variable to either `redis` or
`memory`.

Please note: CatboxMemory (`memory`) is _not_ suitable for production use! The cache will not be shared between each
instance of the service and it will not persist between restarts.

## Redis

Redis is an in-memory key-value store. Every instance of a service has access to the same Redis key-value store similar
to how services might have a database (or MongoDB). All frontend services are given access to a namespaced prefixed that
matches the service name. e.g. `my-service` will have access to everything in Redis that is prefixed with `my-service`.

If your service does not require a session cache to be shared between instances or if you don't require Redis, you can
disable setting `SESSION_CACHE_ENGINE=false` or changing the default value in `src/config/index.js`.

## Proxy

We are using forward-proxy which is set up by default. To make use of this: `import { fetch } from 'undici'` then
because of the `setGlobalDispatcher(new ProxyAgent(proxyUrl))` calls will use the ProxyAgent Dispatcher

If you are not using Wreck, Axios or Undici or a similar http that uses `Request`. Then you may have to provide the
proxy dispatcher:

To add the dispatcher to your own client:

```javascript
import { ProxyAgent } from 'undici'

return await fetch(url, {
  dispatcher: new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 10,
    keepAliveMaxTimeout: 10
  })
})
```

## Local Development

### Setup

Install application dependencies:

```bash
npm install
```

### Git hooks

Install git hooks (optional)

```bash
npm run git:hooks
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### DEFRA ID authentication

Every route requires sign-in by default (`server.auth.default('session')`), backed by
[DEFRA ID](https://github.com/DEFRA/software-development-standards) via `@hapi/bell`. Locally this
runs against the [cdp-defra-id-stub](https://github.com/DEFRA/cdp-defra-id-stub), never real DEFRA
ID — the `defraId.*` config defaults in [src/config/config.js](./src/config/config.js) already point
at the stub, so no environment setup is required.

#### Starting the stub

The stub needs Redis for its own session storage. Start both alongside the rest of the stack:

```bash
docker compose up -d redis cdp-defra-id-stub
```

This publishes the stub on <http://localhost:3200>. Whether you then run this app via
`docker compose up` (as the `your-frontend` service) or standalone via `npm run dev`, the default
`defraId.discoveryUrl` (`http://localhost:3200/cdp-defra-id-stub/.well-known/openid-configuration`)
resolves correctly in both cases — `compose.yml` remaps `localhost` inside the `your-frontend`
container back to the stub's published port via `extra_hosts: - 'localhost:host-gateway'`, so no
`DEFRA_ID_*` overrides are needed either way.

#### Signing in

Visit <http://localhost:3000/auth/sign-in>. The stub redirects to its own login page; if no test
user has been registered yet, it redirects on to a registration form instead. Fill that in (or an
existing user) to complete sign-in and get redirected back to this app.

#### Registering a test user via the API

Instead of the interactive form, you can pre-register a user directly:

```bash
curl -H "Content-Type: application/json" -X POST \
  -d '{
    "userId": "86a7607c-a1e7-41e5-a0b6-a41680d05a2a",
    "email": "test.user@example.com",
    "firstName": "Test",
    "lastName": "User",
    "loa": "1",
    "aal": "1",
    "enrolmentCount": 1,
    "enrolmentRequestCount": 1,
    "relationships": [
      {
        "organisationName": "Test Organisation",
        "relationshipRole": "Employee",
        "roleName": "Test role",
        "roleStatus": "1"
      }
    ]
  }' \
  http://localhost:3200/cdp-defra-id-stub/API/register
```

The stub's registrations store runs in-memory in this repo's `compose.yml`
(`REGISTRATIONS_STORE_ENGINE: memory`), so registered users don't survive a stub container restart.

#### Redirect URLs

This app's callback routes — `GET /auth/sign-in-oidc` and `GET /auth/sign-out-oidc` — are built from
`defraId.callbackBaseUrl` (default `http://localhost:3000`). The stub doesn't enforce redirect URL
registration the way a real DEFRA ID tenant does, but when onboarding a real tenant both
`{callbackBaseUrl}/auth/sign-in-oidc` and `{callbackBaseUrl}/auth/sign-out-oidc` must be registered
with DEFRA ID for each deployed environment.

#### Using real DEFRA ID instead

The code has no notion of "stub mode" — which provider the app talks to is decided entirely by
per-environment configuration. Override the `DEFRA_ID_*` environment variables (see
`src/config/config.js` for the full list) with your tenant's discovery URL and credentials:
`DEFRA_ID_DISCOVERY_URL`, `DEFRA_ID_CLIENT_ID`, `DEFRA_ID_CLIENT_SECRET`, `DEFRA_ID_SERVICE_ID`,
plus the two values that stay unset while an environment runs the stub:

- `DEFRA_ID_POLICY` — the Azure B2C policy from DEFRA ID onboarding, sent as the `p` authorize
  param only when set. The stub rejects unknown authorize params, so stub environments leave this
  empty.
- `DEFRA_ID_SCOPES` — comma separated, defaults to `openid,offline_access`. A real tenant needs the
  client id appended (e.g. `openid,offline_access,<client id>`) for an access token to be issued;
  the stub rejects the bare client id scope, so stub environments keep the default.

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## Docker

### Development image

> [!TIP]
> For Apple Silicon users, you may need to add `--platform linux/amd64` to the `docker run` command to ensure
> compatibility fEx: `docker build --platform=linux/arm64 --no-cache --tag waste-manage-account-frontend`

Build:

```bash
docker build --target development --no-cache --tag waste-manage-account-frontend:development .
```

Run:

```bash
docker run -p 3000:3000 waste-manage-account-frontend:development
```

### Production image

Build:

```bash
docker build --no-cache --tag waste-manage-account-frontend .
```

Run:

```bash
docker run -p 3000:3000 waste-manage-account-frontend
```

### Docker Compose

A local environment with:

- Floci (replacing Localstack) for AWS services (S3, SQS)
- Redis
- MongoDB
- [cdp-defra-id-stub](https://github.com/DEFRA/cdp-defra-id-stub) — see
  [DEFRA ID authentication](#defra-id-authentication)
- This service.
- A commented out backend example.

```bash
docker compose up --build -d
```

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties).

## Deployment

The following environment variables hold secrets and must be configured for each environment as part
of the release:

```dotenv
SESSION_COOKIE_PASSWORD=
DEFRA_ID_CLIENT_SECRET=
```

- `SESSION_COOKIE_PASSWORD` — password used to encrypt the session cookie; must be at least 32
  characters and unique per environment.
- `DEFRA_ID_CLIENT_SECRET` — client secret for the environment's DEFRA ID tenant (see
  [DEFRA ID authentication](#defra-id-authentication)).

Set them as environment secrets — never commit their values to the repository. All other
configuration has sensible defaults in [src/config/config.js](./src/config/config.js) and can be
overridden per environment with the corresponding environment variables.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
