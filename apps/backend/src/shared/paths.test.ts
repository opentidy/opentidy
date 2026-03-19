// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('paths', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns all required path keys', async () => {
    const { getOpenTidyPaths } = await import('./paths.js');
    const paths = getOpenTidyPaths();
    expect(paths).toHaveProperty('config');
    expect(paths).toHaveProperty('data');
    expect(paths).toHaveProperty('log');
    expect(paths).toHaveProperty('cache');
    expect(paths).toHaveProperty('temp');
  });

  it('all paths are absolute', async () => {
    const { getOpenTidyPaths } = await import('./paths.js');
    const paths = getOpenTidyPaths();
    for (const [key, value] of Object.entries(paths)) {
      expect(value, `${key} should be absolute`).toMatch(/^(\/|[A-Z]:\\)/);
    }
  });

  it('respects OPENTIDY_CONFIG_DIR override', async () => {
    vi.stubEnv('OPENTIDY_CONFIG_DIR', '/custom/config');
    vi.resetModules();
    const { getOpenTidyPaths } = await import('./paths.js');
    const paths = getOpenTidyPaths();
    expect(paths.config).toBe('/custom/config');
  });

  it('respects OPENTIDY_DATA_DIR override', async () => {
    vi.stubEnv('OPENTIDY_DATA_DIR', '/custom/data');
    vi.resetModules();
    const { getOpenTidyPaths } = await import('./paths.js');
    const paths = getOpenTidyPaths();
    expect(paths.data).toBe('/custom/data');
  });

  it('lock dir is under temp', async () => {
    const { getOpenTidyPaths } = await import('./paths.js');
    const paths = getOpenTidyPaths();
    expect(paths.lockDir).toContain('opentidy');
  });
});