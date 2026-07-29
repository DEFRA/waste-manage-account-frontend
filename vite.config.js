import { cpSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// GOV.UK Frontend's fonts, images, and manifest are referenced by the compiled
// stylesheet (via $govuk-assets-path) and the page template's assetPath, so
// they must ship alongside the built stylesheet.
function copyGovukAssets() {
  return {
    name: 'copy-govuk-assets',
    closeBundle() {
      cpSync(
        path.join(
          dirname,
          'node_modules',
          'govuk-frontend',
          'dist',
          'govuk',
          'assets'
        ),
        path.join(dirname, '.public', 'assets'),
        { recursive: true }
      )
    }
  }
}

export default defineConfig({
  publicDir: false,
  css: {
    // govuk-frontend's CSS contains legacy IE hacks (`@media (min-width: 0\0)`)
    // that lightningcss otherwise rejects; modern browsers ignore them anyway.
    lightningcss: {
      errorRecovery: true
    }
  },
  build: {
    outDir: '.public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        application: path.join(
          dirname,
          'src',
          'client',
          'stylesheets',
          'application.scss'
        )
      },
      output: {
        // Unhashed names so the base layout can link the stylesheet directly
        // without a manifest lookup.
        assetFileNames: 'stylesheets/[name][extname]'
      }
    }
  },
  plugins: [copyGovukAssets()],
  test: {
    coverage: {
      provider: 'v8',
      // lcov feeds SonarCloud (sonar.javascript.lcov.reportPaths); text is the
      // human-readable summary in local/CI logs.
      reporter: ['text', 'lcov'],
      // Explicit include so uncovered source files still count against
      // coverage instead of silently dropping out of the report.
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js']
    }
  }
})
