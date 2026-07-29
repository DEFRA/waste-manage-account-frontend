# Multi-target build following the CDP node frontend template layout:
#   development      — full toolchain, runs nodemon for local container dev
#   production-build — prunes dev dependencies after the asset build
#   production       — minimal runtime image (default target)
# Official multi-arch node images stand in for CDP's defradigital/node pair,
# which are amd64-only and pinned to the platform's own Node line.
ARG NODE_VERSION=24
ARG PORT=3000

FROM node:${NODE_VERSION}-alpine AS development

ENV TZ="Europe/London"

RUN mkdir -p /home/node/app && chown node:node /home/node/app
WORKDIR /home/node/app
USER node

# .npmrc must be present so installs keep the Defra security settings
# (save-exact, ignore-scripts, min-release-age) inside the image too.
COPY --chown=node:node package.json package-lock.json .npmrc ./
RUN npm ci

COPY --chown=node:node . .
RUN npm run build:frontend

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["npm", "run", "dev"]

FROM development AS production-build

ENV NODE_ENV=production

RUN npm ci --omit=dev

FROM node:${NODE_VERSION}-alpine AS production

ENV TZ="Europe/London"
ENV NODE_ENV=production

# curl is a CDP platform healthcheck requirement.
RUN apk add --no-cache curl

WORKDIR /home/node/app

COPY --from=production-build --chown=node:node /home/node/app/package.json ./
COPY --from=production-build --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=production-build --chown=node:node /home/node/app/.public ./.public
COPY --from=production-build --chown=node:node /home/node/app/src ./src

USER node

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["node", "."]
