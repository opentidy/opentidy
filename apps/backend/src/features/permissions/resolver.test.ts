// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { createPermissionResolver } from './resolver';
import type { ModuleManifest, PermissionConfig } from '@opentidy/shared';

const gmailManifest: ModuleManifest = {
  name: 'gmail', label: 'Gmail', description: '', version: '1.0.0',
  toolPermissions: {
    scope: 'per-call',
    safe: ['mcp__gmail__search', 'mcp__gmail__read_message'],
    critical: ['mcp__gmail__send', 'mcp__gmail__reply'],
  },
};

const browserManifest: ModuleManifest = {
  name: 'browser', label: 'Browser', description: '', version: '1.0.0',
  toolPermissions: {
    scope: 'per-task',
    safe: ['mcp__camofox__navigate', 'mcp__camofox__snapshot'],
    critical: ['mcp__camofox__click', 'mcp__camofox__fill_form'],
  },
};

const noPermManifest: ModuleManifest = {
  name: 'unknown', label: 'Unknown', description: '', version: '1.0.0',
};

const config: PermissionConfig = {
  preset: 'autonomous',
  defaultLevel: 'ask',
  modules: { gmail: 'ask', browser: 'allow' },
};

describe('PermissionResolver', () => {
  const manifests = new Map<string, ModuleManifest>([
    ['gmail', gmailManifest],
    ['browser', browserManifest],
    ['unknown', noPermManifest],
  ]);
  const resolver = createPermissionResolver(manifests, config);

  it('returns allow for safe tools regardless of module level', () => {
    const result = resolver.resolve('mcp__gmail__search');
    expect(result).toEqual({ level: 'allow', scope: 'per-call', moduleName: 'gmail' });
  });

  it('returns module level for critical tools', () => {
    const result = resolver.resolve('mcp__gmail__send');
    expect(result).toEqual({ level: 'ask', scope: 'per-call', moduleName: 'gmail' });
  });

  it('returns allow for critical tools when module level is allow', () => {
    const result = resolver.resolve('mcp__camofox__click');
    expect(result).toEqual({ level: 'allow', scope: 'per-task', moduleName: 'browser' });
  });

  it('returns defaultLevel for modules without explicit config', () => {
    const result = resolver.resolve('mcp__unknown_tool__action');
    expect(result.level).toBe('ask');
  });

  it('returns ask+per-call for completely unknown tools (fail-safe)', () => {
    const result = resolver.resolve('mcp__totally_unknown__foo');
    expect(result).toEqual({ level: 'ask', scope: 'per-call', moduleName: null });
  });

  it('builds allowedTools list (safe + allow-level critical + ask-level critical)', () => {
    const list = resolver.getAllowedTools();
    expect(list).toContain('mcp__gmail__search');
    expect(list).toContain('mcp__gmail__send');
    expect(list).toContain('mcp__camofox__navigate');
    expect(list).toContain('mcp__camofox__click');
  });

  it('builds ask matcher regex', () => {
    const matcher = resolver.getAskMatcher();
    expect(matcher).toContain('mcp__gmail__send');
    expect(matcher).toContain('mcp__gmail__reply');
    expect(matcher).not.toContain('mcp__camofox__click');
  });
});
