import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      // Defra common coding standard: unit test coverage is at least 90%
      // and must not decrease. Enforced here so `npm test` (and therefore
      // the pre-push hook and CI) fails when a change drops below the bar.
      // https://defra.github.io/software-development-standards/standards/common_coding_standards/
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 90,
        functions: 90
      },
      include: ['src/**/*.js'],
      exclude: [
        ...configDefaults.exclude,
        '.public',
        'coverage',
        'postcss.config.js',
        'stylelint.config.js',
        'vitest.config.js',
        '.sonarlint',
        'babel.config.cjs'
      ]
    }
  }
})
