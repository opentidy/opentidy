// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PLIST_PATH = join(homedir(), 'Library/LaunchAgents/com.opentidy.agent.plist');
const PORT = process.env.OPENTIDY_PORT || '5175';

export async function runServiceControl(action: 'stop' | 'restart'): Promise<void> {
  if (!existsSync(PLIST_PATH)) {
    console.log('  No LaunchAgent installed. Killing process directly...');
    try {
      execFileSync('pkill', ['-f', 'node.*dist/cli.js.*start'], { timeout: 5_000 });
      console.log('  ✓ Server stopped\n');
    } catch {
      console.log('  Server was not running.\n');
    }
    if (action === 'restart') {
      console.log('  No LaunchAgent to restart. Run: opentidy start\n');
    }
    return;
  }

  if (action === 'stop') {
    console.log('  Stopping OpenTidy...');
    try {
      execFileSync('launchctl', ['unload', PLIST_PATH], { timeout: 10_000 });
      console.log('  ✓ Service stopped (LaunchAgent unloaded)\n');
    } catch {
      // Fallback: kill the process directly
      try {
        execFileSync('pkill', ['-f', 'node.*dist/cli.js.*start'], { timeout: 5_000 });
        console.log('  ✓ Server stopped\n');
      } catch {
        console.log('  Server was not running.\n');
      }
    }
    return;
  }

  // restart
  console.log('  Restarting OpenTidy...');
  try {
    execFileSync('launchctl', ['unload', PLIST_PATH], { timeout: 10_000 });
  } catch { /* may not be loaded */ }

  try {
    execFileSync('pkill', ['-f', 'node.*dist/cli.js.*start'], { timeout: 5_000 });
  } catch { /* may not be running */ }

  // Small delay to let port free up
  await new Promise(r => setTimeout(r, 2000));

  execFileSync('launchctl', ['load', PLIST_PATH], { timeout: 10_000 });

  // Health check
  console.log('  Waiting for server...');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      execFileSync('curl', ['-sf', `http://localhost:${PORT}/api/health`], { timeout: 3_000, stdio: 'pipe' });
      console.log('  ✓ Server is up\n');
      return;
    } catch { /* retry */ }
  }
  console.log('  Server did not come back up. Check: opentidy logs\n');
}
