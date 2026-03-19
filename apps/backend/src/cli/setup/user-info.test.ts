// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../shared/config.js';

vi.mock('./utils.js', () => ({
  ask: vi.fn(),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

import { ask } from './utils.js';

describe('setupUserInfo', () => {
  let configDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ version: 1 }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('saves user info and language to config', async () => {
    vi.mocked(ask)
      .mockResolvedValueOnce('Alice Dupont')
      .mockResolvedValueOnce('alice@example.com')
      .mockResolvedValueOnce('Acme Corp')
      .mockResolvedValueOnce('fr');

    const { setupUserInfo } = await import('./user-info.js');
    await setupUserInfo();

    const config = loadConfig(configPath);
    expect(config.userInfo.name).toBe('Alice Dupont');
    expect(config.userInfo.email).toBe('alice@example.com');
    expect(config.userInfo.company).toBe('Acme Corp');
    expect(config.language).toBe('fr');
  });

  it('keeps existing info when user confirms', async () => {
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      userInfo: { name: 'Bob', email: 'bob@example.com', company: 'Corp' },
      language: 'en',
    }));

    vi.mocked(ask)
      .mockResolvedValueOnce('');

    const { setupUserInfo } = await import('./user-info.js');
    await setupUserInfo();

    const config = loadConfig(configPath);
    expect(config.userInfo.name).toBe('Bob');
  });
});
