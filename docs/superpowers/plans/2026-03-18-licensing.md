# OpenTidy Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply AGPL-3.0 + Commercial dual licensing to the OpenTidy repository with CLA, SPDX headers, and updated documentation.

**Architecture:** No code changes — this is purely licensing and documentation. Add LICENSE file, CLA, SPDX headers to all source files, update package.json license fields, update README and contributing docs, add CLA mention to PR template.

**Tech Stack:** AGPL-3.0-only, Apache ICLA-based CLA, CLA Assistant (GitHub App)

**Spec:** `docs/superpowers/specs/2026-03-18-licensing-design.md`

---

### Task 1: Add LICENSE file

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create AGPL-3.0 LICENSE file**

Download the standard AGPL-3.0 text and save it as `LICENSE` at the repo root. Use the exact text from https://www.gnu.org/licenses/agpl-3.0.txt with the copyright notice:

```
Copyright (C) 2026 Loaddr Ltd

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, version 3 of the License.
```

- [ ] **Step 2: Verify GitHub detects the license**

Run: `head -5 LICENSE`
Expected: Should start with the AGPL-3.0 preamble. GitHub will auto-detect this and show "AGPL-3.0" on the repo page.

- [ ] **Step 3: Commit**

```bash
git add LICENSE
git commit -m "chore: add AGPL-3.0 license"
```

---

### Task 2: Add CLA document

**Files:**
- Create: `CLA.md`

- [ ] **Step 1: Create CLA.md based on Apache ICLA**

```markdown
# OpenTidy Contributor License Agreement

Thank you for your interest in contributing to OpenTidy. To clarify the intellectual property rights granted with contributions, we require contributors to sign this Contributor License Agreement (CLA).

## Summary

By signing this CLA, you confirm that:

1. **You retain your copyright.** You still own the rights to your contribution.
2. **You grant Loaddr Ltd a license.** You give Loaddr Ltd a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, distribute, and sublicense your contribution under any license — including the AGPL-3.0 (the project's open-source license) and any commercial license Loaddr Ltd may offer.
3. **You can still use your contribution.** You are free to use your contribution for any other purpose.
4. **Your contribution is your original work.** You have the right to grant this license. If your employer has rights to your work, you have received permission, or your employer has signed a Corporate CLA.

## Our commitment

Loaddr Ltd commits to always maintaining OpenTidy under the AGPL-3.0 as a free and open-source option. The commercial license exists as an alternative for organizations that cannot comply with AGPL-3.0 obligations.

## How to sign

When you open your first pull request, the CLA Assistant bot will ask you to sign. It's a one-click process — you only need to sign once.

## Full text

This CLA is based on the [Apache Individual Contributor License Agreement v2.0](https://www.apache.org/licenses/icla.pdf).

### Terms

You accept and agree to the following terms and conditions for your present and future contributions submitted to Loaddr Ltd.

1. **Definitions.** "You" means the individual signing this CLA. "Contribution" means any original work of authorship, including modifications or additions to an existing work, that you submit to Loaddr Ltd for inclusion in OpenTidy. "Submit" means any form of communication sent to Loaddr Ltd (pull request, issue, email, etc.).

2. **Grant of Copyright License.** You hereby grant to Loaddr Ltd a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your Contributions and such derivative works, under any license.

3. **Grant of Patent License.** You hereby grant to Loaddr Ltd a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, sell, offer for sale, import, and otherwise transfer your Contributions, where such license applies only to patent claims licensable by you that are necessarily infringed by your Contribution alone or by combination of your Contribution with OpenTidy.

4. **You represent that you are legally entitled to grant the above licenses.** If your employer has rights to intellectual property that you create, you represent that you have received permission to make contributions on behalf of that employer, or that your employer has waived such rights.

5. **You represent that each of your contributions is your original creation.** You represent that your contributions include complete details of any third-party license or other restriction of which you are personally aware and which are associated with any part of your contributions.

6. **You are not expected to provide support for your contributions,** except to the extent you desire to provide support. You provide your contributions on an "AS IS" basis, without warranties or conditions of any kind.

7. **You agree to notify Loaddr Ltd of any facts or circumstances** of which you become aware that would make these representations inaccurate in any respect.
```

- [ ] **Step 2: Commit**

```bash
git add CLA.md
git commit -m "chore: add Contributor License Agreement"
```

---

### Task 3: Add SPDX headers to all source files

**Files:**
- Modify: all `.ts`, `.tsx`, `.js`, `.mjs` files in `apps/` and `packages/` (~134 files)
- Modify: root-level config files: `eslint.config.js`
- Modify: shell scripts: `bin/opentidy`, `setup.sh`, `install.sh`, `opentidy-updater.sh`

- [ ] **Step 1: Write a script to add SPDX headers**

Run: `mkdir -p scripts`

Create `scripts/add-spdx-headers.sh`:

```bash
#!/bin/bash
# Add SPDX license headers to all source files
set -e

HEADER_TS="// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd
"

HEADER_SH="# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Loaddr Ltd
"

# TypeScript/JavaScript files (apps, packages, and root-level configs)
find apps packages -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \) | while read -r file; do
  if ! head -1 "$file" | grep -q 'SPDX-License-Identifier'; then
    printf '%s\n%s' "$HEADER_TS" "$(cat "$file")" > "$file"
  fi
done

# Root-level JS config files
for file in eslint.config.js; do
  if [ -f "$file" ] && ! head -1 "$file" | grep -q 'SPDX-License-Identifier'; then
    printf '%s\n%s' "$HEADER_TS" "$(cat "$file")" > "$file"
  fi
done

# Shell scripts (preserve shebang — insert after line 1)
for file in bin/opentidy setup.sh install.sh opentidy-updater.sh; do
  if [ -f "$file" ] && ! grep -q 'SPDX-License-Identifier' "$file"; then
    # Insert after shebang line
    sed -i '' '1a\
# SPDX-License-Identifier: AGPL-3.0-only\
# Copyright (c) 2026 Loaddr Ltd\
' "$file"
  fi
done

echo "Done. SPDX headers added."
```

- [ ] **Step 2: Run the script**

Run: `bash scripts/add-spdx-headers.sh`
Expected: "Done. SPDX headers added."

- [ ] **Step 3: Verify headers were added correctly**

Run: `head -3 apps/backend/src/index.ts`
Expected:
```
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd
```

Run: `head -4 bin/opentidy`
Expected:
```
#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Loaddr Ltd
```

- [ ] **Step 4: Run tests to make sure nothing broke**

Run: `pnpm test`
Expected: All tests pass (headers are comments, no functional impact).

- [ ] **Step 5: Commit**

```bash
git add apps/ packages/ bin/opentidy setup.sh install.sh opentidy-updater.sh eslint.config.js scripts/add-spdx-headers.sh
git commit -m "chore: add SPDX license headers to all source files"
```

---

### Task 4: Update package.json files

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/backend/package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Add license field to root package.json**

Add `"license": "AGPL-3.0-only"` to `package.json`. Keep `"private": true` (prevents accidental npm publish of monorepo root).

- [ ] **Step 2: Add license field to workspace package.json files**

Add `"license": "AGPL-3.0-only"` to each of:
- `apps/backend/package.json`
- `apps/web/package.json`
- `packages/shared/package.json`

Keep `"private": true` in all of them (no npm publishing planned yet).

- [ ] **Step 3: Verify**

Run: `grep -r '"license"' package.json apps/backend/package.json apps/web/package.json packages/shared/package.json`
Expected: All four files show `"license": "AGPL-3.0-only"`.

- [ ] **Step 4: Commit**

```bash
git add package.json apps/backend/package.json apps/web/package.json packages/shared/package.json
git commit -m "chore: add AGPL-3.0-only license to all package.json"
```

---

### Task 5: Update README and contributing docs

**Files:**
- Modify: `README.md:110-112` (replace "Coming soon" in License section)
- Modify: `CONTRIBUTING.md` (root — add CLA mention to the redirect)
- Modify: `docs/contributing.md:165-167` (replace "Coming soon" in License section)
- Modify: `.github/PULL_REQUEST_TEMPLATE.md` (add CLA checkbox)

- [ ] **Step 1: Update README.md License section**

Replace lines 110-112 with:

```markdown
## License

OpenTidy is dual-licensed:

- **Open Source:** [AGPL-3.0](LICENSE) — free to use, modify, and deploy. If you offer OpenTidy as a network service, you must publish your source code.
- **Commercial:** Contact [licensing@loaddr.com](mailto:licensing@loaddr.com) for a commercial license without AGPL obligations.

See [CLA.md](CLA.md) for contributor licensing.
```

- [ ] **Step 2: Update root CONTRIBUTING.md**

Replace the content of `CONTRIBUTING.md` with:

```markdown
# Contributing to OpenTidy

Thank you for your interest in contributing! Please see our [Contributing Guide](docs/contributing.md) for everything you need to get started.

By contributing, you agree to our [Contributor License Agreement](CLA.md).
```

- [ ] **Step 3: Update docs/contributing.md License section**

Replace lines 165-167 with:

```markdown
## License

OpenTidy is licensed under [AGPL-3.0](../LICENSE). By contributing, you agree to the [Contributor License Agreement](../CLA.md) — the CLA Assistant bot will guide you through signing on your first PR.
```

- [ ] **Step 4: Add CLA checkbox to PR template**

Add to the Checklist section of `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
- [ ] [CLA signed](CLA.md) (CLA Assistant will prompt on first PR)
```

- [ ] **Step 5: Commit**

```bash
git add README.md CONTRIBUTING.md docs/contributing.md .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs: add dual licensing info and CLA references"
```

---

### Task 6: Dependency license audit

**Files:**
- None created or modified (audit only)

- [ ] **Step 1: Run pnpm licenses list**

Run: `pnpm licenses list 2>/dev/null || pnpm -r exec -- npx license-checker --summary`

Review the output for any license incompatible with AGPL-3.0:
- **Compatible:** MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Unlicense, CC0-1.0
- **Incompatible:** GPL-2.0-only (without "or later"), CPAL, EUPL, any "non-commercial" license
- **Review needed:** MPL-2.0 (compatible but requires keeping MPL'd files under MPL)

- [ ] **Step 2: Document results**

If all deps are compatible: no action needed.
If any incompatible deps found: list them and find alternatives before publishing.

- [ ] **Step 3: Commit (if any changes)**

Only if deps needed replacing.

---

### Task 7: GitHub CLA Assistant setup

**Files:**
- None (GitHub App configuration)

This task is manual (GitHub web UI), not automatable by code.

- [ ] **Step 1: Install CLA Assistant GitHub App**

Go to https://github.com/apps/cla-assistant and install it on the `opentidy/opentidy` repository.

- [ ] **Step 2: Configure CLA Assistant**

In CLA Assistant settings:
- Link to `CLA.md` in the repository
- Set the organization to `opentidy`
- Set the repo to `opentidy`

- [ ] **Step 3: Test with a dummy PR (optional)**

Open and close a test PR to verify the CLA bot responds.

---

### Follow-ups (not part of this plan)

- **Homebrew formula:** Add `license "AGPL-3.0-only"` to the formula in `opentidy/homebrew-opentidy` (separate repo).
- **SPDX header enforcement:** Add a lint rule or pre-commit hook to ensure new files include the SPDX header.
- **`scripts/add-spdx-headers.sh`:** One-time utility — can be removed after execution if desired.
