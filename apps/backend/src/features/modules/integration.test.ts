// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ModuleManifest, SSEEvent } from '@opentidy/shared';
import { validateModule } from '../mcp-server/tools/validate-module.js';
import { loadCustomModules } from './loader.js';
import { createModuleLifecycle } from './lifecycle.js';
import { createDynamicToolRegistry } from '../mcp-server/dynamic-tools.js';

function createTempCustomModule(name: string, manifest: Record<string, unknown>): string {
  const baseDir = mkdtempSync(join(tmpdir(), 'opentidy-integration-'));
  const moduleDir = join(baseDir, name);
  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(join(moduleDir, 'module.json'), JSON.stringify(manifest));
  return baseDir;
}

const VALID_MANIFEST = {
  name: 'test-plugin',
  label: 'Test Plugin',
  description: 'A test plugin for integration testing',
  version: '1.0.0',
  skills: [{ name: 'test-skill', content: 'You are testing.' }],
};

describe('module creation integration', () => {
  it('validates, registers, and appears in manifests', () => {
    const customDir = createTempCustomModule('test-plugin', VALID_MANIFEST);

    // Step 1: validate
    const validation = validateModule('test-plugin', customDir, new Set());
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Step 2: load custom modules
    const customModules = loadCustomModules(customDir);
    expect(customModules.size).toBe(1);
    expect(customModules.get('test-plugin')!.label).toBe('Test Plugin');

    // Step 3: register via lifecycle
    const config = { modules: {} as Record<string, any> };
    const manifests = new Map<string, ModuleManifest>();
    const emitted: SSEEvent[] = [];

    const lifecycle = createModuleLifecycle({
      loadConfig: () => config as any,
      saveConfig: vi.fn(),
      manifests,
      regenerateAgentConfig: vi.fn(),
      sse: { emit: (e: SSEEvent) => emitted.push(e) },
    });

    lifecycle.registerCustomModule('test-plugin', customModules.get('test-plugin')!);

    // Verify: module is in config
    expect(config.modules['test-plugin']).toBeDefined();
    expect(config.modules['test-plugin'].source).toBe('custom');
    expect(config.modules['test-plugin'].enabled).toBe(false);

    // Verify: module is in manifests
    expect(manifests.has('test-plugin')).toBe(true);
    expect(manifests.get('test-plugin')!.skills).toHaveLength(1);

    // Verify: SSE event was emitted
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('module:added');
  });

  it('rejects module with curated name collision', () => {
    const customDir = createTempCustomModule('email', {
      ...VALID_MANIFEST,
      name: 'email',
      label: 'Email Clone',
    });

    const validation = validateModule('email', customDir, new Set(['email']));
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('curated');
  });

  it('rejects module with invalid manifest', () => {
    const customDir = createTempCustomModule('bad-module', { name: '' });

    const validation = validateModule('bad-module', customDir, new Set());
    expect(validation.valid).toBe(false);
  });
});

describe('daemon module integration', () => {
  it('starts daemon, registers tools, emits events, then stops cleanly', async () => {
    // Create a mock daemon module in tmpdir
    const baseDir = mkdtempSync(join(tmpdir(), 'opentidy-daemon-integ-'));
    const moduleDir = join(baseDir, 'test-daemon');
    mkdirSync(moduleDir, { recursive: true });

    // Write module.json with daemon entry
    writeFileSync(join(moduleDir, 'module.json'), JSON.stringify({
      name: 'test-daemon',
      label: 'Test Daemon',
      description: 'Integration test daemon',
      version: '1.0.0',
      daemon: { entry: './daemon.ts' },
      toolPermissions: {
        scope: 'per-call',
        safe: [{ tool: 'test_list', label: 'List' }],
        critical: [],
      },
    }));

    // Write a minimal daemon.ts
    writeFileSync(join(moduleDir, 'daemon.ts'), `
      export async function start(ctx) {
        ctx.registerTool('test_list', { description: 'Test list', inputSchema: {} }, async () => {
          return { items: ['a', 'b'] };
        });
        ctx.emit({ source: 'test', content: 'daemon started', metadata: {} });
        ctx.logger.log('Daemon started');
      }
      export async function stop() {}
    `);

    const config = {
      modules: { 'test-daemon': { enabled: false, source: 'curated' } } as Record<string, any>,
    };
    const manifests = new Map<string, ModuleManifest>();
    const emitted: SSEEvent[] = [];
    const dynamicToolRegistry = createDynamicToolRegistry();
    const dataDir = mkdtempSync(join(tmpdir(), 'opentidy-daemon-data-'));

    // Load manifest
    const { ModuleManifestSchema } = await import('@opentidy/shared');
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(readFileSync(join(moduleDir, 'module.json'), 'utf-8'));
    const manifest = ModuleManifestSchema.parse(raw);
    manifests.set('test-daemon', manifest);

    const lifecycle = createModuleLifecycle({
      loadConfig: () => config as any,
      saveConfig: vi.fn(),
      manifests,
      regenerateAgentConfig: vi.fn(),
      sse: { emit: (e: SSEEvent) => emitted.push(e) },
      modulesBaseDir: baseDir,
      dynamicToolRegistry,
      modulesDataBaseDir: dataDir,
    });

    // Enable — should start daemon
    await lifecycle.enable('test-daemon');

    // Verify: tool registered in dynamic registry
    expect(dynamicToolRegistry.has('test_list')).toBe(true);

    // Verify: tool works
    const result = await dynamicToolRegistry.execute('test_list', {});
    expect(result.content[0].text).toContain('a');

    // Verify: SSE events emitted (module:enabled at least)
    expect(emitted.some(e => e.type === 'module:enabled')).toBe(true);

    // Disable — should stop daemon and unregister tools
    await lifecycle.disable('test-daemon');
    expect(dynamicToolRegistry.has('test_list')).toBe(false);
  });

  it('validates daemon field in manifest schema', async () => {
    const { ModuleManifestSchema } = await import('@opentidy/shared');
    const result = ModuleManifestSchema.safeParse({
      name: 'daemon-mod',
      label: 'Daemon',
      description: 'Test',
      version: '1.0.0',
      daemon: { entry: './daemon.ts' },
    });
    expect(result.success).toBe(true);
  });
});
