# Continuous integration standards

Adapted for this repo from the DEFRA [continuous integration standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/continuous_integration.md). Last synced 9 November 2026.

## What CI must check

Every branch build verifies: the frontend builds, tests pass, code style checks pass (Prettier, ESLint/neostandard, Stylelint), code quality checks pass (SonarQube Cloud), and security checks pass (npm audit).

In this repo that is `.github/workflows/check-pull-request.yml`, mirroring the local pre-commit gate:

```sh
npm run security-audit && npm run format:check && npm run lint && npm test
```

## Branch protection

`main` is protected by repository rulesets requiring the `Run Pull Request Checks` status check, two approving reviews, resolved review threads and signed commits (see [git-workflow.md](git-workflow.md)). Renaming the job renames the required check: update the ruleset in the same change, or the PR cannot merge.

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

- **Dependabot** raises grouped update PRs; `.github/dependabot.yml` is the source of truth for the ecosystems, groups and schedule.
- **npm audit** — `npm run security-audit` (`npm audit --audit-level=critical`) runs in the pre-commit gate and in `check-pull-request.yml`, and fails the check when an installed package has a critical advisory.
- **GitHub Security tab** reviewed regularly; open alerts must be resolved. This includes vulnerabilities in GitHub Actions themselves.

## Maintainability and test coverage

- SonarQube Cloud (Defra organisation) runs in CI through the `SonarSource/sonarqube-scan-action` step in each workflow, configured by `sonar-project.properties`.
- CI reports unit test coverage to SonarQube Cloud from the `./coverage/lcov.info` file Vitest writes (`sonar-project.properties`).
- The Defra standard quality gate must be met and maintained.
