// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';

export function createLockManager(lockDir: string) {
  fs.mkdirSync(lockDir, { recursive: true });

  function lockPath(jobId: string): string {
    return path.join(lockDir, `${jobId}.lock`);
  }

  function isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  function acquire(jobId: string): boolean {
    const p = lockPath(jobId);
    try {
      // wx flag = create exclusively, fails if file already exists (atomic)
      fs.writeFileSync(p, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      // File exists — check if the holding process is still alive
      if (!isLocked(jobId)) {
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

  function release(jobId: string): void {
    const p = lockPath(jobId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  function isLocked(jobId: string): boolean {
    const p = lockPath(jobId);
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