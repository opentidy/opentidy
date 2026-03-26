// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { getVersion } from '../cli.js';

export async function runUpdate(): Promise<void> {
  const currentVersion = getVersion();
  console.log(`\n  Current version: ${currentVersion}`);
  console.log('  Checking for updates...\n');

  try {
    execFileSync('brew', ['update'], { stdio: 'inherit', timeout: 60_000 });
    console.log('\n  Upgrading...\n');
    const output = execFileSync('brew', ['upgrade', 'opentidy'], { encoding: 'utf-8', timeout: 300_000 });
    if (output.includes('already installed')) {
      console.log('  Already up to date.\n');
    } else {
      const newVersion = getVersion();
      console.log(`  Updated to ${newVersion}`);
      console.log('  Restarting...');
      execFileSync('brew', ['services', 'restart', 'opentidy'], { stdio: 'inherit', timeout: 30_000 });
      console.log('  Done.\n');
    }
  } catch (err) {
    console.error('  Update failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
