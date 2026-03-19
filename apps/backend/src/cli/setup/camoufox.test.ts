// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../shared/config.js';
import { setupCamoufox } from './camoufox.js';

vi.mock('./utils.js', () => ({
  ask: vi.fn().mockResolvedValue(''),
  run: vi.fn().mockReturnValue('1.0.0'),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

import { run, warn } from './utils.js';

describe('setupCamoufox', () => {
  let configDir: string;
  let configPath: string;
  let claudeConfigDir: string;

  beforeEach(() => {
    vi.mocked(run).mockReset().mockReturnValue('1.0.0');
    vi.mocked(warn).mockClear();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    claudeConfigDir = join(configDir, 'claude-config');
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      claudeConfig: { dir: claudeConfigDir },
      mcp: { camoufox: { enabled: false, configured: false } },
    }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('marks camoufox as configured and creates wrapper script', async () => {
    await setupCamoufox();

    const config = loadConfig(configPath);
    expect(config.mcp.curated.camoufox.enabled).toBe(true);
    expect(config.mcp.curated.camoufox.configured).toBe(true);

    const wrapperPath = join(claudeConfigDir, 'scripts', 'camofox-mcp.sh');
    expect(existsSync(wrapperPath)).toBe(true);

    const content = readFileSync(wrapperPath, 'utf-8');
    expect(content).toContain('CAMOFOX_USER');
    expect(content).toContain('camofox-mcp@latest');
  });

  it('warns when npx is not available', async () => {
    vi.mocked(run).mockReset().mockReturnValue('');

    await setupCamoufox();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('npx not found'));
    const config = loadConfig(configPath);
    expect(config.mcp.curated.camoufox.enabled).toBe(false);
  });

  it('warns when claudeConfig.dir is not set', async () => {
    writeFileSync(configPath, JSON.stringify({ version: 1 }));

    await setupCamoufox();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('Claude Code setup first'));
  });
});
