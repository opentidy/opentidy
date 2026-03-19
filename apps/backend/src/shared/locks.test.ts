// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach } from 'vitest';
import { createLockManager } from './locks.js';
import fs from 'fs';
import path from 'path';
import { useTmpDir } from './test-helpers/tmpdir.js';

describe('LockManager', () => {
  const tmp = useTmpDir('opentidy-locks-');
  let locks: ReturnType<typeof createLockManager>;

  beforeEach(() => {
    locks = createLockManager(tmp.path);
  });

  it('acquires and releases a lock', () => {
    expect(locks.acquire('invoices-acme')).toBe(true);
    expect(locks.isLocked('invoices-acme')).toBe(true);
    locks.release('invoices-acme');
    expect(locks.isLocked('invoices-acme')).toBe(false);
  });

  it('prevents double lock on same dossier', () => {
    expect(locks.acquire('invoices-acme')).toBe(true);
    expect(locks.acquire('invoices-acme')).toBe(false);
  });

  it('allows parallel locks on different dossiers', () => {
    expect(locks.acquire('invoices-acme')).toBe(true);
    expect(locks.acquire('insurance-report')).toBe(true);
    expect(locks.isLocked('invoices-acme')).toBe(true);
    expect(locks.isLocked('insurance-report')).toBe(true);
  });

  it('cleans up stale lock with dead PID', () => {
    const lockFile = path.join(tmp.path, 'stale-dossier.lock');
    fs.writeFileSync(lockFile, '999999');
    expect(locks.isLocked('stale-dossier')).toBe(false);
  });

  it('cleanupStaleLocks removes all dead PID locks on boot', () => {
    fs.writeFileSync(path.join(tmp.path, 'dead1.lock'), '999998');
    fs.writeFileSync(path.join(tmp.path, 'dead2.lock'), '999997');
    fs.writeFileSync(path.join(tmp.path, 'alive.lock'), String(process.pid));

    const cleaned = locks.cleanupStaleLocks();
    expect(cleaned).toContain('dead1');
    expect(cleaned).toContain('dead2');
    expect(cleaned).not.toContain('alive');
  });
});