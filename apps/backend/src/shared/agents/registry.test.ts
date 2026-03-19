// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAgent } from './registry.js';

describe('resolveAgent', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENTIDY_AGENT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to claude when no config', () => {
    const adapter = resolveAgent({ configDir: '/fake' });
    expect(adapter.name).toBe('claude');
  });

  it('uses OPENTIDY_AGENT env var override', () => {
    process.env.OPENTIDY_AGENT = 'claude';
    const adapter = resolveAgent({ configDir: '/fake' });
    expect(adapter.name).toBe('claude');
  });

  it('uses configAgent when provided', () => {
    const adapter = resolveAgent({ configDir: '/fake', configAgent: 'claude' });
    expect(adapter.name).toBe('claude');
  });

  it('env var takes highest priority', () => {
    process.env.OPENTIDY_AGENT = 'claude';
    const adapter = resolveAgent({ configDir: '/fake', configAgent: 'claude', flagAgent: 'claude' });
    expect(adapter.name).toBe('claude');
  });

  it('throws on unknown agent name', () => {
    expect(() => resolveAgent({ configDir: '/fake', configAgent: 'unknown' as any })).toThrow('Unknown agent');
  });

  it('throws not yet implemented for gemini', () => {
    expect(() => resolveAgent({ configDir: '/fake', configAgent: 'gemini' })).toThrow(/not yet implemented/);
  });

  it('throws not yet implemented for copilot', () => {
    expect(() => resolveAgent({ configDir: '/fake', configAgent: 'copilot' })).toThrow(/not yet implemented/);
  });
});
