// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { createDynamicToolRegistry } from './dynamic-tools.js';

describe('DynamicToolRegistry', () => {
  it('registers and retrieves a tool', () => {
    const registry = createDynamicToolRegistry();
    const handler = async () => ({ ok: true });
    registry.register('test_tool', { description: 'A test', inputSchema: { type: 'object' } }, handler);

    const tools = registry.listAll();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');
  });

  it('unregisters a tool', () => {
    const registry = createDynamicToolRegistry();
    registry.register('tool_a', { description: 'A', inputSchema: {} }, async () => ({}));
    registry.unregister('tool_a');
    expect(registry.listAll()).toHaveLength(0);
  });

  it('executes a tool handler and normalizes result to MCP format', async () => {
    const registry = createDynamicToolRegistry();
    registry.register('my_tool', { description: 'Test', inputSchema: {} }, async (input) => {
      return { count: input.n };
    });
    const result = await registry.execute('my_tool', { n: 42 });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ count: 42 }) }]);
  });

  it('throws on execute of unknown tool', async () => {
    const registry = createDynamicToolRegistry();
    await expect(registry.execute('nope', {})).rejects.toThrow('Unknown dynamic tool: nope');
  });

  it('has() returns true for registered tool', () => {
    const registry = createDynamicToolRegistry();
    registry.register('exists', { description: '', inputSchema: {} }, async () => ({}));
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('normalizes string result', async () => {
    const registry = createDynamicToolRegistry();
    registry.register('str_tool', { description: '', inputSchema: {} }, async () => 'hello');
    const result = await registry.execute('str_tool', {});
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
  });
});
