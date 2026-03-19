// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { loadConfig, getConfigPath } from '../shared/config.js';
import { getVersion } from '../cli.js';

export async function runStatus(): Promise<void> {
  console.log(`\n  OpenTidy v${getVersion()}\n`);

  try {
    const services = execFileSync('brew', ['services', 'list'], { encoding: 'utf-8', timeout: 5000 });
    const serviceLine = services.split('\n').find(l => l.includes('opentidy'));
    console.log(serviceLine ? `  Service: ${serviceLine.trim()}` : '  Service: not registered');
  } catch {
    console.log('  Service: brew services not available');
  }

  const config = loadConfig(getConfigPath());
  try {
    const health = execFileSync('curl', ['-sf', `http://localhost:${config.server.port}/api/health`], { encoding: 'utf-8', timeout: 5000 });
    const data = JSON.parse(health);
    console.log(`  Status: running`);
    console.log(`  Uptime: ${Math.floor(data.uptime / 60)}m`);
    console.log(`  Port: ${config.server.port}`);
  } catch {
    console.log('  Status: not running');
  }
  console.log('');
}