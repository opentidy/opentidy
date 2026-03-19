// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { generateServiceFile } from './service-installer.js';

describe('service-installer', () => {
  it('generates launchd plist on darwin', () => {
    const result = generateServiceFile({
      platform: 'darwin',
      nodePath: '/opt/homebrew/opt/node@22/bin/node',
      cliPath: '/opt/homebrew/lib/opentidy/dist/cli.js',
      logDir: '/Users/test/Library/Logs/opentidy',
    });
    expect(result.filename).toMatch(/\.plist$/);
    expect(result.content).toContain('com.opentidy.agent');
    expect(result.content).toContain('KeepAlive');
    expect(result.installPath).toContain('LaunchAgents');
  });

  it('generates systemd unit on linux', () => {
    const result = generateServiceFile({
      platform: 'linux',
      nodePath: '/usr/bin/node',
      cliPath: '/usr/lib/opentidy/dist/cli.js',
      logDir: '/home/test/.local/state/opentidy',
    });
    expect(result.filename).toMatch(/\.service$/);
    expect(result.content).toContain('[Unit]');
    expect(result.content).toContain('Restart=on-failure');
    expect(result.installPath).toContain('.config/systemd');
  });

  it('generates PowerShell script on windows', () => {
    const result = generateServiceFile({
      platform: 'win32',
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      cliPath: 'C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\opentidy\\dist\\cli.js',
      logDir: 'C:\\Users\\test\\AppData\\Local\\opentidy',
    });
    expect(result.filename).toBe('install-service.ps1');
    expect(result.content).toContain('New-Service');
  });

  it('throws on unsupported platform', () => {
    expect(() => generateServiceFile({
      platform: 'freebsd',
      nodePath: '/usr/bin/node',
      cliPath: '/usr/lib/opentidy/dist/cli.js',
      logDir: '/var/log/opentidy',
    })).toThrow('Unsupported platform');
  });
});