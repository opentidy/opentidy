// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Setup script for the password-manager module.
// Runs interactively: bw login → prompt master password → store in OS keychain → verify.
// Invoked via: npx tsx ./setup.ts (from authCommand in module.json)

import { execFileSync, spawnSync } from 'child_process';
import { createInterface } from 'readline';

const SERVICE = 'opentidy';
const ACCOUNT = 'bitwarden-master-password';
const MAX_RETRIES = 3;

function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const rl = createInterface({ input: process.stdin, terminal: false });
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(true);
    }
    let password = '';
    process.stdin.on('data', (chunk: Buffer) => {
      const char = chunk.toString();
      if (char === '\n' || char === '\r' || char === '\r\n') {
        if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
        process.stderr.write('\n');
        rl.close();
        resolve(password);
        return;
      }
      password += char;
    });
  });
}

function verifyPassword(masterPassword: string): boolean {
  try {
    const sessionToken = execFileSync('bw', ['unlock', '--passwordenv', 'OPENTIDY_BW_MASTER', '--raw'], {
      env: { ...process.env, OPENTIDY_BW_MASTER: masterPassword },
      encoding: 'utf-8',
      timeout: 30_000,
    }).trim();
    return sessionToken.length > 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log('\n🔐 Password Manager Setup\n');

  // Step 1: Check bw CLI, auto-install if missing
  try {
    execFileSync('bw', ['--version'], { encoding: 'utf-8' });
    console.log('✓ Bitwarden CLI found');
  } catch {
    console.log('→ Bitwarden CLI (bw) not found, installing via Homebrew...');
    try {
      execFileSync('brew', ['install', 'bitwarden-cli'], { stdio: 'inherit', timeout: 120_000 });
      console.log('✓ Bitwarden CLI installed');
    } catch {
      console.error('❌ Failed to install Bitwarden CLI. Install manually: brew install bitwarden-cli');
      process.exit(1);
    }
  }

  // Step 2: Check login status
  const statusRaw = execFileSync('bw', ['status'], { encoding: 'utf-8' });
  const status = JSON.parse(statusRaw);

  if (status.status === 'unauthenticated') {
    console.log('You need to log in to Bitwarden first.\n');
    const loginResult = spawnSync('bw', ['login'], { stdio: 'inherit' });
    if (loginResult.status !== 0) {
      console.error('❌ Login failed');
      process.exit(1);
    }
    console.log('');
  } else {
    console.log(`✓ Already logged in as ${status.userEmail}\n`);
  }

  // Step 3: Prompt for master password + verify (with retry)
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const masterPassword = await promptPassword(
      `Enter your Bitwarden master password (will be stored in OS keychain)${attempt > 1 ? ` [attempt ${attempt}/${MAX_RETRIES}]` : ''}: `
    );

    if (!masterPassword) {
      console.error('❌ No password entered');
      if (attempt === MAX_RETRIES) process.exit(1);
      continue;
    }

    // Verify by unlocking
    if (!verifyPassword(masterPassword)) {
      console.error('❌ Failed to unlock vault. Wrong master password?');
      if (attempt === MAX_RETRIES) process.exit(1);
      continue;
    }

    console.log('✓ Password verified, vault unlocked successfully\n');

    // Store in keychain via macOS `security` CLI (no native module popup)
    try {
      // Remove existing entry if any
      try { execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT], { stdio: 'pipe' }); } catch { /* may not exist */ }
      execFileSync('security', ['add-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w', masterPassword, '-U'], { stdio: 'pipe' });
      console.log('✓ Master password stored in OS keychain\n');
    } catch (err) {
      console.error('❌ Failed to store in keychain:', (err as Error).message);
      process.exit(1);
    }

    console.log('✅ Password Manager setup complete!\n');
    return;
  }
}

main().catch((err) => {
  console.error('❌ Setup failed:', (err as Error).message);
  process.exit(1);
});
