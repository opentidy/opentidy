// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// tests/launcher/watchdog.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWorkspaceWatcher } from './watchdog.js';

function makeDeps(overrides: Partial<{ workspaceDir: string }> = {}) {
  return {
    sse: { emit: vi.fn() },
    workspaceDir: overrides.workspaceDir ?? '/tmp/test-workspace',
  };
}

describe('createWorkspaceWatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and closes watcher cleanly', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsWatchMock = vi.spyOn(require('fs'), 'watch').mockReturnValue({
      on: vi.fn(),
      close: vi.fn(),
    } as any);

    const deps = makeDeps();
    const watcher = createWorkspaceWatcher(deps);
    watcher.start();
    watcher.stop();

    expect(fsWatchMock).toHaveBeenCalledWith(
      deps.workspaceDir,
      { recursive: true },
      expect.any(Function),
    );
  });

  it('start is idempotent, does not open two watchers', () => {
    const closeMock = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.spyOn(require('fs'), 'watch').mockReturnValue({
      on: vi.fn(),
      close: closeMock,
    } as any);

    const deps = makeDeps();
    const watcher = createWorkspaceWatcher(deps);
    watcher.start();
    watcher.start(); // no-op
    watcher.stop();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('stop is safe when not started', () => {
    const deps = makeDeps();
    const watcher = createWorkspaceWatcher(deps);
    expect(() => watcher.stop()).not.toThrow();
  });

  it('emits task:updated for state.md changes (debounced)', async () => {
    vi.useFakeTimers();
    let watchCallback: ((eventType: string, filename: string) => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.spyOn(require('fs'), 'watch').mockImplementation((_dir: string, _opts: unknown, cb: (e: string, f: string) => void) => {
      watchCallback = cb;
      return { on: vi.fn(), close: vi.fn() } as any;
    });

    const deps = makeDeps();
    const watcher = createWorkspaceWatcher(deps);
    watcher.start();

    watchCallback!('change', 'factures/state.md');
    expect(deps.sse.emit).not.toHaveBeenCalled(); // not yet (debounce)

    await vi.advanceTimersByTimeAsync(3_000);
    expect(deps.sse.emit).toHaveBeenCalledOnce();
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task:updated', data: { taskId: 'factures' } }),
    );

    watcher.stop();
    vi.useRealTimers();
  });

  it('debounces rapid successive changes for the same task', async () => {
    vi.useFakeTimers();
    let watchCallback: ((eventType: string, filename: string) => void) | null = null;

    vi.spyOn(require('fs'), 'watch').mockImplementation((_dir: string, _opts: unknown, cb: (e: string, f: string) => void) => {
      watchCallback = cb;
      return { on: vi.fn(), close: vi.fn() } as any;
    });

    const deps = makeDeps();
    const watcher = createWorkspaceWatcher(deps);
    watcher.start();

    // Three rapid writes
    watchCallback!('change', 'factures/state.md');
    await vi.advanceTimersByTimeAsync(500);
    watchCallback!('change', 'factures/state.md');
    await vi.advanceTimersByTimeAsync(500);
    watchCallback!('change', 'factures/state.md');

    // Wait for debounce to settle
    await vi.advanceTimersByTimeAsync(3_000);

    // Only one emit despite three file events
    expect(deps.sse.emit).toHaveBeenCalledOnce();

    watcher.stop();
    vi.useRealTimers();
  });

  it('ignores _internal directories (e.g. _gaps, _suggestions)', async () => {
    vi.useFakeTimers();
    let watchCallback: ((eventType: string, filename: string) => void) | null = null;

    vi.spyOn(require('fs'), 'watch').mockImplementation((_dir: string, _opts: unknown, cb: (e: string, f: string) => void) => {
      watchCallback = cb;
      return { on: vi.fn(), close: vi.fn() } as any;
    });

    const deps = makeDeps();
    const watcher = createWorkspaceWatcher(deps);
    watcher.start();

    watchCallback!('change', '_gaps/gaps.md');
    watchCallback!('change', '_suggestions/some-file.md');
    await vi.advanceTimersByTimeAsync(3_000);

    expect(deps.sse.emit).not.toHaveBeenCalled();

    watcher.stop();
    vi.useRealTimers();
  });

  it('ignores irrelevant file changes (e.g. .session-id)', async () => {
    vi.useFakeTimers();
    let watchCallback: ((eventType: string, filename: string) => void) | null = null;

    vi.spyOn(require('fs'), 'watch').mockImplementation((_dir: string, _opts: unknown, cb: (e: string, f: string) => void) => {
      watchCallback = cb;
      return { on: vi.fn(), close: vi.fn() } as any;
    });

    const deps = makeDeps();
    const watcher = createWorkspaceWatcher(deps);
    watcher.start();

    watchCallback!('change', 'factures/.session-id');
    watchCallback!('change', 'factures/CLAUDE.md');
    await vi.advanceTimersByTimeAsync(3_000);

    expect(deps.sse.emit).not.toHaveBeenCalled();

    watcher.stop();
    vi.useRealTimers();
  });
});