import { vi } from 'vitest'

import { config } from './config.js'

describe('#config', () => {
  describe('#log.redact', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    test('Should redact the cookie and authorization headers, and all response headers, in production', async () => {
      vi.resetModules()
      vi.stubEnv('NODE_ENV', 'production')

      const { config: productionConfig } = await import('./config.js')

      // 'req.headers.cookie' covers every cookie on the request, including
      // the DEFRA ID session cookie (`defra-id-session`) and yar's pre-auth
      // cookie — pino's `remove: true` redaction drops the whole property
      // rather than replacing it, so no cookie value can leak into logs.
      expect(productionConfig.get('log.redact')).toEqual([
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers'
      ])
    })

    test('Should not redact by default outside production', () => {
      expect(config.get('log.redact')).toEqual([])
    })
  })

  describe('#defraId', () => {
    test('Should provide expected defaults', () => {
      expect(config.get('defraId.discoveryUrl')).toBe(
        'http://localhost:3200/cdp-defra-id-stub/.well-known/openid-configuration'
      )
      expect(config.get('defraId.clientId')).toBe(
        '63983fc2-cfff-45bb-8ec2-959e21062b9a'
      )
      expect(config.get('defraId.serviceId')).toBe('stub-service-id')
      expect(config.get('defraId.policy')).toBe('stub-policy')
      expect(config.get('defraId.callbackBaseUrl')).toBe(
        'http://localhost:3000'
      )
      expect(config.get('defraId.refreshEnabled')).toBe(true)
      expect(config.get('defraId.clockToleranceSeconds')).toBe(60)
      expect(config.get('defraId.discoveryCacheTtlSeconds')).toBe(3600)
      expect(config.get('defraId.pkceEnabled')).toBe(false)
      expect(config.get('defraId.stubEnabled')).toBe(true)
    })

    test('Should mark clientSecret as sensitive', () => {
      expect(config.toString()).toContain('"clientSecret": "[Sensitive]"')
    })
  })

  describe('#session', () => {
    test('Should provide expected idle and absolute TTL defaults', () => {
      expect(config.get('session.idleTtl')).toBe(1800000)
      expect(config.get('session.absoluteTtl')).toBe(14400000)
    })
  })
})
