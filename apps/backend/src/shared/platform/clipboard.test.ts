// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { getClipboardCopyCommand } from './clipboard.js';

describe('clipboard', () => {
  it('getClipboardCopyCommand returns a string', () => {
    const cmd = getClipboardCopyCommand();
    expect(typeof cmd).toBe('string');
    expect(cmd.length).toBeGreaterThan(0);
  });

  it('returns pbcopy on darwin', () => {
    if (process.platform === 'darwin') {
      expect(getClipboardCopyCommand()).toBe('pbcopy');
    }
  });
});