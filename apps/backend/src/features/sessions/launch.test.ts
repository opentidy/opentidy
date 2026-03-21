// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// tests/launcher/session.test.ts — tmux-only launcher
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLauncher } from './launch.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function createMockDeps(wsDir: string) {
  return {
    tmuxExecutor: {
      launchTmux: vi.fn().mockResolvedValue(12345),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      capturePane: vi.fn().mockResolvedValue(''),
      killSession: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockResolvedValue([]),
    },
    locks: {
      acquire: vi.fn().mockReturnValue(true),
      release: vi.fn(),
      isLocked: vi.fn().mockReturnValue(false),
      cleanupStaleLocks: vi.fn().mockReturnValue([]),
    },
    workspace: {
      getTask: vi.fn().mockReturnValue({
        id: 'test-task',
        title: 'Test Task',
        objective: 'Do something',
        status: 'IN_PROGRESS',
      }),
      listTaskIds: vi.fn().mockReturnValue(['test-task']),
      dir: wsDir,
    },
    notify: {
      notifyStarted: vi.fn(),
      notifyCompleted: vi.fn(),
    },
    sse: { emit: vi.fn() },
    workspaceDir: wsDir,
    terminal: {
      ensureReady: vi.fn().mockResolvedValue(8200),
      killTtyd: vi.fn(),
    },
    adapter: {
      name: 'claude',
      binary: 'claude',
      instructionFile: 'CLAUDE.md',
      configEnvVar: 'CLAUDE_CONFIG_DIR',
      experimental: false,
      buildArgs: vi.fn().mockReturnValue(['--allowedTools', 'tool1,tool2']),
      getEnv: () => ({}),
      readSessionId: vi.fn().mockReturnValue(null),
      writeConfig: () => {},
    },
    getAllowedTools: () => ['tool1', 'tool2'],
    recoveryDelayMs: 0, // No delay in tests
  };
}

describe('createLauncher (tmux-only)', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    // Create a task directory with state.md
    const taskDir = path.join(wsDir, 'test-task');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, 'state.md'),
      '# Test Task\nSTATUT : EN COURS\n## Objectif\nDo something',
    );
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('launchSession creates tmux session and starts ttyd', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task', { source: 'app', content: 'Do something' });

    expect(deps.locks.acquire).toHaveBeenCalledWith('test-task');
    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
      'opentidy-test-task',
      expect.stringContaining('claude'),
    );
    expect(deps.terminal.ensureReady).toHaveBeenCalledWith('opentidy-test-task');
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session:started' }),
    );
  });

  it('launchSession skips if session already active', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    await launcher.launchSession('test-task');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledTimes(1);
  });

  it('launchSession skips if lock cannot be acquired', async () => {
    const deps = createMockDeps(wsDir);
    deps.locks.acquire.mockReturnValue(false);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');

    expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
  });

  it('generates instruction files with event context', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task', { source: 'gmail', content: 'Facture mars' });

    const claudeMd = fs.readFileSync(path.join(wsDir, 'test-task', 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Test Task');
    expect(claudeMd).toContain('Facture mars');
    expect(claudeMd).toContain('gmail');

    // generateTaskInstructions also writes INSTRUCTIONS.md as source of truth
    const instructionsMd = fs.readFileSync(path.join(wsDir, 'test-task', 'INSTRUCTIONS.md'), 'utf-8');
    expect(instructionsMd).toContain('Test Task');
    expect(instructionsMd).toContain('Facture mars');
  });

  it('uses default instruction when no event provided', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
      'opentidy-test-task',
      expect.stringContaining('claude'),
    );
    expect(deps.adapter.buildArgs).toHaveBeenCalledWith(
      expect.objectContaining({ allowedTools: ['tool1', 'tool2'] }),
    );
  });

  it('resumes with --resume when adapter.readSessionId returns a session ID', async () => {
    const deps = createMockDeps(wsDir);
    deps.adapter.readSessionId.mockReturnValue('session-abc-123');
    deps.adapter.buildArgs.mockImplementation((opts: { resumeSessionId?: string }) => {
      const args = ['--allowedTools', 'tool1,tool2'];
      if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
      return args;
    });
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
      'opentidy-test-task',
      expect.stringContaining('--resume session-abc-123'),
    );
  });

  it('sendMessage sends keys to tmux session', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    await launcher.sendMessage('test-task', 'Nouvel email de X');

    expect(deps.tmuxExecutor.sendKeys).toHaveBeenCalledWith(
      'opentidy-test-task',
      'Nouvel email de X\n',
    );
  });

  it('sendMessage sets status to active and emits SSE', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    deps.sse.emit.mockClear();
    await launcher.sendMessage('test-task', 'Hello');

    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session:active' }),
    );
  });

  it('sendMessage is a no-op when no active session', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.sendMessage('nonexistent', 'Hello');

    expect(deps.tmuxExecutor.sendKeys).not.toHaveBeenCalled();
  });

  it('markWaiting sets session status to idle and reads waitingType from state.md', async () => {
    // Write state.md with ATTENTE: TIERS
    fs.writeFileSync(
      path.join(wsDir, 'test-task', 'state.md'),
      '# Test Task\nSTATUT : EN COURS\n## Objectif\nDo something\n\n## En attente\nATTENTE: TIERS\nWaiting for email\n',
    );
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    launcher.markWaiting('test-task');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].status).toBe('idle');
    expect(sessions[0].waitingType).toBe('tiers');
  });

  it('markWaiting defaults waitingType to user when no tag in state.md', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    launcher.markWaiting('test-task');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].waitingType).toBe('user');
  });

  it('markWaiting emits session:idle SSE with waitingType', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    deps.sse.emit.mockClear();
    launcher.markWaiting('test-task');

    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session:idle',
        data: expect.objectContaining({ taskId: 'test-task', waitingType: 'user' }),
      }),
    );
  });

  it('setSessionWaitingType updates in-memory session and emits SSE', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    deps.sse.emit.mockClear();
    launcher.setSessionWaitingType('test-task', 'tiers');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].waitingType).toBe('tiers');
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session:idle',
        data: expect.objectContaining({ taskId: 'test-task', waitingType: 'tiers' }),
      }),
    );
  });

  it('handleSessionEnd cleans up session', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    launcher.handleSessionEnd('test-task');

    expect(deps.locks.release).toHaveBeenCalledWith('test-task');
    expect(deps.terminal.killTtyd).toHaveBeenCalledWith('opentidy-test-task');
    expect(launcher.listActiveSessions()).toHaveLength(0);
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session:ended' }),
    );
  });

  it('archiveSession kills tmux and ttyd', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    await launcher.archiveSession('test-task');

    expect(deps.tmuxExecutor.killSession).toHaveBeenCalledWith('opentidy-test-task');
    expect(deps.terminal.killTtyd).toHaveBeenCalledWith('opentidy-test-task');
    expect(deps.locks.release).toHaveBeenCalledWith('test-task');
    expect(launcher.listActiveSessions()).toHaveLength(0);
  });

  it('listActiveSessions returns tracked sessions', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');

    const sessions = launcher.listActiveSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].taskId).toBe('test-task');
    expect(sessions[0].status).toBe('active');
  });

  it('launches parallel sessions on different tasks', async () => {
    const dir2 = path.join(wsDir, 'other-task');
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir2, 'state.md'), '# Other\nSTATUT : EN COURS');

    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');
    await launcher.launchSession('other-task');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledTimes(2);
    expect(launcher.listActiveSessions()).toHaveLength(2);
  });

  it('notifyStarted is called on launch', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-task');

    expect(deps.notify.notifyStarted).toHaveBeenCalledWith('test-task');
  });

  it('releases lock on launch failure', async () => {
    const deps = createMockDeps(wsDir);
    deps.tmuxExecutor.launchTmux.mockRejectedValue(new Error('tmux failed'));
    const launcher = createLauncher(deps);

    await expect(launcher.launchSession('test-task')).rejects.toThrow('tmux failed');
    expect(deps.locks.release).toHaveBeenCalledWith('test-task');
  });

  describe('recover', () => {
    it('reconciles existing tmux sessions', async () => {
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([
        'opentidy-test-task',
        'opentidy-other-task',
        'unrelated-session',
      ]);
      // Create other-task dir so it passes existsSync check
      fs.mkdirSync(path.join(wsDir, 'other-task'), { recursive: true });

      const launcher = createLauncher(deps);
      await launcher.recover();

      const sessions = launcher.listActiveSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.taskId).sort()).toEqual(['other-task', 'test-task']);
    });

    it('skips tmux sessions without matching task directory', async () => {
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue(['opentidy-nonexistent']);
      deps.workspace.listTaskIds.mockReturnValue([]); // No workspace tasks for this test
      const launcher = createLauncher(deps);

      await launcher.recover();

      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('starts ttyd for recovered sessions', async () => {
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue(['opentidy-test-task']);
      const launcher = createLauncher(deps);

      await launcher.recover();

      expect(deps.terminal.ensureReady).toHaveBeenCalledWith('opentidy-test-task');
    });

    it('calls cleanupStaleLocks', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.recover();

      expect(deps.locks.cleanupStaleLocks).toHaveBeenCalled();
    });

    // --- Pass 2: orphaned IN_PROGRESS tasks ---

    it('Pass 2: relaunches orphaned IN_PROGRESS tasks', async () => {
      const deps = createMockDeps(wsDir);
      // No surviving tmux sessions
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listTaskIds.mockReturnValue(['test-task']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      // Should have launched a session for the orphaned task
      expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
        'opentidy-test-task',
        expect.stringContaining('claude'),
      );
      expect(launcher.listActiveSessions()).toHaveLength(1);
      expect(launcher.listActiveSessions()[0].taskId).toBe('test-task');
    });

    it('Pass 2: skips COMPLETED tasks', async () => {
      fs.writeFileSync(
        path.join(wsDir, 'test-task', 'state.md'),
        '# Test Task\nSTATUS: COMPLETED\n## Objective\nDone',
      );
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listTaskIds.mockReturnValue(['test-task']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('Pass 2: skips tasks with ## Waiting section', async () => {
      fs.writeFileSync(
        path.join(wsDir, 'test-task', 'state.md'),
        '# Test Task\nSTATUS: IN_PROGRESS\n## Objective\nDo something\n\n## Waiting\nATTENTE: TIERS\nWaiting for email response\n',
      );
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listTaskIds.mockReturnValue(['test-task']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('Pass 2: skips tasks with .user-stopped marker', async () => {
      fs.writeFileSync(
        path.join(wsDir, 'test-task', '.user-stopped'),
        new Date().toISOString(),
      );
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listTaskIds.mockReturnValue(['test-task']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('Pass 2: skips tasks already recovered in Pass 1', async () => {
      const deps = createMockDeps(wsDir);
      // test-task has a surviving tmux session (Pass 1)
      deps.tmuxExecutor.listSessions.mockResolvedValue(['opentidy-test-task']);
      deps.workspace.listTaskIds.mockReturnValue(['test-task']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      // Pass 1 recovers it — Pass 2 should NOT try to relaunch
      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(1);
    });

    it('Pass 2: continues on individual relaunch failure', async () => {
      // Create two orphaned tasks
      const dir2 = path.join(wsDir, 'task-b');
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir2, 'state.md'), '# Task B\nSTATUS: IN_PROGRESS\n## Objective\nDo B');

      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listTaskIds.mockReturnValue(['test-task', 'task-b']);
      deps.workspace.getTask.mockImplementation((id: string) => ({
        id, title: id, objective: 'Obj', status: 'IN_PROGRESS',
      }));

      // First launch fails, second succeeds
      deps.tmuxExecutor.launchTmux
        .mockRejectedValueOnce(new Error('tmux failed'))
        .mockResolvedValueOnce(99999);
      // listSessions called by error recovery path in launchSession
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);

      const launcher = createLauncher(deps);
      await launcher.recover();

      // task-b should still have been launched despite test-task failure
      expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledTimes(2);
      expect(launcher.listActiveSessions()).toHaveLength(1);
      expect(launcher.listActiveSessions()[0].taskId).toBe('task-b');
    });
  });

  describe('.user-stopped marker', () => {
    it('handleSessionEnd writes .user-stopped when task is IN_PROGRESS', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-task');
      launcher.handleSessionEnd('test-task');

      expect(fs.existsSync(path.join(wsDir, 'test-task', '.user-stopped'))).toBe(true);
    });

    it('handleSessionEnd does NOT write .user-stopped when task is COMPLETED', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-task');
      // Simulate agent completing: set status to COMPLETED
      fs.writeFileSync(
        path.join(wsDir, 'test-task', 'state.md'),
        '# Test Task\nSTATUS: COMPLETED\n## Objective\nDone',
      );
      launcher.handleSessionEnd('test-task');

      expect(fs.existsSync(path.join(wsDir, 'test-task', '.user-stopped'))).toBe(false);
    });

    it('handleSessionEnd does NOT write .user-stopped when task has ## Waiting', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-task');
      fs.writeFileSync(
        path.join(wsDir, 'test-task', 'state.md'),
        '# Test Task\nSTATUS: IN_PROGRESS\n## Objective\nDo something\n\n## Waiting\nATTENTE: TIERS\nWaiting for reply\n',
      );
      launcher.handleSessionEnd('test-task');

      expect(fs.existsSync(path.join(wsDir, 'test-task', '.user-stopped'))).toBe(false);
    });

    it('launchSession removes .user-stopped marker', async () => {
      // Pre-create .user-stopped marker
      fs.writeFileSync(path.join(wsDir, 'test-task', '.user-stopped'), new Date().toISOString());

      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-task');

      expect(fs.existsSync(path.join(wsDir, 'test-task', '.user-stopped'))).toBe(false);
    });
  });
});