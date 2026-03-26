#!/bin/bash
# Add SPDX license headers to all source files
set -e

HEADER_TS=$'// SPDX-License-Identifier: AGPL-3.0-only\n// Copyright (c) 2026 Loaddr Ltd\n'

# TypeScript/JavaScript files in apps/ and packages/
find apps packages -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \) \
  -not -path '*/node_modules/*' -not -path '*/dist/*' | while read -r file; do
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

# Shell scripts (preserve shebang, insert after line 1)
for file in bin/opentidy setup.sh install.sh opentidy-updater.sh; do
  if [ -f "$file" ] && ! grep -q 'SPDX-License-Identifier' "$file"; then
    sed -i '' '1a\
# SPDX-License-Identifier: AGPL-3.0-only\
# Copyright (c) 2026 Loaddr Ltd\
' "$file"
  fi
done

echo "Done. SPDX headers added."
