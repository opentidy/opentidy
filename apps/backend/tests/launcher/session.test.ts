// tests/launcher/session.test.ts — tmux-only launcher
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLauncher } from '../../src/launcher/session.js';
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
        status: 'EN COURS',
      }),
      listDossierIds: vi.fn().mockReturnValue([]),
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

  it('generates CLAUDE.md with event context', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier', { source: 'gmail', content: 'Facture mars' });

    const claudeMd = fs.readFileSync(path.join(wsDir, 'test-dossier', 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Test Dossier');
    expect(claudeMd).toContain('Facture mars');
    expect(claudeMd).toContain('gmail');
  });

  it('generates CLAUDE.md with confirm instructions when dossier has confirm mode', async () => {
    const deps = createMockDeps(wsDir);
    deps.workspace.getDossier.mockReturnValue({
      id: 'test-dossier',
      title: 'Test',
      objective: 'Obj',
      status: 'EN COURS',
      confirm: true,
    });
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');

    const claudeMd = fs.readFileSync(path.join(wsDir, 'test-dossier', 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Mode Validation');
    expect(claudeMd).toContain('confirmation');
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

  it('resumes with --resume when .session-id exists', async () => {
    fs.writeFileSync(path.join(wsDir, 'test-dossier', '.session-id'), 'session-abc-123');
    const deps = createMockDeps(wsDir);
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

  it('markWaiting defaults waitingType to lolo when no tag in state.md', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    launcher.markWaiting('test-dossier');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].waitingType).toBe('lolo');
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
        data: expect.objectContaining({ dossierId: 'test-dossier', waitingType: 'lolo' }),
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

  it('terminateSession delegates to archiveSession', async () => {
    const deps = createMockDeps(wsDir);
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.terminateSession('test-dossier');

    expect(deps.tmuxExecutor.killSession).toHaveBeenCalledWith('opentidy-test-dossier');
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
  });
});
