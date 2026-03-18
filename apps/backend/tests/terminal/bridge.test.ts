import { describe, it, expect, vi } from 'vitest';
import { createTerminalManager } from '../../src/terminal/bridge.js';

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
    const deps = createMockDeps(['alfred-sopra']);
    const mgr = createTerminalManager(deps);
    const port = mgr.getPort('alfred-sopra');
    expect(port).toBeUndefined();
  });

  it('returns undefined port for session not in list', () => {
    const deps = createMockDeps([]);
    const mgr = createTerminalManager(deps);
    expect(mgr.getPort('alfred-test')).toBeUndefined();
  });
});
