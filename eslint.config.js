// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    ignores: ['**/dist/', '**/node_modules/'],
  },
  {
    rules: {
      // Downgrade to warn — existing codebase has many instances, will be cleaned up gradually
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);