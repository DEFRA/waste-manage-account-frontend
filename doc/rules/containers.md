# Container standards

Adapted for this repo from the DEFRA [container standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/container_standards.md) and [deployment standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/deployment_standards.md). Last synced 30 July 2026.

## Standards

- Bespoke software is delivered as Docker containers; images are created using Docker and container builds are defined with Docker Compose (`compose.yml`).
- Linux containers only.
- **Images extend the Defra base images** — this repo uses [`defradigital/node`](https://hub.docker.com/r/defradigital/node) (production) and [`defradigital/node-development`](https://hub.docker.com/r/defradigital/node-development) (development), built from [DEFRA/defra-docker-node](https://github.com/DEFRA/defra-docker-node). Keep the `PARENT_VERSION` build arg in step with the Node version in `.nvmrc`.
- **Containers never run as root.** Containers are not trust boundaries. The Dockerfile runs as the `node` user; if a step needs `USER root` (e.g. installing an OS package), switch back to `USER node` immediately after.
- Production images are **immutable**: once built they do not change, but can be configured. All per-environment behaviour comes from environment variables (managed through convict in `src/config`), never values baked into the image.
- Images are **self-contained** and carry all runtime dependencies — no reliance on the host for application dependencies. Use `npm ci --omit=dev` for the production stage.
- Images are tagged using semantic versioning, kept in sync with the application version in `package.json`.
- Public images are signed so consumers can verify their source.

## In this repo

The multi-stage `Dockerfile` follows the CDP pattern: a `development` stage from the development parent image, a `production_build` stage, and a minimal `production` stage from the production parent image. Preserve that structure when changing the build.
