// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';

export async function runServiceControl(action: 'stop' | 'restart'): Promise<void> {
  try {
    if (action === 'stop') {
      console.log('  Stopping OpenTidy...');
      execFileSync('brew', ['services', 'stop', 'opentidy'], { stdio: 'inherit', timeout: 10_000 });
      console.log('  ✓ Service stopped\n');
    } else {
      console.log('  Restarting OpenTidy...');
      execFileSync('brew', ['services', 'restart', 'opentidy'], { stdio: 'inherit', timeout: 10_000 });
      console.log('  ✓ Service restarted\n');
    }
  } catch (err) {
    console.error(`  ${action} failed:`, err instanceof Error ? err.message : err);
    // Fallback: kill process directly
    try {
      execFileSync('pkill', ['-f', 'node.*dist/cli.js.*start'], { timeout: 5_000 });
      console.log('  ✓ Process killed\n');
    } catch {
      console.log('  Server was not running.\n');
    }
  }
}
