// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { createMailReader } from './mail-reader.js';

describe('MailReader', () => {
  it('parses tab-separated osascript output', async () => {
    const mockOutput = [
      'alice@test.com\t2026-03-16T10:00:00\tHello\tBody content here',
      'bob@test.com\t2026-03-16T10:05:00\tUrgent\tPlease respond ASAP',
    ].join('\n');

    const reader = createMailReader({ execFn: async () => mockOutput });
    const messages = await reader.getNewMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      from: 'alice@test.com',
      body: 'Hello\n\nBody content here',
      timestamp: '2026-03-16T10:00:00',
    });
    expect(messages[1]).toEqual({
      from: 'bob@test.com',
      body: 'Urgent\n\nPlease respond ASAP',
      timestamp: '2026-03-16T10:05:00',
    });
  });

  it('handles newline replacement character', async () => {
    const mockOutput = 'user@test.com\t2026-03-16T10:00:00\tSubject\tLine 1␤Line 2␤Line 3';
    const reader = createMailReader({ execFn: async () => mockOutput });
    const messages = await reader.getNewMessages();

    expect(messages[0].body).toBe('Subject\n\nLine 1\nLine 2\nLine 3');
  });

  it('returns empty array on error', async () => {
    const reader = createMailReader({ execFn: async () => { throw new Error('osascript failed'); } });
    const messages = await reader.getNewMessages();
    expect(messages).toEqual([]);
  });

  it('returns empty array for empty output', async () => {
    const reader = createMailReader({ execFn: async () => '' });
    const messages = await reader.getNewMessages();
    expect(messages).toEqual([]);
  });
});