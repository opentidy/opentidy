// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Session } from '@opentidy/shared';
import { setStatus, parseStateMd } from '../dossiers/state.js';
import { generateDossierClaudeMd } from './claude-md.js';
import { createPostSessionHandlers } from './post-session.js';

// Interface for mocking tmux/claude in tests
export interface SessionExecutor {
  launchTmux(name: string, command: string): Promise<number>; // returns PID
  sendKeys(name: string, keys: string): Promise<void>;
  capturePane(name: string): Promise<string>;
  killSession(name: string): Promise<void>;
  listSessions(): Promise<string[]>;
}

interface LockManager {
  acquire(dossierId: string): boolean;
  release(dossierId: string): void;
  isLocked?(dossierId: string): boolean;
  cleanupStaleLocks?(): string[];
}

interface WorkspaceManager {
  getDossier(id: string): { id: string; title: string; objective: string; status: string; confirm?: boolean };
  listDossierIds(): string[];
  dir: string;
}

interface Notifier {
  notifyStarted?(dossierId: string): void;
  notifyCompleted(dossierId: string): void;
}

interface SSEEmitter {
  emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
}

export function createLauncher(deps: {
  tmuxExecutor: SessionExecutor;
  locks: LockManager;
  workspace: WorkspaceManager;
  notify: Notifier;
  sse: SSEEmitter;
  workspaceDir: string;
  terminal: { ensureReady: (name: string) => Promise<number | undefined>; killTtyd: (name: string) => void };
}) {
  const sessions = new Map<string, Session>();

  // Post-session cleanup handlers (extracted module)
  const { handleSessionEnd, archiveSession } = createPostSessionHandlers(
    { tmuxExecutor: deps.tmuxExecutor, locks: deps.locks, sse: deps.sse, terminal: deps.terminal },
    sessions,
  );

  async function launchSession(dossierId: string, event?: { source: string; content: string }): Promise<void> {
    if (sessions.has(dossierId)) {
      console.log(`[launcher] ${dossierId} already has active session, skipping`);
      return;
    }

    if (!deps.locks.acquire(dossierId)) {
      console.log(`[launcher] ${dossierId} already locked, skipping`);
      return;
    }

    try {
      const dossierDir = path.join(deps.workspaceDir, dossierId);
      const sessionName = `opentidy-${dossierId}`;

      // Ensure dossier is marked IN_PROGRESS (may have been COMPLETED)
      setStatus(dossierDir, 'IN_PROGRESS');

      // Generate dossier CLAUDE.md (level 2 context)
      const dossierInfo = deps.workspace.getDossier(dossierId);
      generateDossierClaudeMd(deps.workspaceDir, dossierId, dossierInfo, event);

      // Build claude command
      const resumeId = readSessionId(dossierDir);
      const claudeCmd = buildClaudeCommand(deps.workspaceDir, dossierDir, event?.content, resumeId);

      // Launch tmux session (or recover existing one)
      let pid: number;
      console.log(`[launcher] launching tmux session ${sessionName}`);
      try {
        pid = await deps.tmuxExecutor.launchTmux(sessionName, claudeCmd);
      } catch (err) {
        // Session already exists (e.g. survived a backend restart) — recover it
        const existing = await deps.tmuxExecutor.listSessions();
        if (existing.includes(sessionName)) {
          console.log(`[launcher] ${sessionName} already exists in tmux, recovering`);
          pid = 0;
        } else {
          throw err;
        }
      }

      // Start ttyd for web access
      await deps.terminal.ensureReady(sessionName);

      // Track session
      const session: Session = {
        id: sessionName,
        dossierId,
        status: 'active',
        startedAt: new Date().toISOString(),
        claudeSessionId: resumeId,
        pid,
      };
      sessions.set(dossierId, session);

      deps.sse.emit({ type: 'session:started', data: { dossierId }, timestamp: new Date().toISOString() });
      deps.notify.notifyStarted?.(dossierId);
      console.log(`[launcher] ${dossierId} session started (pid: ${pid})`);
    } catch (err) {
      console.error(`[launcher] ${dossierId}: launchSession failed, releasing lock:`, err);
      deps.locks.release(dossierId);
      throw err;
    }
  }

  async function sendMessage(dossierId: string, message: string): Promise<void> {
    const session = sessions.get(dossierId);
    if (!session) {
      console.warn(`[launcher] sendMessage: no active session for ${dossierId}`);
      return;
    }
    await deps.tmuxExecutor.sendKeys(`opentidy-${dossierId}`, message + '\n');
    session.status = 'active';
    deps.sse.emit({ type: 'session:active', data: { dossierId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] sent message to ${dossierId}`);
  }

  function markWaiting(dossierId: string): void {
    const session = sessions.get(dossierId);
    if (!session) return;
    session.status = 'idle';
    // Determine waiting type from state.md
    const dossierDir = path.join(deps.workspaceDir, dossierId);
    const state = parseStateMd(dossierDir);
    session.waitingType = state.waitingType ?? 'user';
    deps.sse.emit({ type: 'session:idle', data: { dossierId, waitingType: session.waitingType }, timestamp: new Date().toISOString() });
  }

  function setSessionWaitingType(dossierId: string, type: 'user' | 'tiers'): void {
    const session = sessions.get(dossierId);
    if (!session) return;
    session.waitingType = type;
    deps.sse.emit({ type: 'session:idle', data: { dossierId, waitingType: type }, timestamp: new Date().toISOString() });
  }

  function listActiveSessions(): Session[] {
    return Array.from(sessions.values());
  }

  async function recover(): Promise<void> {
    const activeTmux = await deps.tmuxExecutor.listSessions();
    for (const name of activeTmux.filter((s) => s.startsWith('opentidy-'))) {
      const dossierId = name.replace('opentidy-', '');
      const dossierDir = path.join(deps.workspaceDir, dossierId);
      if (!fs.existsSync(dossierDir)) continue;
      if (!deps.locks.acquire(dossierId)) continue;

      sessions.set(dossierId, {
        id: name,
        dossierId,
        status: 'active',
        startedAt: new Date().toISOString(),
      });

      // Ensure ttyd is running for recovered sessions
      await deps.terminal.ensureReady(name);
      console.log(`[launcher] recovered session: ${dossierId}`);
    }

    if (deps.locks.cleanupStaleLocks) {
      deps.locks.cleanupStaleLocks();
    }
    console.log(`[launcher] recovery complete: ${sessions.size} sessions active`);
  }

  // --- Private helpers ---

  function readSessionId(dossierDir: string): string | undefined {
    const sessionIdFile = path.join(dossierDir, '.session-id');
    try {
      return fs.readFileSync(sessionIdFile, 'utf-8').trim() || undefined;
    } catch {
      return undefined;
    }
  }

  function buildClaudeCommand(workspaceDir: string, dossierDir: string, instruction?: string, resumeId?: string): string {
    const pluginDir = path.resolve(workspaceDir, '..', 'plugins', 'opentidy-hooks');
    const pluginFlag = fs.existsSync(pluginDir) ? ` --plugin-dir ${pluginDir}` : '';
    const resumeFlag = resumeId ? ` --resume ${resumeId}` : '';
    // --strict-mcp-config prevents cloud MCP servers from claude.ai account
    const mcpFlag = " --strict-mcp-config --mcp-config '{}'";
    if (instruction) {
      const escapedInstruction = instruction.replace(/'/g, "'\\''");
      return `cd ${dossierDir} && claude --dangerously-skip-permissions${mcpFlag}${pluginFlag}${resumeFlag} '${escapedInstruction}'`;
    }
    // No instruction — open interactive Claude, waiting for user input
    return `cd ${dossierDir} && claude --dangerously-skip-permissions${mcpFlag}${pluginFlag}${resumeFlag}`;
  }

  return {
    launchSession,
    sendMessage,
    markWaiting,
    setSessionWaitingType,
    handleSessionEnd,
    archiveSession,
    listActiveSessions,
    recover,
  };
}
