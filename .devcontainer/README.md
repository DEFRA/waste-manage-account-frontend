# Dev container

VS Code / Cursor development environment for this service. Opens the app in a Node 24 container with Redis on the same Docker network.

## Services

Defined in [`docker-compose.yml`](./docker-compose.yml):

| Service | Image                                                         | Role                                     |
| ------- | ------------------------------------------------------------- | ---------------------------------------- |
| `app`   | `mcr.microsoft.com/devcontainers/javascript-node:24-bookworm` | Workspace and runtime                    |
| `redis` | `redis:7.2.3-alpine3.18`                                      | Session / cache store (hostname `redis`) |

Both join the `cdp-tenant` bridge network so the app can reach Redis as `redis:6379`.

## Opening the container

1. Install the Dev Containers extension (VS Code) or use Cursor’s equivalent.
2. Open this repository and choose **Reopen in Container**.
3. `postCreateCommand` runs `npm ci` on first create.

## Ports

Forwarded from [`devcontainer.json`](./devcontainer.json):

| Port   | Purpose          |
| ------ | ---------------- |
| `3000` | Application      |
| `9229` | Node.js debugger |
| `6379` | Redis            |

## Environment

`remoteEnv` sets local-friendly defaults:

| Variable                    | Value         | Why                                   |
| --------------------------- | ------------- | ------------------------------------- |
| `NODE_ENV`                  | `development` | Dev server / Vite middleware          |
| `REDIS_HOST`                | `redis`       | Compose service name                  |
| `REDIS_TLS`                 | `false`       | No TLS inside the compose network     |
| `USE_SINGLE_INSTANCE_CACHE` | `true`        | Single Redis instance (not a cluster) |
| `SESSION_COOKIE_SECURE`     | `false`       | Allow HTTP on localhost               |
| `LOG_FORMAT`                | `pino-pretty` | Readable logs                         |
| `AWS_EMF_ENVIRONMENT`       | `Local`       | Local metrics behaviour               |

Session cache still defaults to **in-memory** outside production (`SESSION_CACHE_ENGINE=memory`). Redis is available when you need it; set `SESSION_CACHE_ENGINE=redis` to use it.

## Day-to-day commands

```bash
npm run dev          # app at http://localhost:3000
npm test             # see note below
npm run lint
npm run format:check
```

### Running tests in the container

`NODE_ENV=development` and `REDIS_HOST=redis` are correct for the app, but some unit tests assume defaults (`NODE_ENV=test`, Redis host `127.0.0.1`). Override them when running the suite:

```bash
NODE_ENV=test REDIS_HOST=127.0.0.1 npm test
```

Full gate:

```bash
npm run security-audit && npm run format:check && npm run lint && NODE_ENV=test REDIS_HOST=127.0.0.1 npm test
```

## Files

- [`devcontainer.json`](./devcontainer.json) — container config, ports, extensions, env
- [`docker-compose.yml`](./docker-compose.yml) — `app` + `redis` services
