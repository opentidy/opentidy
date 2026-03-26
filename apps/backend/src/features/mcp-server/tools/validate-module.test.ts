// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { validateModule } from './validate-module.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTempModule(name: string, manifest: Record<string, unknown>, files?: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'opentidy-validate-'));
  const moduleDir = join(dir, name);
  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(join(moduleDir, 'module.json'), JSON.stringify(manifest));
  if (files) {
    for (const [fileName, content] of Object.entries(files)) {
      writeFileSync(join(moduleDir, fileName), content);
    }
  }
  return dir;
}

describe('validateModule', () => {
  it('passes for a valid minimal manifest', () => {
    const dir = createTempModule('test-module', {
      name: 'test-module', label: 'Test', description: 'A test', version: '1.0.0',
    });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails if module.json does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opentidy-validate-'));
    mkdirSync(join(dir, 'missing'));
    const result = validateModule('missing', dir, new Set());
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('module.json');
  });

  it('fails if manifest does not pass Zod schema', () => {
    const dir = createTempModule('test-module', { name: '' });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails if receiver transform file does not exist', () => {
    const dir = createTempModule('test-module', {
      name: 'test-module', label: 'Test', description: 'A test', version: '1.0.0',
      receivers: [{ name: 'webhook', mode: 'webhook', source: 'test', transform: './transform.ts' }],
    });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('transform.ts');
  });

  it('passes if receiver transform file exists', () => {
    const dir = createTempModule('test-module', {
      name: 'test-module', label: 'Test', description: 'A test', version: '1.0.0',
      receivers: [{ name: 'webhook', mode: 'webhook', source: 'test', transform: './transform.ts' }],
    }, { 'transform.ts': 'export function transform() {}' });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(true);
  });

  it('fails if name collides with curated module', () => {
    const dir = createTempModule('email', {
      name: 'email', label: 'Email Clone', description: 'Collision', version: '1.0.0',
    });
    const result = validateModule('email', dir, new Set(['email']));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('curated');
  });

  it('fails if module name contains invalid characters', () => {
    const result = validateModule('../evil', '/tmp', new Set());
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('invalid');
  });

  it('accepts npx commands without checking package existence', () => {
    const dir = createTempModule('test-module', {
      name: 'test-module', label: 'Test', description: 'A test', version: '1.0.0',
      mcpServers: [{ name: 'test', command: 'npx', args: ['-y', '@nonexistent/package'] }],
    });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(true);
  });

  it('skips command check for HTTP-based MCP servers', () => {
    const dir = createTempModule('test-module', {
      name: 'test-module', label: 'Test', description: 'A test', version: '1.0.0',
      mcpServers: [{ name: 'test', url: 'http://localhost:3000/mcp' }],
    });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(true);
  });
});
