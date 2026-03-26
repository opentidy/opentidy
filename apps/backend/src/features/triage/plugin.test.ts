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

  it('loadReceiverPlugins loads registered built-in plugin by name', async () => {
    const { loadReceiverPlugins, registerBuiltinReceiver } = await import('./plugin.js');

    registerBuiltinReceiver('test-builtin', () => ({
      name: 'test-builtin',
      source: 'test',
      init: () => {},
      start: () => {},
      stop: () => {},
    }));

    const plugins = await loadReceiverPlugins({
      receivers: [{ type: 'test-builtin', enabled: true }],
    });
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('test-builtin');
  });

  it('loadReceiverPlugins skips disabled plugins', async () => {
    const { loadReceiverPlugins, registerBuiltinReceiver } = await import('./plugin.js');

    registerBuiltinReceiver('test-disabled', () => ({
      name: 'test-disabled',
      source: 'test',
      init: () => {},
      start: () => {},
      stop: () => {},
    }));

    const plugins = await loadReceiverPlugins({
      receivers: [{ type: 'test-disabled', enabled: false }],
    });
    expect(plugins).toEqual([]);
  });
});