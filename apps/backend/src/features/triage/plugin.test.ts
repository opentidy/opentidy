// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import type { ReceiverPlugin, ReceiverPluginMessage } from './plugin.js';

describe('ReceiverPlugin', () => {
  it('plugin conforming to interface can start and emit events', async () => {
    const messages: ReceiverPluginMessage[] = [];

    const fakePlugin: ReceiverPlugin = {
      name: 'test-receiver',
      source: 'test',
      init: vi.fn(),
      start: vi.fn(async (onMessage) => {
        onMessage({ from: 'user@test.com', body: 'hello', timestamp: new Date().toISOString() });
      }),
      stop: vi.fn(),
    };

    await fakePlugin.start((msg) => messages.push(msg));
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('user@test.com');
    expect(fakePlugin.start).toHaveBeenCalled();
  });

  it('loadReceiverPlugins loads plugins from config', async () => {
    const { loadReceiverPlugins } = await import('./plugin.js');

    // With no plugins configured, returns empty array
    const plugins = await loadReceiverPlugins({ receivers: [] });
    expect(plugins).toEqual([]);
  });

  it('loadReceiverPlugins loads built-in plugin by name', async () => {
    const { loadReceiverPlugins } = await import('./plugin.js');

    const plugins = await loadReceiverPlugins({
      receivers: [{ type: 'gmail-webhook', enabled: true }],
    });
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('gmail-webhook');
  });

  it('loadReceiverPlugins skips disabled plugins', async () => {
    const { loadReceiverPlugins } = await import('./plugin.js');

    const plugins = await loadReceiverPlugins({
      receivers: [{ type: 'gmail-webhook', enabled: false }],
    });
    expect(plugins).toEqual([]);
  });
});