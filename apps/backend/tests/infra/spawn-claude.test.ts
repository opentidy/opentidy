import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSpawnClaude } from '../../src/infra/spawn-claude.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Keep reference to mock processes so tests can control them
let mockProc: any;

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const proc = new EventEmitter() as any;
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = { write: vi.fn(), end: vi.fn() };
    proc.pid = 12345;
    proc.killed = false;
    proc.kill = vi.fn();
    mockProc = proc;
    return proc;
  }),
}));

const { spawn } = await import('child_process');

// Helper: wait for the semaphore to resolve and process to spawn
async function tick() {
  await new Promise(r => setTimeout(r, 0));
}

describe('createSpawnClaude', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-spawn-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it('spawns claude with correct args and cwd', async () => {
    const spawnClaude = createSpawnClaude({});

    const handle = spawnClaude({
      args: ['-p', '--system-prompt', 'test', 'hello'],
      cwd: '/tmp/test',
      type: 'triage',
    });

    await tick(); // wait for semaphore + spawn

    mockProc.stdout.write('result text');
    mockProc.stdout.end();
    mockProc.emit('close', 0);

    const result = await handle.promise;
    expect(spawn).toHaveBeenCalledWith('claude', ['-p', '--system-prompt', 'test', 'hello'], {
      cwd: '/tmp/test',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(result).toBe('result text');
  });

  it('returns full stdout as string on success', async () => {
    const spawnClaude = createSpawnClaude({});

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'title',
    });

    await tick();

    mockProc.stdout.write('chunk1');
    mockProc.stdout.write('chunk2');
    mockProc.stdout.end();
    mockProc.emit('close', 0);

    const result = await handle.promise;
    expect(result).toBe('chunk1chunk2');
  });

  it('calls tracker.start and tracker.complete on success', async () => {
    const tracker = {
      start: vi.fn().mockReturnValue(42),
      complete: vi.fn(),
      fail: vi.fn(),
      setOutputPath: vi.fn(),
    };
    const spawnClaude = createSpawnClaude({ tracker });

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'triage',
      dossierId: 'my-dossier',
    });

    // tracker.start called immediately (before semaphore)
    expect(tracker.start).toHaveBeenCalledWith('triage', 'my-dossier', undefined, undefined);

    await tick();

    mockProc.stdout.write('ok');
    mockProc.stdout.end();
    mockProc.emit('close', 0);

    await handle.promise;
    expect(tracker.complete).toHaveBeenCalledWith(42, 0);
    expect(tracker.fail).not.toHaveBeenCalled();
  });

  it('calls tracker.fail on non-zero exit code', async () => {
    const tracker = {
      start: vi.fn().mockReturnValue(7),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const spawnClaude = createSpawnClaude({ tracker });

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'checkup',
    });

    await tick();

    mockProc.stderr.write('some error');
    mockProc.stderr.end();
    mockProc.stdout.end();
    mockProc.emit('close', 1);

    await expect(handle.promise).rejects.toThrow('claude exited 1');
    expect(tracker.fail).toHaveBeenCalledWith(7);
    expect(tracker.complete).not.toHaveBeenCalled();
  });

  it('calls tracker.fail on spawn error', async () => {
    const tracker = {
      start: vi.fn().mockReturnValue(99),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const spawnClaude = createSpawnClaude({ tracker });

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'memory-extraction',
    });

    await tick();

    mockProc.emit('error', new Error('ENOENT'));

    await expect(handle.promise).rejects.toThrow('ENOENT');
    expect(tracker.fail).toHaveBeenCalledWith(99);
  });

  it('writes output to file when outputDir is provided', async () => {
    const tracker = {
      start: vi.fn().mockReturnValue(5),
      complete: vi.fn(),
      fail: vi.fn(),
      setOutputPath: vi.fn(),
    };
    const spawnClaude = createSpawnClaude({ tracker, outputDir });

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'triage',
      dossierId: 'test-dossier',
    });

    await tick();

    mockProc.stdout.write('line 1\n');
    mockProc.stdout.write('line 2\n');
    mockProc.stdout.end();
    mockProc.emit('close', 0);

    await handle.promise;

    const expectedPath = path.join(outputDir, 'test-dossier.jsonl');
    expect(tracker.setOutputPath).toHaveBeenCalledWith(5, expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(fs.readFileSync(expectedPath, 'utf-8')).toBe('line 1\nline 2\n');
  });

  it('emits SSE process:output events', async () => {
    const sse = { emit: vi.fn() };
    const tracker = {
      start: vi.fn().mockReturnValue(10),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const spawnClaude = createSpawnClaude({ tracker, sse });

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'title',
      dossierId: 'my-dossier',
    });

    await tick();

    mockProc.stdout.write('chunk1');
    mockProc.stdout.write('chunk2');
    mockProc.stdout.end();
    mockProc.emit('close', 0);

    await handle.promise;

    expect(sse.emit).toHaveBeenCalledTimes(2);
    expect(sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'process:output',
        data: { trackId: 10, processType: 'title', dossierId: 'my-dossier', content: 'chunk1' },
      }),
    );
    expect(sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'process:output',
        data: { trackId: 10, processType: 'title', dossierId: 'my-dossier', content: 'chunk2' },
      }),
    );
  });

  it('does not emit SSE when sse dep is not provided', async () => {
    const spawnClaude = createSpawnClaude({});

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'triage',
    });

    await tick();

    mockProc.stdout.write('ok');
    mockProc.stdout.end();
    mockProc.emit('close', 0);

    // Should not throw
    await expect(handle.promise).resolves.toBe('ok');
  });

  it('uses type-based filename when no dossierId', async () => {
    const tracker = {
      start: vi.fn().mockReturnValue(3),
      complete: vi.fn(),
      fail: vi.fn(),
      setOutputPath: vi.fn(),
    };
    const spawnClaude = createSpawnClaude({ tracker, outputDir });

    const handle = spawnClaude({
      args: ['-p', 'test'],
      cwd: '/tmp',
      type: 'checkup',
    });

    await tick();

    mockProc.stdout.write('data');
    mockProc.stdout.end();
    mockProc.emit('close', 0);

    await handle.promise;

    const expectedPath = path.join(outputDir, 'checkup-3.txt');
    expect(tracker.setOutputPath).toHaveBeenCalledWith(3, expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it('exposes pid from the spawned process', async () => {
    const spawnClaude = createSpawnClaude({});
    const handle = spawnClaude({ args: ['-p', 'test'], cwd: '/tmp', type: 'triage' });

    await tick();

    expect(handle.pid).toBe(12345);

    mockProc.stdout.end();
    mockProc.emit('close', 0);
    await handle.promise;
  });

  it('kill() terminates the process', async () => {
    const spawnClaude = createSpawnClaude({});
    const handle = spawnClaude({ args: ['-p', 'test'], cwd: '/tmp', type: 'triage' });

    await tick();

    handle.kill();
    expect(mockProc.listenerCount('close')).toBeGreaterThan(0);

    // Simulate process closing after kill
    mockProc.stdout.end();
    mockProc.emit('close', 0);
    // Promise should resolve (killed processes resolve with code 0 since killed=true)
    await handle.promise;
  });
});
