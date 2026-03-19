// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { createSmsReader } from './sms-reader.js';

describe('sms-reader', () => {
  it('parses osascript output into messages', async () => {
    const reader = createSmsReader({
      execFn: vi.fn().mockResolvedValue(
        '+15551234567\t2026-03-15T10:00:00\tBonjour\n+15559876543\t2026-03-15T10:05:00\tSalut\n',
      ),
    });
    const messages = await reader.getNewMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ from: '+15551234567', body: 'Bonjour', timestamp: '2026-03-15T10:00:00' });
    expect(messages[1]).toEqual({ from: '+15559876543', body: 'Salut', timestamp: '2026-03-15T10:05:00' });
  });

  it('returns empty array on osascript error', async () => {
    const reader = createSmsReader({
      execFn: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    const messages = await reader.getNewMessages();
    expect(messages).toEqual([]);
  });

  it('handles empty output', async () => {
    const reader = createSmsReader({
      execFn: vi.fn().mockResolvedValue(''),
    });
    const messages = await reader.getNewMessages();
    expect(messages).toEqual([]);
  });
});