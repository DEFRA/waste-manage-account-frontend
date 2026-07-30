# Quality assurance and test standards

Adapted for this repo from the DEFRA [quality assurance and test standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/quality_assurance_standards.md). Last synced 30 July 2026.

All digital services must meet the [GOV.UK service standard](https://www.gov.uk/service-manual/service-standard).

## Accessibility

> **Project decision:** this service targets **WCAG 2.2 AA** (the current GOV.UK requirement), which is ahead of the DEFRA standards doc that still references 2.1. Meeting 2.2 satisfies both.

- All pages, internal or external-facing, must meet [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/glance/) at levels A and AA.
- Preserve the accessibility behaviour of govuk-frontend components when customising templates.
- See the Defra [accessibility wiki](https://github.com/DEFRA/qa-test/wiki/Accessibility) and [GOV.UK accessibility guidance](https://www.gov.uk/service-manual/helping-people-to-use-your-service/making-your-service-accessible-an-introduction).

## Default acceptance criteria for every story

- Screens, behaviour and content match designs from the prototype or wireframe
- Styles match the [GOV.UK Design System](https://design-system.service.gov.uk/)
- Accessible — meets WCAG 2.2 at levels A and AA
- Works across [all supported browsers](https://www.gov.uk/service-manual/technology/designing-for-different-browsers-and-devices), including mobile
- Server-side [error validation](https://design-system.service.gov.uk/components/error-message/) exists for all fields
- No obvious performance issues (most transactions under 1 second; avoid transactions over 10 seconds)
- No existing functionality has regressed

**Negative scenarios are as important as positive ones.** "An admin can export data" implies "a standard user cannot export data" — test both. Routinely check error paths in manual and automated tests.

## Unit testing (this repo)

- Unit tests use **Vitest** (`npm test`, `npm run test:watch`) with coverage via `@vitest/coverage-v8`.
- Coverage must be at least 90% and must never decrease (see [common-coding.md](common-coding.md)).
- Adopt the testing pyramid: find most defects at the unit/API level, fewer at the slower UI-test levels.
- Test code must meet the same coding standards as production code and is linted the same way.

## Compliance

Ensure the service complies with: [accessibility statements](https://www.gov.uk/guidance/make-your-website-or-app-accessible-and-publish-an-accessibility-statement), [assisted digital support](https://www.gov.uk/service-manual/helping-people-to-use-your-service/assisted-digital-support-introduction), [cookie policies](https://www.gov.uk/service-manual/technology/working-with-cookies-and-similar-technologies), [GDPR](https://www.gov.uk/government/publications/guide-to-the-general-data-protection-regulation), [GOV.UK content styles](https://www.gov.uk/guidance/content-design/writing-for-gov-uk), the [GOV.UK Design System](https://design-system.service.gov.uk/), [privacy policies](https://www.gov.uk/service-manual/design/collecting-personal-information-from-users), and [progressive enhancement](https://www.gov.uk/service-manual/technology/using-progressive-enhancement) — in particular, the service must be usable without CSS and JavaScript.

## Wider QA practice

- Define positive and negative acceptance criteria **before** a story is developed.
- All stories undergo risk-based exploratory testing.
- Automated acceptance testing defaults for new projects: Cucumber + WebdriverIO on Node.js. Publish test code in the open, but never publish passwords or sensitive data.
- Performance testing (default tool: JMeter) covers load (120% of likely maximum), soak, and stress.
- Produce a test plan and a test completion report for major releases; keep the team aware of testing risks.
