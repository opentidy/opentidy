// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export function generateSlug(text: string, maxLen = 50): string {
  const base = text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/(^-|-$)/g, '')
    .slice(0, maxLen);
  const suffix = Date.now().toString(36).slice(-6);
  return `${base}-${suffix}`;
}