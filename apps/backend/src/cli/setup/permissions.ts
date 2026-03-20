// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { ask, info, success, warn } from './utils.js';

export async function setupPermissions(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.log('');
    info('Permissions setup is only needed on macOS. Skipping.');
    console.log('');
    return;
  }

  // Detect headless/SSH — AppleScript requires a GUI session
  const isSSH = !!process.env.SSH_CLIENT || !!process.env.SSH_TTY;
  if (isSSH) {
    console.log('');
    warn('SSH session detected — macOS permission prompts require a local GUI session.');
    info('Run "opentidy setup permissions" locally on the Mac to grant permissions.');
    console.log('');
    return;
  }

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  macOS Permissions                   │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy uses AppleScript to control Messages, Mail,');
  info('Finder, Calendar, etc. macOS will ask for permission');
  info('the first time each app is accessed.');
  console.log('');
  info('We will trigger each permission now. For each one,');
  info('a macOS popup will appear — click "OK" or "Allow".');
  console.log('');
  await ask('  Press Enter to start...');

  const permissionTests = [
    { name: 'Messages (SMS)', script: 'tell application "Messages" to get name' },
    { name: 'Mail', script: 'tell application "Mail" to get name' },
    { name: 'Finder', script: 'tell application "Finder" to get name of startup disk' },
    { name: 'System Events', script: 'tell application "System Events" to get name' },
    { name: 'Calendar', script: 'tell application "Calendar" to get name' },
    { name: 'Contacts', script: 'tell application "Contacts" to get name' },
  ];

  for (const test of permissionTests) {
    console.log(`\n  Testing ${test.name}...`);
    info('If a macOS popup appears, click "OK" / "Allow".');
    try {
      execFileSync('osascript', ['-e', test.script], {
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: 'pipe',
      });
      success(`${test.name} — authorized`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('not allowed') || msg.includes('denied') || msg.includes('-1743')) {
        warn(`${test.name} — denied. Enable it in:`);
        info('  System Settings > Privacy & Security > Automation');
      } else {
        success(`${test.name} — done`);
      }
    }
  }

  // Full Disk Access — can't trigger via osascript
  console.log('');
  console.log('  ── Full Disk Access ──');
  info('This one can\'t be triggered automatically.');
  info('Needed for reading Mail databases and protected files.');
  console.log('');
  info('What to do:');
  info('  1. System Settings > Privacy & Security > Full Disk Access');
  info('  2. Click +');
  info('  3. Add the terminal you use (Terminal.app or iTerm)');
  info('  4. If OpenTidy runs via launchd, also add the node binary used by OpenTidy');
  console.log('');
  const openFda = await ask('  Open Full Disk Access settings? (Y/n) ');
  if (openFda.toLowerCase() !== 'n') {
    try {
      execFileSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'], { timeout: 5000 });
    } catch { /* ignore */ }
    await ask('  Press Enter when done...');
  }

  console.log('');
  success('Permissions setup complete.');
}
