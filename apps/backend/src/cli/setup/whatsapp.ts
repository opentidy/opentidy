// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
import { ask, run, info, success, warn } from './utils.js';

export async function setupWhatsApp(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  WhatsApp                             │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('WhatsApp lets OpenTidy read and send messages.');
  info('Requires wacli (WhatsApp CLI) to be installed.');
  console.log('');

  if (config.modules?.whatsapp?.enabled) {
    success('WhatsApp already configured.');
    const reconfigure = await ask('  Reconfigure? (y/N) ');
    if (reconfigure.toLowerCase() !== 'y') return;
  }

  // Check wacli
  const wacliVersion = run('wacli', ['--version']);
  if (!wacliVersion) {
    warn('wacli not found.');
    info('Install: go install github.com/nickolasgamba/wacli@latest');
    info('Or: brew install wacli (if available)');
    console.log('');
    const skip = await ask('  Skip WhatsApp setup? (Y/n) ');
    if (skip.toLowerCase() !== 'n') return;
    if (!run('wacli', ['--version'])) {
      warn('wacli still not found. Skipping.');
      return;
    }
  }

  // Check authentication
  let authenticated = false;
  try {
    const doctorOutput = execFileSync('wacli', ['doctor', '--json'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: 'pipe',
    });
    const status = JSON.parse(doctorOutput);
    authenticated = !!status.authenticated;
  } catch {
    // doctor failed, need auth
  }

  if (!authenticated) {
    console.log('');
    info('WhatsApp needs to be authenticated via QR code.');
    info('This will display a QR code. Scan it with your phone.');
    info('Open WhatsApp > Settings > Linked Devices > Link a Device');
    console.log('');
    await ask('  Press Enter to start QR code auth...');

    try {
      execFileSync('wacli', ['auth'], { stdio: 'inherit', timeout: 120_000 });
      console.log('');
      success('WhatsApp authenticated.');
      authenticated = true;
    } catch {
      console.log('');
      warn('Authentication failed or timed out.');
      info('Run manually: wacli auth');
    }
  } else {
    success('WhatsApp already authenticated.');
  }

  if (authenticated) {
    if (!config.modules.whatsapp) config.modules.whatsapp = { enabled: false, source: 'curated' };
    config.modules.whatsapp.enabled = true;
    config.modules.whatsapp.config = { ...(config.modules.whatsapp.config ?? {}), wacliPath: run('which', ['wacli']) || 'wacli' };
    saveConfig(configPath, config);
    success('WhatsApp configured.');
  }
}
