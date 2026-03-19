// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';

describe('macOS receiver plugins', () => {
  it('sms-reader exports createSmsReceiverPlugin conforming to ReceiverPlugin', async () => {
    const { createSmsReceiverPlugin } = await import('./sms-reader.js');
    const plugin = createSmsReceiverPlugin({ execFn: vi.fn(async () => '') });
    expect(plugin.name).toBe('imessage');
    expect(plugin.source).toBe('sms');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
  });

  it('mail-reader exports createMailReceiverPlugin conforming to ReceiverPlugin', async () => {
    const { createMailReceiverPlugin } = await import('./mail-reader.js');
    const plugin = createMailReceiverPlugin({ execFn: vi.fn(async () => '') });
    expect(plugin.name).toBe('apple-mail');
    expect(plugin.source).toBe('mail');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
  });
});