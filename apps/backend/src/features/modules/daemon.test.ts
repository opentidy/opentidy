// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createModuleContext } from './daemon.js';
import { createDynamicToolRegistry } from '../mcp-server/dynamic-tools.js';

describe('createModuleContext', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opentidy-daemon-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates dataDir on initialization', () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    expect(existsSync(ctx.dataDir)).toBe(true);
    expect(ctx.dataDir).toBe(join(tmpDir, 'test-mod'));
  });

  it('emit forwards ReceiverEvent to callback', () => {
    const registry = createDynamicToolRegistry();
    const emitFn = vi.fn();
    const ctx = createModuleContext('test-mod', {}, emitFn, registry, tmpDir);
    ctx.emit({ source: 'test', content: 'hello', metadata: {} });
    expect(emitFn).toHaveBeenCalledWith({ source: 'test', content: 'hello', metadata: {} });
  });

  it('registerTool adds tool to dynamic registry', () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    ctx.registerTool('test_tool', { description: 'A test', inputSchema: {} }, async () => ({}));
    expect(registry.has('test_tool')).toBe(true);
  });

  it('logger prefixes messages with module name', () => {
    const registry = createDynamicToolRegistry();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = createModuleContext('mymod', {}, () => {}, registry, tmpDir);
    ctx.logger.log('hello');
    expect(logSpy).toHaveBeenCalledWith('[mymod]', 'hello');
    logSpy.mockRestore();
  });

  it('runShutdownHandlers calls all registered handlers', async () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    ctx.onShutdown(fn1);
    ctx.onShutdown(fn2);
    await ctx.runShutdownHandlers();
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('unregisterAllTools removes all tools registered by this context', () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    ctx.registerTool('test_a', { description: '', inputSchema: {} }, async () => ({}));
    ctx.registerTool('test_b', { description: '', inputSchema: {} }, async () => ({}));
    ctx.unregisterAllTools();
    expect(registry.listAll()).toHaveLength(0);
  });

  it('passes config through', () => {
    const registry = createDynamicToolRegistry();
    const cfg = { apiKey: 'abc' };
    const ctx = createModuleContext('test-mod', cfg, () => {}, registry, tmpDir);
    expect(ctx.config).toBe(cfg);
  });
});
