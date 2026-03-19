// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { SessionExecutor } from './launch.js';

const execFile = promisify(execFileCb);

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