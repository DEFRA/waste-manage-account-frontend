import path from 'node:path'
import { readFileSync } from 'node:fs'

import { config } from '#/config/config.js'
import { buildNavigation } from './build-navigation.js'
import { createLogger } from '#/server/common/helpers/logging/logger.js'

const logger = createLogger()
const assetPath = config.get('assetPath')
const manifestPath = path.join(
  config.get('root'),
  '.public/.vite/manifest.json'
)

let viteManifest

/**
 * Reads the auth session from server.app.cache to expose only a display
 * name and signed-in flag to views - never token or claim contents. A cache
 * failure degrades to signed-out rather than failing the whole page render.
 */
async function buildAuthContext(request) {
  if (!request.auth?.isAuthenticated) {
    return { isAuthenticated: false }
  }

  try {
    const session = await request.server.app.cache.get(
      request.auth.credentials.sessionId
    )

    return {
      isAuthenticated: true,
      displayName: session?.profile?.displayName ?? ''
    }
  } catch (error) {
    logger.error(`Failed to load auth session for view context: ${error}`)
    return { isAuthenticated: false }
  }
}

export async function context(request) {
  if (config.get('isProduction') && !viteManifest) {
    try {
      viteManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      logger.error(`Vite ${path.basename(manifestPath)} not found`)
    }
  }

  const auth = await buildAuthContext(request)

  return {
    assetPath: `${assetPath}/assets`,
    serviceName: config.get('serviceName'),
    serviceUrl: '/',
    breadcrumbs: [],
    navigation: buildNavigation(request, auth),
    auth,
    getAssetPath(asset) {
      if (!config.get('isProduction')) {
        return `${assetPath}/${asset}`
      }

      const viteAssetPath = viteManifest?.[asset]?.file
      return `${assetPath}/${viteAssetPath ?? asset}`
    }
  }
}
