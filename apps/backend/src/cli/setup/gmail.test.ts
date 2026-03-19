// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../shared/config.js';
import { setupGmail } from './gmail.js';

vi.mock('./utils.js', () => ({
  ask: vi.fn().mockResolvedValue(''),
  run: vi.fn(),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

import { warn } from './utils.js';
import { execFileSync } from 'child_process';

describe('setupGmail', () => {
  let configDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.mocked(execFileSync).mockReset().mockReturnValue('');
    vi.mocked(warn).mockClear();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    configPath = join(configDir, 'config.json');
    // Always write a fresh config with configured=false
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      mcp: { gmail: { enabled: false, configured: false } },
    }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('marks gmail as configured on successful OAuth', async () => {
    await setupGmail();

    const config = loadConfig(configPath);
    expect(config.mcp.curated.gmail.enabled).toBe(true);
    expect(config.mcp.curated.gmail.configured).toBe(true);
  });

  it('warns when npx is not found', async () => {
    vi.mocked(execFileSync).mockReset().mockImplementation(() => { throw new Error('not found'); });

    await setupGmail();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('npx not found'));
    const config = loadConfig(configPath);
    expect(config.mcp.curated.gmail.enabled).toBe(false);
  });

  it('still configures when OAuth exits non-zero', async () => {
    let callCount = 0;
    vi.mocked(execFileSync).mockReset().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return '';
      throw new Error('OAuth process exited');
    });

    await setupGmail();

    const config = loadConfig(configPath);
    expect(config.mcp.curated.gmail.configured).toBe(true);
  });
});
