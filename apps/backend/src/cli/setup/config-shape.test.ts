// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../shared/config.js';

describe('OpenTidyConfig shape', () => {
  it('has userInfo section with defaults', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.userInfo).toEqual({ name: '', email: '', company: '' });
  });

  it('has mcp section with defaults', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.mcp.curated).toEqual({
      gmail: { enabled: false, configured: false },
      camoufox: { enabled: false, configured: false },
      whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
    });
    expect(config.mcp.marketplace).toEqual({});
  });

  it('deep-merges existing config missing new sections', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.version).toBe(2);
    expect(config.userInfo.name).toBe('');
    expect(config.mcp.curated.gmail.enabled).toBe(false);
  });
});
