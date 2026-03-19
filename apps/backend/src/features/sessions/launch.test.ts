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
      getDossier: vi.fn().mockReturnValue({
        id: 'test-dossier',
        title: 'Test Dossier',
        objective: 'Do something',
        status: 'IN_PROGRESS',
      }),
      listDossierIds: vi.fn().mockReturnValue(['test-dossier']),
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
      buildArgs: vi.fn().mockReturnValue(['--dangerously-skip-permissions']),
      getEnv: () => ({}),
      readSessionId: vi.fn().mockReturnValue(null),
      writeConfig: () => {},
    },
    recoveryDelayMs: 0, // No delay in tests
  };
}

describe('createLauncher (tmux-only)', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    // Create a dossier directory with state.md
    const dossierDir = path.join(wsDir, 'test-dossier');
    fs.mkdirSync(dossierDir, { recursive: true });
    fs.writeFileSync(
      path.join(dossierDir, 'state.md'),
      '# Test Dossier\nSTATUT : EN COURS\n## Objectif\nDo something',
    );
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('launchSession creates tmux session and starts ttyd', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier', { source: 'app', content: 'Do something' });

    expect(deps.locks.acquire).toHaveBeenCalledWith('test-dossier');
    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
      'opentidy-test-dossier',
      expect.stringContaining('claude'),
    );
    expect(deps.terminal.ensureReady).toHaveBeenCalledWith('opentidy-test-dossier');
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session:started' }),
    );
  });

  it('launchSession skips if session already active', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.launchSession('test-dossier');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledTimes(1);
  });

  it('launchSession skips if lock cannot be acquired', async () => {
    const deps = createMockDeps(wsDir);
    deps.locks.acquire.mockReturnValue(false);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');

    expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
  });

  it('generates instruction files with event context', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier', { source: 'gmail', content: 'Facture mars' });

    const claudeMd = fs.readFileSync(path.join(wsDir, 'test-dossier', 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Test Dossier');
    expect(claudeMd).toContain('Facture mars');
    expect(claudeMd).toContain('gmail');

    // generateDossierInstructions also writes INSTRUCTIONS.md as source of truth
    const instructionsMd = fs.readFileSync(path.join(wsDir, 'test-dossier', 'INSTRUCTIONS.md'), 'utf-8');
    expect(instructionsMd).toContain('Test Dossier');
    expect(instructionsMd).toContain('Facture mars');
  });

  it('generates instruction files with confirm instructions when dossier has confirm mode', async () => {
    const deps = createMockDeps(wsDir);
    deps.workspace.getDossier.mockReturnValue({
      id: 'test-dossier',
      title: 'Test',
      objective: 'Obj',
      status: 'IN_PROGRESS',
      confirm: true,
    });
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');

    const claudeMd = fs.readFileSync(path.join(wsDir, 'test-dossier', 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Confirm Mode');
    expect(claudeMd).toContain('confirmation');

    const instructionsMd = fs.readFileSync(path.join(wsDir, 'test-dossier', 'INSTRUCTIONS.md'), 'utf-8');
    expect(instructionsMd).toContain('Confirm Mode');
  });

  it('uses default instruction when no event provided', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
      'opentidy-test-dossier',
      expect.stringContaining('claude --dangerously-skip-permissions'),
    );
  });

  it('resumes with --resume when adapter.readSessionId returns a session ID', async () => {
    const deps = createMockDeps(wsDir);
    deps.adapter.readSessionId.mockReturnValue('session-abc-123');
    deps.adapter.buildArgs.mockImplementation((opts: { resumeSessionId?: string }) => {
      const args = ['--dangerously-skip-permissions'];
      if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
      return args;
    });
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
      'opentidy-test-dossier',
      expect.stringContaining('--resume session-abc-123'),
    );
  });

  it('sendMessage sends keys to tmux session', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.sendMessage('test-dossier', 'Nouvel email de X');

    expect(deps.tmuxExecutor.sendKeys).toHaveBeenCalledWith(
      'opentidy-test-dossier',
      'Nouvel email de X\n',
    );
  });

  it('sendMessage sets status to active and emits SSE', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    deps.sse.emit.mockClear();
    await launcher.sendMessage('test-dossier', 'Hello');

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
      path.join(wsDir, 'test-dossier', 'state.md'),
      '# Test Dossier\nSTATUT : EN COURS\n## Objectif\nDo something\n\n## En attente\nATTENTE: TIERS\nWaiting for email\n',
    );
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    launcher.markWaiting('test-dossier');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].status).toBe('idle');
    expect(sessions[0].waitingType).toBe('tiers');
  });

  it('markWaiting defaults waitingType to user when no tag in state.md', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    launcher.markWaiting('test-dossier');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].waitingType).toBe('user');
  });

  it('markWaiting emits session:idle SSE with waitingType', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    deps.sse.emit.mockClear();
    launcher.markWaiting('test-dossier');

    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session:idle',
        data: expect.objectContaining({ dossierId: 'test-dossier', waitingType: 'user' }),
      }),
    );
  });

  it('setSessionWaitingType updates in-memory session and emits SSE', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    deps.sse.emit.mockClear();
    launcher.setSessionWaitingType('test-dossier', 'tiers');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].waitingType).toBe('tiers');
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session:idle',
        data: expect.objectContaining({ dossierId: 'test-dossier', waitingType: 'tiers' }),
      }),
    );
  });

  it('handleSessionEnd cleans up session', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    launcher.handleSessionEnd('test-dossier');

    expect(deps.locks.release).toHaveBeenCalledWith('test-dossier');
    expect(deps.terminal.killTtyd).toHaveBeenCalledWith('opentidy-test-dossier');
    expect(launcher.listActiveSessions()).toHaveLength(0);
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session:ended' }),
    );
  });

  it('archiveSession kills tmux and ttyd', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.archiveSession('test-dossier');

    expect(deps.tmuxExecutor.killSession).toHaveBeenCalledWith('opentidy-test-dossier');
    expect(deps.terminal.killTtyd).toHaveBeenCalledWith('opentidy-test-dossier');
    expect(deps.locks.release).toHaveBeenCalledWith('test-dossier');
    expect(launcher.listActiveSessions()).toHaveLength(0);
  });

  it('listActiveSessions returns tracked sessions', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');

    const sessions = launcher.listActiveSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].dossierId).toBe('test-dossier');
    expect(sessions[0].status).toBe('active');
  });

  it('launches parallel sessions on different dossiers', async () => {
    const dir2 = path.join(wsDir, 'other-dossier');
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir2, 'state.md'), '# Other\nSTATUT : EN COURS');

    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.launchSession('other-dossier');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledTimes(2);
    expect(launcher.listActiveSessions()).toHaveLength(2);
  });

  it('notifyStarted is called on launch', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');

    expect(deps.notify.notifyStarted).toHaveBeenCalledWith('test-dossier');
  });

  it('releases lock on launch failure', async () => {
    const deps = createMockDeps(wsDir);
    deps.tmuxExecutor.launchTmux.mockRejectedValue(new Error('tmux failed'));
    const launcher = createLauncher(deps);

    await expect(launcher.launchSession('test-dossier')).rejects.toThrow('tmux failed');
    expect(deps.locks.release).toHaveBeenCalledWith('test-dossier');
  });

  describe('recover', () => {
    it('reconciles existing tmux sessions', async () => {
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([
        'opentidy-test-dossier',
        'opentidy-other-dossier',
        'unrelated-session',
      ]);
      // Create other-dossier dir so it passes existsSync check
      fs.mkdirSync(path.join(wsDir, 'other-dossier'), { recursive: true });

      const launcher = createLauncher(deps);
      await launcher.recover();

      const sessions = launcher.listActiveSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.dossierId).sort()).toEqual(['other-dossier', 'test-dossier']);
    });

    it('skips tmux sessions without matching dossier directory', async () => {
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue(['opentidy-nonexistent']);
      deps.workspace.listDossierIds.mockReturnValue([]); // No workspace dossiers for this test
      const launcher = createLauncher(deps);

      await launcher.recover();

      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('starts ttyd for recovered sessions', async () => {
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue(['opentidy-test-dossier']);
      const launcher = createLauncher(deps);

      await launcher.recover();

      expect(deps.terminal.ensureReady).toHaveBeenCalledWith('opentidy-test-dossier');
    });

    it('calls cleanupStaleLocks', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.recover();

      expect(deps.locks.cleanupStaleLocks).toHaveBeenCalled();
    });

    // --- Pass 2: orphaned IN_PROGRESS dossiers ---

    it('Pass 2: relaunches orphaned IN_PROGRESS dossiers', async () => {
      const deps = createMockDeps(wsDir);
      // No surviving tmux sessions
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listDossierIds.mockReturnValue(['test-dossier']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      // Should have launched a session for the orphaned dossier
      expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
        'opentidy-test-dossier',
        expect.stringContaining('claude'),
      );
      expect(launcher.listActiveSessions()).toHaveLength(1);
      expect(launcher.listActiveSessions()[0].dossierId).toBe('test-dossier');
    });

    it('Pass 2: skips COMPLETED dossiers', async () => {
      fs.writeFileSync(
        path.join(wsDir, 'test-dossier', 'state.md'),
        '# Test Dossier\nSTATUS: COMPLETED\n## Objective\nDone',
      );
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listDossierIds.mockReturnValue(['test-dossier']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('Pass 2: skips dossiers with ## Waiting section', async () => {
      fs.writeFileSync(
        path.join(wsDir, 'test-dossier', 'state.md'),
        '# Test Dossier\nSTATUS: IN_PROGRESS\n## Objective\nDo something\n\n## Waiting\nATTENTE: TIERS\nWaiting for email response\n',
      );
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listDossierIds.mockReturnValue(['test-dossier']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('Pass 2: skips dossiers with .user-stopped marker', async () => {
      fs.writeFileSync(
        path.join(wsDir, 'test-dossier', '.user-stopped'),
        new Date().toISOString(),
      );
      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listDossierIds.mockReturnValue(['test-dossier']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(0);
    });

    it('Pass 2: skips dossiers already recovered in Pass 1', async () => {
      const deps = createMockDeps(wsDir);
      // test-dossier has a surviving tmux session (Pass 1)
      deps.tmuxExecutor.listSessions.mockResolvedValue(['opentidy-test-dossier']);
      deps.workspace.listDossierIds.mockReturnValue(['test-dossier']);

      const launcher = createLauncher(deps);
      await launcher.recover();

      // Pass 1 recovers it — Pass 2 should NOT try to relaunch
      expect(deps.tmuxExecutor.launchTmux).not.toHaveBeenCalled();
      expect(launcher.listActiveSessions()).toHaveLength(1);
    });

    it('Pass 2: continues on individual relaunch failure', async () => {
      // Create two orphaned dossiers
      const dir2 = path.join(wsDir, 'dossier-b');
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir2, 'state.md'), '# Dossier B\nSTATUS: IN_PROGRESS\n## Objective\nDo B');

      const deps = createMockDeps(wsDir);
      deps.tmuxExecutor.listSessions.mockResolvedValue([]);
      deps.workspace.listDossierIds.mockReturnValue(['test-dossier', 'dossier-b']);
      deps.workspace.getDossier.mockImplementation((id: string) => ({
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

      // dossier-b should still have been launched despite test-dossier failure
      expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledTimes(2);
      expect(launcher.listActiveSessions()).toHaveLength(1);
      expect(launcher.listActiveSessions()[0].dossierId).toBe('dossier-b');
    });
  });

  describe('.user-stopped marker', () => {
    it('handleSessionEnd writes .user-stopped when dossier is IN_PROGRESS', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-dossier');
      launcher.handleSessionEnd('test-dossier');

      expect(fs.existsSync(path.join(wsDir, 'test-dossier', '.user-stopped'))).toBe(true);
    });

    it('handleSessionEnd does NOT write .user-stopped when dossier is COMPLETED', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-dossier');
      // Simulate agent completing: set status to COMPLETED
      fs.writeFileSync(
        path.join(wsDir, 'test-dossier', 'state.md'),
        '# Test Dossier\nSTATUS: COMPLETED\n## Objective\nDone',
      );
      launcher.handleSessionEnd('test-dossier');

      expect(fs.existsSync(path.join(wsDir, 'test-dossier', '.user-stopped'))).toBe(false);
    });

    it('handleSessionEnd does NOT write .user-stopped when dossier has ## Waiting', async () => {
      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-dossier');
      fs.writeFileSync(
        path.join(wsDir, 'test-dossier', 'state.md'),
        '# Test Dossier\nSTATUS: IN_PROGRESS\n## Objective\nDo something\n\n## Waiting\nATTENTE: TIERS\nWaiting for reply\n',
      );
      launcher.handleSessionEnd('test-dossier');

      expect(fs.existsSync(path.join(wsDir, 'test-dossier', '.user-stopped'))).toBe(false);
    });

    it('launchSession removes .user-stopped marker', async () => {
      // Pre-create .user-stopped marker
      fs.writeFileSync(path.join(wsDir, 'test-dossier', '.user-stopped'), new Date().toISOString());

      const deps = createMockDeps(wsDir);
      const launcher = createLauncher(deps);

      await launcher.launchSession('test-dossier');

      expect(fs.existsSync(path.join(wsDir, 'test-dossier', '.user-stopped'))).toBe(false);
    });
  });
});