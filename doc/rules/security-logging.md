# Security and logging standards

Adapted for this repo from the DEFRA [security standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/security_standards.md), [logging standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/logging_standards.md) and [security principles](https://github.com/DEFRA/software-development-standards/blob/master/docs/principles/security_principles.md). Last synced 30 July 2026.

## Secure coding

- Follow the [OWASP Secure Coding Practices quick reference guide](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/) (version 2).
- Secure development is everyone's concern; security is woven into everyday practice, not bolted on.
- Never commit credentials, tokens, connection strings or `.env` values. If a secret ever reaches git history, treat it as compromised and follow the DEFRA [credential exposure process](https://github.com/DEFRA/software-development-standards/blob/master/docs/processes/credential_exposure.md).

## GitHub Advanced Security

Defra has GitHub Advanced Security enabled organisation-wide. Maximise these built-in features rather than third-party tools:

- **Dependency graph** enabled in every repository (foundation for the features below).
- **Dependabot** enabled to raise PRs for vulnerable or outdated dependencies, with grouped updates to reduce noise (`.github/dependabot.yml`).
- **Dependency review action** in the PR workflow — fails the check if a PR introduces known-vulnerable packages.
- **Security tab** reviewed regularly: Dependabot alerts, code scanning alerts, secret scanning alerts. Teams must resolve open security alerts.

## Logging

This repo logs through pino with `@elastic/ecs-pino-format` via hapi-pino. Always use the configured logger — never `console.log`.

### Only log useful information

Errors, warnings, informational messages, debug messages, and audit events. Excessive or redundant logging makes logs harder to analyse and increases cost. Be aware of what third-party libraries log and configure them appropriately.

### Log levels per environment

Levels must remain configurable. Baseline: **development** — debug; **test/staging** — warnings and errors; **production** — errors and critical warnings.

### Use structured logs

Follow the [Elastic Common Schema (ECS)](https://www.elastic.co/docs/reference/ecs) — already applied by the pino ECS formatter. Do not invent custom log formats.

### Never log PII or sensitive data

Sanitise before logging. This includes, but is not limited to: names, addresses, email addresses, phone numbers, National Insurance numbers, bank details, usernames, passwords, API keys, and tokens. Watch for third-party libraries leaking these (e.g. logging full request payloads or headers).

### Centralised logging and protective monitoring

Logs are written to stdout and aggregated by the CDP platform's centralised logging. Protective monitoring events (authentication attempts, access control changes, configuration changes, significant decisions) should be sent to the Security Operations Centre — engage the SOC team for guidance on what to send.

## Auditing

Use `@defra/cdp-auditing` for audit events that record user actions for compliance — audit records are not a substitute for (or duplicate of) application logs.
