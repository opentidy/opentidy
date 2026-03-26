// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { spawn, execFile as execFileCb, execFileSync, type ChildProcess } from 'child_process';
import { createConnection } from 'net';
import { promisify } from 'util';
import { getClipboardCopyCommand } from '../../shared/platform/clipboard.js';

const execFile = promisify(execFileCb);

export interface TerminalBridgeDeps {
  listSessions: () => string[];
}

export function createTerminalManager(deps: TerminalBridgeDeps) {
  // Track ttyd instances per session — encapsulated within the factory
  const ttydInstances = new Map<string, { process: ChildProcess; port: number }>();
  let nextPort = 8200;

  function findAvailablePort(): number {
    const port = nextPort;
    nextPort++;
    if (nextPort > 8299) nextPort = 8200;
    return port;
  }

  // Kill all orphan ttyd processes from previous backend runs
  function cleanupOrphanTtyd(): void {
    if (process.platform === 'win32') return;
    try {
      execFileSync('pkill', ['-f', '^ttyd.*tmux attach-session'], { stdio: 'ignore' });
      console.log('[terminal] Cleaned up orphan ttyd processes');
    } catch {
      // No ttyd processes to kill — that's fine
    }
  }

  // Kill dead setup sessions and their orphaned process trees.
  // Setup sessions use remain-on-exit so the web UI can check exit status,
  // but they accumulate if never cleaned up.
  function cleanupOrphanSetupSessions(): void {
    if (process.platform === 'win32') return;
    try {
      const output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf-8' });
      const setupSessions = output.trim().split('\n').filter(s => s.startsWith('opentidy-setup-'));
      let cleaned = 0;
      for (const session of setupSessions) {
        try {
          const status = execFileSync('tmux', ['display-message', '-t', session, '-p', '#{pane_dead}'], { encoding: 'utf-8' });
          if (status.trim() === '1') {
            execFileSync('tmux', ['kill-session', '-t', session], { stdio: 'ignore' });
            cleaned++;
          }
        } catch {
          // Session vanished between list and check
        }
      }
      if (cleaned > 0) {
        console.log(`[terminal] Cleaned up ${cleaned} dead setup session(s)`);
      }
    } catch {
      // No tmux server or no sessions
    }
  }

  // Kill orphaned agent process trees from previous backend runs.
  // When tmux kill-session runs, Claude Code and its MCP children may survive
  // the SIGHUP. These orphans keep running with no tmux session attached.
  // We identify them by the --mcp-config flag pointing to our agent config dir.
  function cleanupOrphanAgentProcesses(): void {
    if (process.platform === 'win32') return;
    try {
      // Find claude processes using OpenTidy's mcp-config (these are ours)
      const output = execFileSync('pgrep', ['-f', 'claude.*--mcp-config.*/opentidy/'], { encoding: 'utf-8' });
      const pids = output.trim().split('\n').filter(Boolean).map(Number).filter(n => n > 1);

      // Get active tmux pane PIDs — these are legitimate running sessions
      let activePanePids = new Set<number>();
      try {
        const panes = execFileSync('tmux', ['list-panes', '-a', '-F', '#{pane_pid}'], { encoding: 'utf-8' });
        activePanePids = new Set(panes.trim().split('\n').filter(Boolean).map(Number));
      } catch {
        // No tmux server
      }

      let cleaned = 0;
      for (const pid of pids) {
        // Check if this process or its parent is in an active tmux pane
        let ppid: number | undefined;
        try {
          ppid = parseInt(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf-8' }).trim(), 10);
        } catch { continue; }

        if (activePanePids.has(pid) || (ppid && activePanePids.has(ppid))) {
          continue; // Still in an active session — don't touch
        }

        // Orphaned: kill the parent shell tree (zsh → claude → MCP children)
        const treePid = ppid && ppid > 1 ? ppid : pid;
        try {
          // Kill children first, then parent
          execFileSync('pkill', ['-TERM', '-P', String(treePid)], { stdio: 'ignore' });
          process.kill(treePid, 'SIGTERM');
          cleaned++;
        } catch {
          // Already dead
        }
      }
      if (cleaned > 0) {
        console.log(`[terminal] Cleaned up ${cleaned} orphaned agent process tree(s)`);
      }
    } catch {
      // No matching processes — normal on fresh start
    }
  }

  function waitForPort(port: number, timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;

      function tryConnect() {
        if (Date.now() > deadline) { resolve(false); return; }
        const sock = createConnection({ port, host: '127.0.0.1' }, () => {
          sock.destroy();
          resolve(true);
        });
        sock.on('error', () => {
          sock.destroy();
          setTimeout(tryConnect, 50);
        });
      }

      tryConnect();
    });
  }

  async function ensureTtyd(sessionName: string): Promise<number> {
    if (process.platform === 'win32') {
      console.warn('[terminal] Interactive mode (tmux/ttyd) not available on Windows');
      return 0;
    }

    const existing = ttydInstances.get(sessionName);
    if (existing && !existing.process.killed) {
      return existing.port;
    }

    // Enable mouse scrolling + copy-to-clipboard
    try {
      await execFile('tmux', ['set-option', '-t', sessionName, 'mouse', 'on']);
      // Copy selection to system clipboard on mouse drag end (global bindings, idempotent)
      const clipCmd = getClipboardCopyCommand();
      await execFile('tmux', ['bind-key', '-T', 'copy-mode', 'MouseDragEnd1Pane',
        'send-keys', '-X', 'copy-pipe-and-cancel', clipCmd]);
      await execFile('tmux', ['bind-key', '-T', 'copy-mode-vi', 'MouseDragEnd1Pane',
        'send-keys', '-X', 'copy-pipe-and-cancel', clipCmd]);
    } catch (err) {
      console.warn(`[terminal] tmux mouse setup failed for ${sessionName}:`, (err as Error).message);
    }

    const port = findAvailablePort();
    console.log(`[terminal] Spawning ttyd on port ${port} for session ${sessionName}`);

    const proc = spawn('ttyd', [
      '--port', String(port),
      '--writable',
      'tmux', 'attach-session', '-t', sessionName,
    ], {
      stdio: 'ignore',
      detached: true,
    });

    proc.unref();

    proc.on('exit', (code) => {
      console.log(`[terminal] ttyd exited for ${sessionName} (code: ${code})`);
      ttydInstances.delete(sessionName);
    });

    ttydInstances.set(sessionName, { process: proc, port });

    const ready = await waitForPort(port);
    if (!ready) {
      console.warn(`[terminal] ttyd on port ${port} not ready after timeout`);
    }

    return port;
  }

  function killTtyd(sessionName: string): void {
    const instance = ttydInstances.get(sessionName);
    if (instance && !instance.process.killed) {
      instance.process.kill();
      console.log(`[terminal] Killed ttyd for ${sessionName}`);
    }
    ttydInstances.delete(sessionName);
  }

  function getPort(sessionName: string): number | undefined {
    const instance = ttydInstances.get(sessionName);
    if (instance && !instance.process.killed) return instance.port;
    return undefined;
  }

  // Run an arbitrary command in a tmux+ttyd session (for module setup)
  async function runCommand(command: string): Promise<{ sessionName: string; port: number }> {
    if (process.platform === 'win32') {
      throw new Error('Interactive terminal not available on Windows');
    }

    const sessionName = `opentidy-setup-${Date.now()}`;
    console.log(`[terminal] Running command in tmux session ${sessionName}: ${command}`);

    // Create tmux session with the command — remain-on-exit keeps it open after the command finishes
    await execFile('tmux', ['new-session', '-d', '-s', sessionName, '-x', '120', '-y', '30', command]);
    await execFile('tmux', ['set-option', '-t', sessionName, 'remain-on-exit', 'on']);

    const port = findAvailablePort();
    console.log(`[terminal] Spawning ttyd on port ${port} for setup session ${sessionName}`);

    const proc = spawn('ttyd', [
      '--port', String(port),
      '--writable',
      'tmux', 'attach-session', '-t', sessionName,
    ], {
      stdio: 'ignore',
      detached: true,
    });

    proc.unref();

    proc.on('exit', (code) => {
      console.log(`[terminal] ttyd exited for setup session ${sessionName} (code: ${code})`);
      ttydInstances.delete(sessionName);
    });

    ttydInstances.set(sessionName, { process: proc, port });

    const ready = await waitForPort(port);
    if (!ready) {
      console.warn(`[terminal] ttyd on port ${port} not ready after timeout`);
    }

    return { sessionName, port };
  }

  // Clean up orphans from previous runs on startup
  cleanupOrphanTtyd();
  cleanupOrphanSetupSessions();
  cleanupOrphanAgentProcesses();

  // Query the exit status of a command running in a tmux session (with remain-on-exit)
  async function getSessionStatus(sessionName: string): Promise<{ running: boolean; exitCode?: number }> {
    try {
      const result = await execFile('tmux', [
        'display-message', '-t', sessionName, '-p', '#{pane_dead} #{pane_dead_status}',
      ]);
      const parts = result.stdout.trim().split(' ');
      if (parts[0] === '1') {
        return { running: false, exitCode: parseInt(parts[1], 10) };
      }
      return { running: true };
    } catch {
      // Session doesn't exist or tmux error — treat as failed
      return { running: false, exitCode: -1 };
    }
  }

  return {
    ensureReady: async (sessionName: string): Promise<number | undefined> => {
      if (!deps.listSessions().includes(sessionName)) return undefined;
      return ensureTtyd(sessionName);
    },
    getPort: (sessionName: string) => getPort(sessionName),
    killTtyd,
    runCommand,
    getSessionStatus,
  };
}
