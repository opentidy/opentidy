// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Session, AgentAdapter } from '@opentidy/shared';
import { setStatus, parseStateMd } from '../dossiers/state.js';
import { generateDossierInstructions } from './instruction-file.js';
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

const USER_STOPPED_MARKER = '.user-stopped';
const DEFAULT_RECOVERY_DELAY_MS = 30_000;

export function createLauncher(deps: {
  tmuxExecutor: SessionExecutor;
  locks: LockManager;
  workspace: WorkspaceManager;
  notify: Notifier;
  sse: SSEEmitter;
  workspaceDir: string;
  terminal: { ensureReady: (name: string) => Promise<number | undefined>; killTtyd: (name: string) => void };
  adapter: AgentAdapter;
  memoryAgents?: {
    isTranscriptSubstantial(transcriptPath: string): boolean;
    runExtraction(input: { transcriptPath: string; indexContent: string; dossierId: string; stateContent: string }): Promise<void>;
  };
  recoveryDelayMs?: number;
}) {
  const sessions = new Map<string, Session>();
  const recoveryDelayMs = deps.recoveryDelayMs ?? DEFAULT_RECOVERY_DELAY_MS;

  // Post-session cleanup handlers (extracted module)
  const { handleSessionEnd: baseHandleSessionEnd, archiveSession } = createPostSessionHandlers(
    { tmuxExecutor: deps.tmuxExecutor, locks: deps.locks, sse: deps.sse, terminal: deps.terminal,
      memoryAgents: deps.memoryAgents, workspaceDir: deps.workspaceDir },
    sessions,
  );

  // Wrap handleSessionEnd to write .user-stopped marker when dossier is still IN_PROGRESS
  function handleSessionEnd(dossierId: string): void {
    const dossierDir = path.join(deps.workspaceDir, dossierId);
    if (fs.existsSync(path.join(dossierDir, 'state.md'))) {
      const state = parseStateMd(dossierDir);
      if (state.status === 'IN_PROGRESS' && !state.waitingFor) {
        fs.writeFileSync(path.join(dossierDir, USER_STOPPED_MARKER), new Date().toISOString());
        console.log(`[launcher] marked ${dossierId} as user-stopped`);
      }
    }
    baseHandleSessionEnd(dossierId);
  }

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

      // Remove .user-stopped marker (explicit launch = user wants to resume)
      const stoppedMarker = path.join(dossierDir, USER_STOPPED_MARKER);
      if (fs.existsSync(stoppedMarker)) fs.unlinkSync(stoppedMarker);

      // Ensure dossier is marked IN_PROGRESS (may have been COMPLETED)
      setStatus(dossierDir, 'IN_PROGRESS');

      // Generate dossier instruction file (level 2 context)
      const dossierInfo = deps.workspace.getDossier(dossierId);
      generateDossierInstructions({
        workspaceDir: deps.workspaceDir, dossierId, dossierInfo,
        instructionFile: deps.adapter.instructionFile, event,
      });

      // Build agent command
      const resumeId = deps.adapter.readSessionId(dossierDir) ?? undefined;
      const agentCmd = buildAgentCommand(deps.workspaceDir, dossierDir, deps.adapter, event?.content, resumeId);

      // Launch tmux session (or recover existing one)
      let pid: number;
      console.log(`[launcher] launching tmux session ${sessionName}`);
      try {
        pid = await deps.tmuxExecutor.launchTmux(sessionName, agentCmd);
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
        agentSessionId: resumeId,
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
    // Pass 1: Reconcile surviving tmux sessions
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
      console.log(`[launcher] recovered tmux session: ${dossierId}`);
    }

    if (deps.locks.cleanupStaleLocks) {
      deps.locks.cleanupStaleLocks();
    }

    // Pass 2: Relaunch orphaned IN_PROGRESS dossiers (no tmux, not waiting, not user-stopped)
    const allDossierIds = deps.workspace.listDossierIds();
    const orphans: string[] = [];

    for (const dossierId of allDossierIds) {
      if (sessions.has(dossierId)) continue;

      const dossierDir = path.join(deps.workspaceDir, dossierId);
      const state = parseStateMd(dossierDir);

      if (state.status !== 'IN_PROGRESS') continue;
      if (state.waitingFor) continue;
      if (fs.existsSync(path.join(dossierDir, USER_STOPPED_MARKER))) continue;

      orphans.push(dossierId);
    }

    if (orphans.length > 0) {
      console.log(`[launcher] found ${orphans.length} orphaned dossier(s), delaying ${recoveryDelayMs / 1000}s before relaunch: ${orphans.join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, recoveryDelayMs));

      for (const dossierId of orphans) {
        try {
          await launchSession(dossierId, {
            source: 'recovery',
            content: 'Session recovered after backend restart. Resume your work from where you left off.',
          });
        } catch (err) {
          console.error(`[launcher] failed to relaunch orphaned dossier ${dossierId}:`, err);
        }
      }
    }

    console.log(`[launcher] recovery complete: ${sessions.size} sessions active`);
  }

  // --- Private helpers ---

  function buildAgentCommand(workspaceDir: string, dossierDir: string, adapter: AgentAdapter, instruction?: string, resumeId?: string): string {
    const pluginDir = path.resolve(workspaceDir, '..', 'plugins', 'opentidy-hooks');
    const pluginDirExists = fs.existsSync(pluginDir);

    const args = adapter.buildArgs({
      mode: 'interactive',
      cwd: dossierDir,
      skipPermissions: true,
      instruction,
      resumeSessionId: resumeId,
      pluginDir: pluginDirExists ? pluginDir : undefined,
    });

    // Shell-escape args that contain special characters (spaces, quotes, braces, etc.)
    const needsQuoting = (s: string) => /[\s'"{}()$\\|;&<>!`~#]/.test(s);
    const quotedArgs = args.map(a => needsQuoting(a) ? `'${a.replace(/'/g, "'\\''")}'` : a);
    return `cd ${dossierDir} && ${adapter.binary} ${quotedArgs.join(' ')}`;
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
