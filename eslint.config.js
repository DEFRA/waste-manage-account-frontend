import neostandard, { resolveIgnoresFromGitignore } from 'neostandard'

export default [
  // neostandard scopes its own `ignores` to its configs, so a standalone
  // ignores object is needed to keep build output such as .public unlinted
  { ignores: resolveIgnoresFromGitignore() },
  ...neostandard({
    env: ['node', 'vitest'],
    noJsx: true,
    noStyle: true
  })
]
