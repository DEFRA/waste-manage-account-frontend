import Blankie from 'blankie'

/**
 * Manage content security policies.
 *
 * The DEFRA ID host is deliberately absent from every directive below: the
 * sign-in/sign-out flow (`plugins/auth.js`) sends the browser there via a
 * server-side 302 `Location` redirect, and CSP directives (`form-action`,
 * `connect-src`, `default-src`, ...) only govern requests this page itself
 * issues — HTML `<form>` submissions, fetch/XHR, subresource loads. None of
 * those exist against the DEFRA ID host, so top-level navigations to it are
 * unaffected by this policy and no directive needs loosening.
 * @satisfies {import('@hapi/hapi').Plugin}
 */
const contentSecurityPolicy = {
  plugin: Blankie,
  options: {
    // Hash 'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw=' is to support a GOV.UK frontend script bundled within Nunjucks macros
    // https://frontend.design-system.service.gov.uk/import-javascript/#if-our-inline-javascript-snippet-is-blocked-by-a-content-security-policy
    defaultSrc: ['self'],
    fontSrc: ['self', 'data:'],
    connectSrc: ['self', 'wss', 'data:'],
    mediaSrc: ['self'],
    styleSrc: ['self'],
    scriptSrc: [
      'self',
      "'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw='"
    ],
    imgSrc: ['self', 'data:'],
    frameSrc: ['self', 'data:'],
    objectSrc: ['none'],
    frameAncestors: ['none'],
    formAction: ['self'],
    manifestSrc: ['self'],
    generateNonces: false
  }
}

export { contentSecurityPolicy }
