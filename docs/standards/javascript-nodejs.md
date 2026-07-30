# JavaScript and Node.js standards

Adapted for this repo from the DEFRA [JavaScript standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/javascript_standards.md) and [Node.js standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/node_standards.md). Last synced 30 July 2026.

## JavaScript

- Use vanilla JavaScript. Do not use extensions to the language such as TypeScript without an approved exception — no `.ts` files, no type annotations, no JSDoc-driven type checking introduced as a workaround.
- Lint with [neostandard](https://github.com/neostandard/neostandard) (`npm run lint:js`). Do not extend or modify the neostandard ruleset.
  - **Deviation, accepted:** this repo sets `noStyle: true` and delegates formatting to Prettier (`npm run format`), which is the CDP frontend template default. The DEFRA standard prefers neostandard's own formatting rules; we keep the template setup for consistency with CDP. Do not change either config without a team decision.
- Do not use front-end JavaScript frameworks (React, Vue, Angular, etc.). They conflict with [progressive enhancement](https://www.gov.uk/service-manual/technology/using-progressive-enhancement). Use [GOV.UK Design System](https://design-system.service.gov.uk/) components via govuk-frontend instead. Any framework use for a highly-functional enhancement (e.g. an interactive map) must be managed as an explicit exception.
- All pages must work without client-side JavaScript and without CSS.

## Node.js

- Node.js code follows the JavaScript standards above.
- Do not store session state on the app server. Never tie a session to a particular server instance — use the existing yar/catbox (Redis) setup, not in-process storage.
- Do not block the event loop or worker pool. Don't do too much work for any client in a single callback or task; push CPU-intensive work to another service.
- Prefer `async`/`await` over callbacks; avoid nested callbacks.
- Use ES modules (this package is `"type": "module"`). CommonJS only where a dependency genuinely requires it.

### Versions

- Stay on Active LTS Node versions (see `.nvmrc`). Don't drop behind Maintenance LTS; don't progress beyond Active LTS.

### Package management

- Use npm only. Any other package manager requires governance approval.
- Pin all dependencies to exact versions in `package.json` — never `^`, `~`, `*`, `x` or ranges.
- Keep `dependencies` and `devDependencies` correctly separated.
- Use `npm ci` (not `npm install`) in CI and production Docker builds.
- Vet third-party packages before adding them — see the DEFRA [choosing packages guide](https://github.com/DEFRA/software-development-standards/blob/master/docs/guides/choosing_packages.md) and this repo's dependency rules in AGENTS.md.
- The repo `.npmrc` must keep these settings:

  | Setting | Purpose |
  |---|---|
  | `save-exact=true` | Saves exact versions; prevents version-range drift pulling in a later, potentially vulnerable release. |
  | `ignore-scripts=true` | Blocks `preinstall`/`postinstall` lifecycle scripts — a common vector for arbitrary code execution from compromised packages. Pass `--ignore-scripts=false` per-command only when a package genuinely needs it. |
  | `min-release-age=7` | Refuses packages published fewer than 7 days ago, giving time for package-takeover and typosquatting attacks to be detected. Bypass a single install with `--min-release-age=0` only after due diligence on the package and publisher. |

### Server framework

- Our standard framework is [Hapi](https://hapijs.com/). Keep on the current major version; follow the existing plugin and route patterns in `src/server`.
- Templates are Nunjucks rendered through `@hapi/vision`.
