# OpenTidy Licensing Design

**Date:** 2026-03-18
**Status:** Approved
**Author:** Lolo (Loaddr Ltd)

## Decision

Dual licensing: **AGPL-3.0-only** (public) + **Commercial license** (on request).

## Context

OpenTidy is transitioning from a private project to open source. Goals:

1. **Community**: attract contributions, be well-regarded in the open-source ecosystem
2. **Protection**: prevent competitors from commercializing a closed-source fork
3. **Business**: retain the ability to offer commercial licensing / hosted services

## Why AGPL-3.0 + Commercial

### Alternatives considered

| License | Community | Business | Protection | Verdict |
|---------|:---------:|:--------:|:----------:|---------|
| MIT | ++ | Possible but vulnerable | None | Too permissive, no protection against cloud providers |
| MIT + Open Core | ++ | Yes | Core unprotected | Hard to split features for a personal assistant |
| FSL (Functional Source License) | +/- | Yes | Strong | Not OSI-approved, community perception risk |
| AGPL-3.0 only | + | Complicated, forces publishing server code | Strong | Limits own business flexibility |
| **AGPL-3.0 + Commercial** | **+** | **Yes** | **Strong** | **Best fit, proven model (Grafana, Qt, MySQL)** |

### How it works

- **Public license (AGPL-3.0):** Anyone can use, modify, and deploy OpenTidy freely. If they offer it as a network service, they must publish their complete source code under AGPL-3.0.
- **Commercial license:** Enterprises that want to use OpenTidy without AGPL obligations (e.g., closed-source modifications, proprietary SaaS) purchase a commercial license from Loaddr Ltd.
- **Loaddr Ltd retains full commercial licensing rights** as sole copyright holder.

### Precedents

- **Grafana**: AGPL-3.0 + commercial. Massive community, successful business (Grafana Labs).
- **MongoDB**: Originally AGPL, then SSPL + commercial. Backlash came both from *changing* the license and from the SSPL itself (Debian, Fedora, RHEL refused to include SSPL software). The lesson for OpenTidy: start with dual licensing from day 1, and use an OSI-approved license (not SSPL).
- **Qt**: GPL/LGPL + commercial (varies by module). 25+ years of active community.
- **MySQL**: GPL + commercial. The original dual licensing model (now Oracle).

**Key lesson:** Starting with dual licensing from day 1 is well-accepted. Changing licenses after the fact is what causes backlash.

## CLA (Contributor License Agreement)

### Why required

Without a CLA, each contributor retains copyright on their code. This would make it legally impossible to distribute their contributions under the commercial license, only under AGPL.

### Implementation

- **Tool:** CLA Assistant (free GitHub App, used by Google, Meta, SAP)
- **Flow:** First PR → bot requests CLA signature → single click → done
- **Base text:** Apache ICLA (Individual Contributor License Agreement), industry standard
- **Substance:** "You retain your copyright but grant Loaddr Ltd a perpetual license to distribute your contribution under any license, including commercial."
- **Public commitment:** To mitigate perception risk, publish a statement that the AGPL version of OpenTidy will always remain available. This addresses the concern that Loaddr Ltd could theoretically use CLA rights to go fully proprietary.
- **Corporate CLA (CCLA):** Not needed at launch. Add when corporate contributors appear (employee contributions may be owned by their employer).

### Friction risk

Minimal. Major projects with CLAs (Kubernetes, React, Grafana, Eclipse) all have thriving contributor communities. Some contributors refuse CLAs on principle; this is a small minority and an accepted trade-off for dual licensing.

The alternative (DCO, Developer Certificate of Origin) is insufficient for dual licensing as it only certifies authorship, not license grant.

## Repository changes

### New files

| File | Content |
|------|---------|
| `LICENSE` | Full AGPL-3.0 text |
| `CLA.md` | CLA text based on Apache ICLA |
| `CONTRIBUTING.md` | Contribution guide, CLA mention, dev setup |

### Modified files

| File | Change |
|------|--------|
| `package.json` (root) | Add `"license": "AGPL-3.0-only"` (keep `"private": true`) |
| `apps/backend/package.json` | Add `"license": "AGPL-3.0-only"` |
| `apps/web/package.json` | Add `"license": "AGPL-3.0-only"` |
| `packages/shared/package.json` | Add `"license": "AGPL-3.0-only"` |
| `README.md` | Update "License" section with dual licensing info |
| `docs/contributing.md` | Update "License" section (currently "Coming soon") |
| Homebrew formula | Add `license "AGPL-3.0-only"` field |

**Note on `private: true`:** Keep `"private": true` in the root `package.json` (prevents accidental npm publish of the monorepo root). Only remove it from workspace packages if/when we intend to publish them to npm.

### Source file headers

All `.ts`, `.tsx`, `.js`, and `.mjs` source files get (shell scripts in `bin/` and `plugins/` get the `#` comment equivalent):

```
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd
```

Headers will be added via an automated script (not manually). A lint rule or pre-commit hook can enforce presence on new files.

### GitHub configuration

- Enable CLA Assistant GitHub App on `opentidy/opentidy`
- PR template (`.github/PULL_REQUEST_TEMPLATE.md`): mention CLA requirement and link to `CLA.md`

### README section

```markdown
## License

OpenTidy is dual-licensed:

- **Open Source:** [AGPL-3.0](LICENSE), free to use, modify, and deploy. Network services must publish source code.
- **Commercial:** Contact licensing@loaddr.com for commercial licensing without AGPL obligations.
```

## AGPL boundary: plugins and hooks

OpenTidy's hooks (`plugins/opentidy-hooks/`) are separately authored scripts invoked through a defined interface. Under AGPL, separately authored plugins that interact through a public interface are generally considered **separate works**, not modifications of OpenTidy. This means:

- Third parties can write proprietary hooks without triggering AGPL copyleft
- Custom CLAUDE.md prompts and workspace configurations are not "source code" subject to AGPL
- The copyleft applies to modifications of OpenTidy's core code (backend, frontend, shared, CLI)

This is an accepted boundary; same as how Grafana plugins can be proprietary while Grafana itself is AGPL.

## Dependency license audit

Before publication, audit all direct and transitive dependencies for AGPL compatibility. MIT, Apache-2.0, ISC, BSD are all compatible. Watch for:
- GPL-2.0-only (without "or later"), incompatible with AGPL-3.0
- CPAL, EUPL, potential incompatibilities
- Any "non-commercial" or custom licenses in transitive deps

Run `pnpm licenses list` to generate the full report.

## What does NOT change

- No code modifications; this is purely licensing and documentation
- Architecture, hooks, workspace structure remain identical
- CLAUDE.md files unchanged
- No impact on existing development workflow

## Future considerations

- **Commercial license text:** Not needed at launch. "Contact us" is sufficient until there is actual commercial demand. When needed, engage a lawyer.
- **Foundation:** If the project grows significantly, consider transferring to an independent foundation (like OpenClaw did). This protects the project's independence but reduces Loaddr Ltd's licensing control. Decision for later.
- **Trademark:** Register "OpenTidy" as a trademark to protect the brand independently of the code license. The license protects code; the trademark protects the name.
- **Acquisition risk:** If Loaddr Ltd is acquired, the acquirer inherits CLA rights and could theoretically stop publishing the AGPL version. Mitigation for later: foundation transfer or irrevocable AGPL commitment clause.
