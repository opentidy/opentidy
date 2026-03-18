import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLockManager } from '../../src/infra/locks.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('LockManager', () => {
  let lockDir: string;
  let locks: ReturnType<typeof createLockManager>;

  beforeEach(() => {
    lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-locks-'));
    locks = createLockManager(lockDir);
  });

  afterEach(() => {
    fs.rmSync(lockDir, { recursive: true, force: true });
  });

  it('acquires and releases a lock', () => {
    expect(locks.acquire('factures-sopra')).toBe(true);
    expect(locks.isLocked('factures-sopra')).toBe(true);
    locks.release('factures-sopra');
    expect(locks.isLocked('factures-sopra')).toBe(false);
  });

  it('prevents double lock on same dossier', () => {
    expect(locks.acquire('factures-sopra')).toBe(true);
    expect(locks.acquire('factures-sopra')).toBe(false);
  });

  it('allows parallel locks on different dossiers', () => {
    expect(locks.acquire('factures-sopra')).toBe(true);
    expect(locks.acquire('exali-rapport')).toBe(true);
    expect(locks.isLocked('factures-sopra')).toBe(true);
    expect(locks.isLocked('exali-rapport')).toBe(true);
  });

  it('cleans up stale lock with dead PID', () => {
    const lockFile = path.join(lockDir, 'stale-dossier.lock');
    fs.writeFileSync(lockFile, '999999');
    expect(locks.isLocked('stale-dossier')).toBe(false);
  });

  it('cleanupStaleLocks removes all dead PID locks on boot', () => {
    fs.writeFileSync(path.join(lockDir, 'dead1.lock'), '999998');
    fs.writeFileSync(path.join(lockDir, 'dead2.lock'), '999997');
    fs.writeFileSync(path.join(lockDir, 'alive.lock'), String(process.pid));

    const cleaned = locks.cleanupStaleLocks();
    expect(cleaned).toContain('dead1');
    expect(cleaned).toContain('dead2');
    expect(cleaned).not.toContain('alive');
  });
});
