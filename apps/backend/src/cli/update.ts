// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getVersion } from '../cli.js';

export async function runUpdate(): Promise<void> {
  const currentVersion = getVersion();
  console.log(`\n  Current version: ${currentVersion}`);
  console.log('  Checking for updates...\n');

  // Check GitHub releases for latest version
  try {
    const res = await fetch('https://api.github.com/repos/opentidy/opentidy/releases/latest');
    if (!res.ok) {
      console.log('  Could not check GitHub releases. Falling back to brew.\n');
      return brewUpdate();
    }
    const data = await res.json() as { tag_name: string };
    const latest = data.tag_name.replace(/^(opentidy-)?v/, '');

    const latestParts = latest.split('.').map(Number);
    const currentParts = currentVersion.split('.').map(Number);
    let isNewer = false;
    for (let i = 0; i < 3; i++) {
      if ((latestParts[i] || 0) > (currentParts[i] || 0)) { isNewer = true; break; }
      if ((latestParts[i] || 0) < (currentParts[i] || 0)) break;
    }

    if (!isNewer) {
      console.log(`  Already up to date (v${currentVersion}).\n`);
      return;
    }

    console.log(`  Update available: v${latest}\n`);

    // Detect install method: walk up from dist/cli.js to find .git
    const fromDirname = path.resolve(import.meta.dirname, '../../..');
    const fromUrl = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
    const installDir = process.env.OPENTIDY_DIR || (fs.existsSync(path.join(fromDirname, '.git')) ? fromDirname : fromUrl);
    console.log(`  Install dir: ${installDir} (git: ${fs.existsSync(path.join(installDir, '.git'))})\n`);
    if (fs.existsSync(path.join(installDir, '.git'))) {
      return gitUpdate(installDir);
    }
    return brewUpdate();
  } catch (err) {
    console.error('  Update check failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function brewUpdate(): void {
  try {
    execFileSync('brew', ['update'], { stdio: 'inherit', timeout: 60_000 });
    const outdated = execFileSync('brew', ['outdated', 'opentidy'], { encoding: 'utf-8', timeout: 10_000 }).trim();
    if (outdated) {
      console.log(`  Upgrading via brew...\n`);
      execFileSync('brew', ['upgrade', 'opentidy'], { stdio: 'inherit', timeout: 300_000 });
      console.log('\n  Restarting...');
      execFileSync('brew', ['services', 'restart', 'opentidy'], { stdio: 'inherit', timeout: 30_000 });
      console.log('  Done.\n');
    } else {
      console.log('  Already up to date.\n');
    }
  } catch (err) {
    console.error('  Brew update failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function gitUpdate(installDir: string): void {
  try {
    console.log('  Pulling latest...');
    execFileSync('git', ['-C', installDir, 'pull', '--ff-only', '--quiet'], { stdio: 'inherit', timeout: 60_000 });
    console.log('  Installing dependencies...');
    execFileSync('pnpm', ['install', '--force', '--silent'], { cwd: installDir, stdio: 'inherit', timeout: 120_000 });
    console.log('  Building...');
    execFileSync('pnpm', ['build'], { cwd: installDir, stdio: 'inherit', timeout: 120_000 });
    console.log('\n  Restarting...');
    try {
      execFileSync('pkill', ['-f', 'node.*dist/cli.js.*start'], { timeout: 5_000 });
    } catch { /* process may not be running */ }
    // LaunchAgent (KeepAlive=true) will auto-restart the server
    // Wait for health check
    console.log('  Waiting for server...');
    const port = process.env.OPENTIDY_PORT || '5175';
    for (let i = 0; i < 10; i++) {
      try {
        execFileSync('curl', ['-sf', `http://localhost:${port}/api/health`], { timeout: 3_000, stdio: 'pipe' });
        console.log('  ✓ Server is up\n');
        return;
      } catch { /* retry */ }
      execFileSync('sleep', ['2']);
    }
    console.log('  Server did not come back up. Check: opentidy logs\n');
  } catch (err) {
    console.error('  Git update failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
