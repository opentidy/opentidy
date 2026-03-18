# Security Policy

OpenTidy manages sensitive data — emails, documents, browser sessions, and credentials. We take security seriously.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use [GitHub Security Advisories](https://github.com/opentidy/opentidy/security/advisories/new) to report vulnerabilities privately.

### What to report

- Hook bypass vulnerabilities (PreToolUse hooks being circumvented)
- Authentication or authorization issues
- Data exposure (workspace files, credentials, tokens)
- Injection vulnerabilities (command injection, prompt injection)
- Unsafe defaults in configuration

### Response timeline

- **Acknowledge** — within 48 hours
- **Initial assessment** — within 7 days
- **Fix for critical issues** — within 30 days
- **Fix for non-critical issues** — within 90 days

### What to expect

1. We'll acknowledge your report and provide an estimated timeline
2. We'll work with you to understand the issue
3. We'll develop and test a fix
4. We'll release the fix and credit you (unless you prefer to remain anonymous)

## Security architecture

OpenTidy's security model is documented in detail in [docs/security.md](docs/security.md). Key points:

- **PreToolUse hooks** intercept every sensitive tool call before execution — Claude cannot bypass them
- **Audit trail** logs every external action for traceability
- **Isolated Claude config** — sessions use a separate configuration directory
- **Bearer token authentication** on all API endpoints

## Supported versions

We provide security fixes for the latest release only.
