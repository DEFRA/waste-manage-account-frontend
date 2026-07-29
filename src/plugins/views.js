import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Vision from '@hapi/vision'
import nunjucks from 'nunjucks'

import { config } from '../config/index.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '..', '..')

// govuk-frontend's dist root must be a nunjucks search path so that
// "govuk/template.njk" and the component macro imports inside it resolve.
const nunjucksEnvironment = nunjucks.configure(
  [
    path.join(projectRoot, 'src', 'views'),
    path.join(projectRoot, 'node_modules', 'govuk-frontend', 'dist')
  ],
  {
    autoescape: true,
    trimBlocks: true,
    lstripBlocks: true,
    noCache: !config.isProduction
  }
)

export const views = {
  plugin: Vision,
  options: {
    engines: {
      njk: {
        compile(src, options) {
          const template = nunjucks.compile(src, options.environment)
          return (context) => template.render(context)
        }
      }
    },
    compileOptions: {
      environment: nunjucksEnvironment
    },
    relativeTo: projectRoot,
    path: 'src/views',
    isCached: config.isProduction,
    context: {
      // serviceName drives the GOV.UK template's service navigation
      serviceName: config.serviceName,
      serviceUrl: '/',
      assetPath: '/public/assets'
    }
  }
}
