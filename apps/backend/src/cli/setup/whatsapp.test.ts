// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../shared/config.js';
import { setupWhatsApp } from './whatsapp.js';

vi.mock('./utils.js', () => ({
  ask: vi.fn().mockResolvedValue(''),
  run: vi.fn().mockReturnValue(''),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

import { ask, run, warn } from './utils.js';
import { execFileSync } from 'child_process';

describe('setupWhatsApp', () => {
  let configDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.mocked(run).mockReset().mockReturnValue('');
    vi.mocked(execFileSync).mockReset().mockReturnValue('');
    vi.mocked(ask).mockReset().mockResolvedValue('');
    vi.mocked(warn).mockClear();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      mcp: { whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' } },
    }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('marks whatsapp as configured when wacli is authenticated', async () => {
    vi.mocked(run).mockReset().mockImplementation((cmd: string) => {
      if (cmd === 'wacli') return '1.0.0';
      if (cmd === 'which') return '/usr/local/bin/wacli';
      return '';
    });
    vi.mocked(execFileSync).mockReset().mockReturnValue('{"authenticated": true}');

    await setupWhatsApp();

    const config = loadConfig(configPath);
    expect(config.mcp.curated.whatsapp.enabled).toBe(true);
    expect(config.mcp.curated.whatsapp.configured).toBe(true);
    expect(config.mcp.curated.whatsapp.wacliPath).toBe('/usr/local/bin/wacli');
  });

  it('skips when wacli is not installed and user confirms skip', async () => {
    await setupWhatsApp();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('wacli not found'));
    const config = loadConfig(configPath);
    expect(config.mcp.curated.whatsapp.enabled).toBe(false);
  });

  it('triggers QR auth when wacli is installed but not authenticated', async () => {
    vi.mocked(run).mockReset().mockImplementation((cmd: string) => {
      if (cmd === 'wacli') return '1.0.0';
      if (cmd === 'which') return '/usr/local/bin/wacli';
      return '';
    });
    vi.mocked(execFileSync).mockReset().mockImplementation((_cmd, args) => {
      const argsArr = args as string[];
      if (argsArr?.[0] === 'doctor') return '{"authenticated": false}';
      return '';
    });

    await setupWhatsApp();

    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      'wacli', ['auth'], expect.objectContaining({ stdio: 'inherit' }),
    );
  });
});
