// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { SessionExecutor } from './launch.js';

const execFile = promisify(execFileCb);

/**
 * Recursively kill all descendant processes of a given PID.
 * Kills children first (bottom-up) to avoid orphan reparenting races.
 */
export async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32' || !pid || pid <= 1) return;

  // Find direct children
  let childPids: number[] = [];
  try {
    const { stdout } = await execFile('pgrep', ['-P', String(pid)]);
    childPids = stdout.trim().split('\n').filter(Boolean).map(Number).filter(n => n > 1);
  } catch {
    // No children or pgrep failed
  }

  // Kill children recursively first
  for (const childPid of childPids) {
    await killProcessTree(childPid);
  }

  // Then kill this process
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already dead
  }
}

export function createTmuxExecutor(): SessionExecutor {
  async function launchTmux(name: string, command: string): Promise<number> {
    console.log(`[tmux] new-session -d -s ${name}`);
    try {
      await execFile('tmux', ['new-session', '-d', '-s', name, command]);
    } catch (err) {
      console.error(`[tmux] FAILED to create session ${name}:`, (err as Error).message);
      throw err;
    }
    const { stdout } = await execFile('tmux', ['list-panes', '-t', name, '-F', '#{pane_pid}']);
    console.log(`[tmux] session ${name} created (pid: ${stdout.trim()})`);
    return parseInt(stdout.trim(), 10);
  }

  async function sendKeys(name: string, keys: string): Promise<void> {
    await execFile('tmux', ['send-keys', '-t', name, keys, 'Enter']);
  }

  async function capturePane(name: string): Promise<string> {
    const { stdout } = await execFile('tmux', ['capture-pane', '-t', name, '-p', '-S', '-100']);
    return stdout;
  }

  async function killSession(name: string): Promise<void> {
    // Kill all processes in every pane before destroying the session.
    // tmux kill-session sends SIGHUP, but Claude Code and its MCP children
    // may survive it. Explicitly killing the process tree prevents orphans.
    try {
      const { stdout } = await execFile('tmux', ['list-panes', '-t', name, '-F', '#{pane_pid}']);
      const panePids = stdout.trim().split('\n').filter(Boolean).map(Number).filter(n => n > 1);
      for (const panePid of panePids) {
        await killProcessTree(panePid);
      }
    } catch {
      // Session may already be gone
    }

    try {
      await execFile('tmux', ['kill-session', '-t', name]);
    } catch {
      // Session may already be dead
    }
  }

  async function listSessions(): Promise<string[]> {
    try {
      const { stdout } = await execFile('tmux', ['list-sessions', '-F', '#{session_name}']);
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return []; // tmux server not running
    }
  }

  return { launchTmux, sendKeys, capturePane, killSession, listSessions };
}