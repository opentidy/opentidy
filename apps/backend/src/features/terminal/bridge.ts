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
    if (process.platform === 'win32') return; // pkill not available on Windows
    try {
      execFileSync('pkill', ['-f', '^ttyd.*tmux attach-session'], { stdio: 'ignore' });
      console.log('[terminal] Cleaned up orphan ttyd processes');
    } catch {
      // No ttyd processes to kill — that's fine
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

  // Clean up any orphan ttyd from previous runs on startup
  cleanupOrphanTtyd();

  return {
    ensureReady: async (sessionName: string): Promise<number | undefined> => {
      if (!deps.listSessions().includes(sessionName)) return undefined;
      return ensureTtyd(sessionName);
    },
    getPort: (sessionName: string) => getPort(sessionName),
    killTtyd,
    runCommand,
  };
}
