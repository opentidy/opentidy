// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { MemoryEntry } from '@opentidy/shared';

export function buildMemoryContext(entries: MemoryEntry[]): string {
  if (!entries.length) return '';
  return entries
    .map(f => `- [${f.category}] ${f.description}: ${f.content.split('\n').slice(-3).join(' ')}`)
    .join('\n');
}