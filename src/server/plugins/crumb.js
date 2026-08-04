import Crumb from '@hapi/crumb'

import { config } from '#/config/config.js'

/**
 * CSRF protection for future POST forms. The crumb cookie mirrors the
 * session cookie's isSecure/isSameSite settings so it behaves consistently
 * across environments.
 */
export const crumb = {
  plugin: Crumb,
  options: {
    cookieOptions: {
      isSecure: config.get('session.cookie.secure'),
      isSameSite: 'Lax',
      path: '/'
    }
  }
}
