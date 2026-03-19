// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

export const ALLOWED_COMMANDS = [
  'claude auth login',
  'claude auth status',
  'gemini auth login',
  'copilot auth login',
  'wacli auth',
  'wacli doctor',
  'cloudflared tunnel login',
  'cloudflared tunnel create',
  'cloudflared tunnel route',
  'cloudflared service install',
  'pipx install camoufox',
  'pip3 install camoufox',
];

export function createPtyManager() {
  const sessions = new Map<string, IPty>();

  function validateCommand(command: string): void {
    const allowed = ALLOWED_COMMANDS.some((prefix) => command === prefix || command.startsWith(prefix + ' '));
    if (!allowed) {
      throw new Error(`Command not allowed: "${command}" is not allowed`);
    }
  }

  function spawn(id: string, command: string): IPty {
    validateCommand(command);
    console.log(`[pty] spawning session ${id}: ${command}`);
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const process_ = pty.spawn(shell, ['-c', command], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME ?? '/tmp',
      env: process.env as Record<string, string>,
    });
    sessions.set(id, process_);
    process_.onExit(() => {
      console.log(`[pty] session ${id} exited`);
      sessions.delete(id);
    });
    return process_;
  }

  function kill(id: string): void {
    const session = sessions.get(id);
    if (session) {
      console.log(`[pty] killing session ${id}`);
      session.kill();
      sessions.delete(id);
    }
  }

  function killAll(): void {
    console.log(`[pty] killing all ${sessions.size} session(s)`);
    for (const [id, session] of sessions) {
      session.kill();
      sessions.delete(id);
    }
  }

  function activeSessions(): number {
    return sessions.size;
  }

  return { validateCommand, spawn, kill, killAll, activeSessions };
}

export type PtyManager = ReturnType<typeof createPtyManager>;
