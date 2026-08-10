# Continuous integration standards

Adapted for this repo from the DEFRA [continuous integration standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/continuous_integration.md). Last synced 30 July 2026.

## What CI must check

Every branch build verifies: the frontend builds, tests pass, code style checks pass (Prettier, ESLint/neostandard, Stylelint), code quality checks pass (SonarQube Cloud), and security checks pass (npm audit, dependency review).

In this repo that is `.github/workflows/check-pull-request.yml`, mirroring the local pre-commit gate:

```sh
npm run security-audit && npm run format:check && npm run lint && npm test
```

## Branch protection

`main` must be protected with branch protection rules requiring the CI checks and at least one approving review before merge.

## GitHub Actions

Use GitHub Actions for CI builds.

### Commit SHA pinning (required)

Pin every action to a specific full-length commit SHA, never a tag or branch. Tags and branches can be moved by an attacker who compromises the action's repo — an increasingly common supply-chain attack. Reference the version as a trailing comment for clarity:

```yaml
# Use:
uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # 0.35.0

# Not:
uses: aquasecurity/trivy-action@v0.35.0
# Nor:
uses: aquasecurity/trivy-action@main
```

To update an action, test the new version, then update the SHA. Find the SHA by viewing the commit for the target tag in the action's repository.

## Security in CI

- **Dependabot** enabled per repository with grouped updates.
- **Dependency review action** in the PR workflow to block newly-introduced vulnerable packages.
- **GitHub Security tab** reviewed regularly; open alerts must be resolved. This includes vulnerabilities in GitHub Actions themselves.

## Maintainability and test coverage

- SonarQube Cloud (Defra organisation) must run in CI — enable the commented-out `SonarSource/sonarqube-scan-action` steps in the workflows once the `SONAR_TOKEN` secret is configured (see `sonar-project.properties`).
- CI must report unit test coverage to SonarQube Cloud (`./coverage/lcov.info` from Vitest is already wired up in `sonar-project.properties`).
- The Defra standard quality gate must be met and maintained.
