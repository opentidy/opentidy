// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSpawnAgent } from './spawn-agent.js';
import type { AgentAdapter } from './agents/types.js';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));
vi.mock('fs');

function createMockProcess(exitCode = 0, stdout = 'output'): ChildProcess {
  const proc = new EventEmitter() as any;
  proc.pid = 1234;
  proc.killed = false;
  proc.kill = vi.fn(() => { proc.killed = true; });
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  // Simulate async output + exit
  setTimeout(() => {
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  }, 5);
  return proc;
}

function createMockAdapter(overrides?: Partial<AgentAdapter>): AgentAdapter {
  return {
    name: 'claude',
    binary: 'claude',
    instructionFile: 'CLAUDE.md',
    configEnvVar: 'CLAUDE_CONFIG_DIR',
    experimental: false,
    buildArgs: vi.fn(() => ['-p', 'test']),
    getEnv: vi.fn(() => ({ CLAUDE_CONFIG_DIR: '/fake/config' })),
    readSessionId: vi.fn(() => null),
    writeConfig: vi.fn(),
    ...overrides,
  };
}

describe('createSpawnAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns using adapter.binary, not hardcoded "claude"', async () => {
    const { spawn } = await import('child_process');
    vi.mocked(spawn).mockReturnValue(createMockProcess() as any);

    const adapter = createMockAdapter({ binary: 'gemini' });
    const spawnAgent = createSpawnAgent({ adapter });

    const handle = spawnAgent({ args: ['-p', 'hello'], cwd: '/workspace', type: 'triage' });
    await handle.promise;

    expect(spawn).toHaveBeenCalledWith('gemini', ['-p', 'hello'], expect.any(Object));
  });

  it('passes adapter.getEnv() to spawn env', async () => {
    const { spawn } = await import('child_process');
    vi.mocked(spawn).mockReturnValue(createMockProcess() as any);

    const adapter = createMockAdapter({
      getEnv: vi.fn(() => ({ MY_CUSTOM_VAR: '/custom/path' })),
    });
    const spawnAgent = createSpawnAgent({ adapter });

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'triage' });
    await handle.promise;

    expect(spawn).toHaveBeenCalledWith(
      'claude',
      [],
      expect.objectContaining({
        env: expect.objectContaining({ MY_CUSTOM_VAR: '/custom/path' }),
      }),
    );
  });

  it('resolves with stdout on exit code 0', async () => {
    const { spawn } = await import('child_process');
    vi.mocked(spawn).mockReturnValue(createMockProcess(0, 'hello world') as any);

    const adapter = createMockAdapter();
    const spawnAgent = createSpawnAgent({ adapter });

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'triage' });
    const result = await handle.promise;
    expect(result).toBe('hello world');
  });

  it('rejects with error on non-zero exit code', async () => {
    const { spawn } = await import('child_process');
    const proc = new EventEmitter() as any;
    proc.pid = 1234;
    proc.killed = false;
    proc.kill = vi.fn();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    setTimeout(() => {
      proc.stderr.emit('data', Buffer.from('something went wrong'));
      proc.emit('close', 1);
    }, 5);
    vi.mocked(spawn).mockReturnValue(proc);

    const adapter = createMockAdapter();
    const spawnAgent = createSpawnAgent({ adapter });

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'triage' });
    await expect(handle.promise).rejects.toThrow('claude exited 1');
  });

  it('calls tracker lifecycle: start → markRunning → complete', async () => {
    const { spawn } = await import('child_process');
    vi.mocked(spawn).mockReturnValue(createMockProcess() as any);

    const tracker = {
      start: vi.fn(() => 42),
      markRunning: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const adapter = createMockAdapter();
    const spawnAgent = createSpawnAgent({ adapter, tracker });

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'checkup', jobId: 'test-job', description: 'Test run' });
    await handle.promise;

    expect(tracker.start).toHaveBeenCalledWith('checkup', 'test-job', undefined, 'Test run');
    expect(tracker.markRunning).toHaveBeenCalledWith(42, 1234);
    expect(tracker.complete).toHaveBeenCalledWith(42, 0);
  });

  it('calls tracker.fail on non-zero exit', async () => {
    const { spawn } = await import('child_process');
    const proc = new EventEmitter() as any;
    proc.pid = 1234;
    proc.killed = false;
    proc.kill = vi.fn();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    setTimeout(() => proc.emit('close', 1), 5);
    vi.mocked(spawn).mockReturnValue(proc);

    const tracker = {
      start: vi.fn(() => 1),
      markRunning: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const adapter = createMockAdapter();
    const spawnAgent = createSpawnAgent({ adapter, tracker });

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'triage' });
    await handle.promise.catch(() => {});

    expect(tracker.fail).toHaveBeenCalledWith(1);
  });

  it('provides trackId on the handle', async () => {
    const { spawn } = await import('child_process');
    vi.mocked(spawn).mockReturnValue(createMockProcess() as any);

    const tracker = { start: vi.fn(() => 99), markRunning: vi.fn(), complete: vi.fn(), fail: vi.fn() };
    const adapter = createMockAdapter();
    const spawnAgent = createSpawnAgent({ adapter, tracker });

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'title' });
    expect(handle.trackId).toBe(99);
  });

  it('kill() sends SIGTERM to the process', async () => {
    const { spawn } = await import('child_process');
    const proc = new EventEmitter() as any;
    proc.pid = 5678;
    proc.killed = false;
    proc.kill = vi.fn(() => { proc.killed = true; });
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(proc);

    const adapter = createMockAdapter();
    const spawnAgent = createSpawnAgent({ adapter });

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'triage' });
    // Wait for spawn to happen
    await new Promise(r => setTimeout(r, 2));
    handle.kill();

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('calls onOutput callback for each stdout chunk', async () => {
    const { spawn } = await import('child_process');
    vi.mocked(spawn).mockReturnValue(createMockProcess(0, 'chunk1') as any);

    const adapter = createMockAdapter();
    const spawnAgent = createSpawnAgent({ adapter });
    const chunks: string[] = [];

    const handle = spawnAgent({ args: [], cwd: '/workspace', type: 'triage', onOutput: (c) => chunks.push(c) });
    await handle.promise;

    expect(chunks).toContain('chunk1');
  });
});
