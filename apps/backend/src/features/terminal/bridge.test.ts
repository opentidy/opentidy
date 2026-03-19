// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { createTerminalManager } from './bridge.js';

describe('TerminalManager', () => {
  function createMockDeps(sessions: string[] = []) {
    return {
      listSessions: vi.fn().mockReturnValue(sessions),
    };
  }

  it('creates a terminal manager with ensureReady, getPort, killTtyd', () => {
    const deps = createMockDeps();
    const mgr = createTerminalManager(deps);
    expect(mgr.ensureReady).toBeDefined();
    expect(mgr.getPort).toBeDefined();
    expect(mgr.killTtyd).toBeDefined();
  });

  it('ensureReady returns undefined for session not in list', async () => {
    const deps = createMockDeps([]);
    const mgr = createTerminalManager(deps);
    const port = await mgr.ensureReady('nonexistent');
    expect(port).toBeUndefined();
    expect(deps.listSessions).toHaveBeenCalled();
  });

  it('getPort returns undefined when no ttyd is running', () => {
    const deps = createMockDeps(['opentidy-acme']);
    const mgr = createTerminalManager(deps);
    const port = mgr.getPort('opentidy-acme');
    expect(port).toBeUndefined();
  });

  it('returns undefined port for session not in list', () => {
    const deps = createMockDeps([]);
    const mgr = createTerminalManager(deps);
    expect(mgr.getPort('opentidy-test')).toBeUndefined();
  });
});