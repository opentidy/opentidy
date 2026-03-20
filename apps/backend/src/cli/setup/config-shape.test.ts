// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../shared/config.js';

describe('OpenTidyConfig shape', () => {
  it('has userInfo section with defaults', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.userInfo).toEqual({ name: '', email: '', company: '' });
  });

  it('has modules section with opentidy enabled by default', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.modules.opentidy).toEqual({ enabled: true, source: 'curated' });
  });

  it('has version 3 by default', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.version).toBe(3);
    expect(config.userInfo.name).toBe('');
    expect((config as any).mcp).toBeUndefined();
    expect((config as any).telegram).toBeUndefined();
  });
});
