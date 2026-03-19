// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { fork, type ChildProcess } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { getOpenTidyPaths } from './shared/paths.js';

export interface SupervisorOptions {
  script: string;
  args?: string[];
  maxRestarts?: number;
  restartDelayMs?: number;
}

export function writePidFile(pidPath: string): void {
  writeFileSync(pidPath, String(process.pid));
}

export function readPidFile(pidPath: string): number | undefined {
  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    return isNaN(pid) ? undefined : pid;
  } catch {
    return undefined;
  }
}

export function removePidFile(pidPath: string): void {
  try { unlinkSync(pidPath); } catch {}
}

export function createSupervisor(opts: SupervisorOptions) {
  const maxRestarts = opts.maxRestarts ?? 10;
  const restartDelay = opts.restartDelayMs ?? 5000;
  let child: ChildProcess | null = null;
  let restartCount = 0;
  let stopped = false;

  function spawnWorker(): void {
    child = fork(opts.script, opts.args ?? [], {
      stdio: 'inherit',
      detached: false,
    });

    child.on('exit', (code) => {
      if (stopped) return;
      if (code !== 0 && restartCount < maxRestarts) {
        restartCount++;
        console.log(`[supervisor] Worker exited with code ${code}, restarting (${restartCount}/${maxRestarts})...`);
        setTimeout(spawnWorker, restartDelay);
      } else if (restartCount >= maxRestarts) {
        console.error(`[supervisor] Max restarts (${maxRestarts}) reached, giving up`);
        process.exit(1);
      }
    });
  }

  function start(): void {
    stopped = false;
    const paths = getOpenTidyPaths();
    const pidPath = path.join(paths.temp, 'opentidy.pid');
    writePidFile(pidPath);
    spawnWorker();
  }

  function stop(): void {
    stopped = true;
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    const paths = getOpenTidyPaths();
    removePidFile(path.join(paths.temp, 'opentidy.pid'));
  }

  return { start, stop };
}