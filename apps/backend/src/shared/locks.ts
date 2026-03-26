// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function createLockManager(lockDir: string) {
  fs.mkdirSync(lockDir, { recursive: true });

  function lockPath(taskId: string): string {
    return path.join(lockDir, `${taskId}.lock`);
  }

  function acquire(taskId: string): boolean {
    const p = lockPath(taskId);
    try {
      // wx flag = create exclusively, fails if file already exists (atomic)
      fs.writeFileSync(p, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      // File exists. Check if the holding process is still alive.
      if (!isLocked(taskId)) {
        // Stale lock was cleaned up by isLocked, retry once
        try {
          fs.writeFileSync(p, String(process.pid), { flag: 'wx' });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  function release(taskId: string): void {
    const p = lockPath(taskId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  function isLocked(taskId: string): boolean {
    const p = lockPath(taskId);
    if (!fs.existsSync(p)) return false;
    const pid = parseInt(fs.readFileSync(p, 'utf-8').trim(), 10);
    if (!isPidAlive(pid)) {
      fs.unlinkSync(p);
      return false;
    }
    return true;
  }

  function cleanupStaleLocks(): string[] {
    const cleaned: string[] = [];
    const files = fs.readdirSync(lockDir).filter(f => f.endsWith('.lock'));
    for (const file of files) {
      const fullPath = path.join(lockDir, file);
      const pid = parseInt(fs.readFileSync(fullPath, 'utf-8').trim(), 10);
      if (!isPidAlive(pid)) {
        fs.unlinkSync(fullPath);
        cleaned.push(file.replace('.lock', ''));
      }
    }
    return cleaned;
  }

  function listLocked(): string[] {
    const files = fs.readdirSync(lockDir).filter(f => f.endsWith('.lock'));
    return files
      .map(f => f.replace('.lock', ''))
      .filter(id => isLocked(id));
  }

  return { acquire, release, isLocked, cleanupStaleLocks, listLocked };
}