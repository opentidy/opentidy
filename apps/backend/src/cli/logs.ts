// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { getOpenTidyPaths } from '../shared/paths.js';

export async function runLogs(): Promise<void> {
  const paths = getOpenTidyPaths();
  const logPaths = [
    path.join(paths.log, 'opentidy.log'),
    path.join(paths.log, 'opentidy-stdout.log'),
    // Legacy Homebrew path (macOS only)
    ...(process.platform === 'darwin' ? ['/opt/homebrew/var/log/opentidy.log'] : []),
  ];

  const logPath = logPaths.find(p => existsSync(p));
  if (!logPath) {
    console.log('  No log file found.');
    return;
  }

  console.log(`  Tailing ${logPath} (Ctrl+C to stop)\n`);

  // tail -f is Unix-only; on Windows use PowerShell Get-Content -Wait
  const isWindows = process.platform === 'win32';
  const tail = isWindows
    ? spawn('powershell', ['-Command', `Get-Content -Path "${logPath}" -Wait -Tail 50`], { stdio: 'inherit' })
    : spawn('tail', ['-f', logPath], { stdio: 'inherit' });
  tail.on('close', () => process.exit(0));
}