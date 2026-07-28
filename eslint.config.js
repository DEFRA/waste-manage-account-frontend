import importPlugin from 'eslint-plugin-import'
import neostandard from 'neostandard'

// spec-003 §2.1 import-direction rules (AC-2): one-way layering through
// src/auth/{core,clients,providers,service.js} and src/routes, enforced here
// so a layer violation fails `npm run lint` instead of drifting back in.
// Provider-to-provider imports (e.g. providers/stub -> providers/defra-id,
// the documented FR-6 escape hatch) are deliberately NOT restricted — only
// providers importing "up" into service/routes is. Test files are excluded:
// they legitimately reach into fixtures (e.g. a route test importing
// providers/stub/users.js to build expected values) that production code
// never would.
const authLayerZones = [
  {
    target: './src/routes',
    from: './src/auth/providers',
    message:
      'routes may not import providers directly — go through auth/service.js'
  },
  {
    target: './src/routes',
    from: './src/auth/clients',
    message:
      'routes may not import OIDC clients directly — go through auth/service.js'
  },
  {
    target: './src/auth/service.js',
    from: './src/auth/clients',
    message:
      'service may not import OIDC clients directly — go through a provider'
  },
  {
    target: './src/auth/providers',
    from: './src/auth/service.js',
    message:
      'providers may not import service.js — service depends on providers, not the reverse'
  },
  {
    target: './src/auth/providers',
    from: './src/routes',
    message: 'providers may not import routes'
  },
  {
    target: './src/auth/clients',
    from: './src/auth/providers',
    message: 'clients may not import providers'
  },
  {
    target: './src/auth/clients',
    from: './src/auth/service.js',
    message: 'clients may not import service.js'
  },
  {
    target: './src/auth/clients',
    from: './src/routes',
    message: 'clients may not import routes'
  },
  {
    target: './src/auth/core',
    from: './src/auth/providers',
    message: 'core may not import providers — core is provider-agnostic'
  },
  {
    target: './src/auth/core',
    from: './src/auth/clients',
    message: 'core may not import clients — core is provider-agnostic'
  },
  {
    target: './src/auth/core',
    from: './src/routes',
    message: 'core may not import routes'
  }
]

export default [
  ...neostandard({
    env: ['node', 'vitest'],
    ignores: [...neostandard.resolveIgnoresFromGitignore()],
    noJsx: true,
    noStyle: true
  }),
  {
    files: ['src/**/*.js'],
    ignores: ['**/*.test.js'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', { zones: authLayerZones }]
    }
  }
]
