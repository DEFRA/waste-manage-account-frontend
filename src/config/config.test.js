import { config } from './config.js'

describe('#config', () => {
  describe('#defraId', () => {
    test('Should provide expected defaults', () => {
      expect(config.get('defraId.discoveryUrl')).toBe(
        'http://localhost:3939/cdp-defra-id-stub/.well-known/openid-configuration'
      )
      expect(config.get('defraId.clientId')).toBe('stub-client-id')
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
