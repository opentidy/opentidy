// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';

describe('daemon', () => {
  it('createSupervisor returns start and stop', async () => {
    const { createSupervisor } = await import('./daemon.js');
    const supervisor = createSupervisor({
      script: 'nonexistent.js',
      maxRestarts: 3,
      restartDelayMs: 100,
    });
    expect(typeof supervisor.start).toBe('function');
    expect(typeof supervisor.stop).toBe('function');
  });

  it('writePidFile writes process.pid', async () => {
    const { writePidFile, readPidFile, removePidFile } = await import('./daemon.js');
    const tmpPath = `/tmp/opentidy-test-${Date.now()}.pid`;
    writePidFile(tmpPath);
    const pid = readPidFile(tmpPath);
    expect(pid).toBe(process.pid);
    removePidFile(tmpPath);
    expect(readPidFile(tmpPath)).toBeUndefined();
  });
});