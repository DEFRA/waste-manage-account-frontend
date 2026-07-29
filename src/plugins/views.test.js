import { afterEach, describe, expect, test } from 'vitest'

import { createServer } from '../server.js'

describe('views plugin', () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  test('renders the base layout through the GOV.UK page template', async () => {
    server = await createServer()

    const html = await server.render('layouts/page')

    expect(html).toContain('class="govuk-template')
    expect(html).toContain('Skip to main content')
    expect(html).toContain('govuk-header')
    expect(html).toContain('govuk-footer')
    expect(html).toContain('id="main-content"')
  })

  test('links the built application stylesheet', async () => {
    server = await createServer()

    const html = await server.render('layouts/page')

    expect(html).toContain(
      '<link href="/public/stylesheets/application.css" rel="stylesheet">'
    )
  })

  test('exposes the service name to every view', async () => {
    server = await createServer()

    const html = await server.render('layouts/page')

    // pageTitle and the template's service navigation both use serviceName
    expect(html).toContain(
      '<title>waste-manage-account-frontend – GOV.UK</title>'
    )
    expect(html).toContain('govuk-service-navigation')
  })
})
