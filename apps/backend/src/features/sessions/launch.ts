// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Session, AgentAdapter } from '@opentidy/shared';
import { setStatus, parseStateMd } from '../jobs/state.js';
import { generateJobInstructions } from './instruction-file.js';
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
  acquire(jobId: string): boolean;
  release(jobId: string): void;
  isLocked?(jobId: string): boolean;
  cleanupStaleLocks?(): string[];
}

interface WorkspaceManager {
  getJob(id: string): { id: string; title: string; objective: string; status: string; confirm?: boolean };
  listJobIds(): string[];
  dir: string;
}

interface Notifier {
  notifyStarted?(jobId: string): void;
  notifyCompleted(jobId: string): void;
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
  getAllowedTools: () => string[];
  memoryAgents?: {
    isTranscriptSubstantial(transcriptPath: string): boolean;
    runExtraction(input: { transcriptPath: string; indexContent: string; jobId: string; stateContent: string }): Promise<void>;
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

  // Wrap handleSessionEnd to write .user-stopped marker when job is still IN_PROGRESS
  function handleSessionEnd(jobId: string): void {
    const jobDir = path.join(deps.workspaceDir, jobId);
    if (fs.existsSync(path.join(jobDir, 'state.md'))) {
      const state = parseStateMd(jobDir);
      if (state.status === 'IN_PROGRESS' && !state.waitingFor) {
        fs.writeFileSync(path.join(jobDir, USER_STOPPED_MARKER), new Date().toISOString());
        console.log(`[launcher] marked ${jobId} as user-stopped`);
      }
    }
    baseHandleSessionEnd(jobId);
  }

  async function launchSession(jobId: string, event?: { source: string; content: string }): Promise<void> {
    if (sessions.has(jobId)) {
      console.log(`[launcher] ${jobId} already has active session, skipping`);
      return;
    }

    if (!deps.locks.acquire(jobId)) {
      console.log(`[launcher] ${jobId} already locked, skipping`);
      return;
    }

    try {
      const jobDir = path.join(deps.workspaceDir, jobId);
      const sessionName = `opentidy-${jobId}`;

      // Remove .user-stopped marker (explicit launch = user wants to resume)
      const stoppedMarker = path.join(jobDir, USER_STOPPED_MARKER);
      if (fs.existsSync(stoppedMarker)) fs.unlinkSync(stoppedMarker);

      // Ensure job is marked IN_PROGRESS (may have been COMPLETED)
      setStatus(jobDir, 'IN_PROGRESS');

      // Generate job instruction file (level 2 context)
      const jobInfo = deps.workspace.getJob(jobId);
      generateJobInstructions({
        workspaceDir: deps.workspaceDir, jobId, jobInfo,
        instructionFile: deps.adapter.instructionFile, event,
      });

      // Build agent command
      const resumeId = deps.adapter.readSessionId(jobDir) ?? undefined;
      const agentCmd = buildAgentCommand(deps.workspaceDir, jobDir, deps.adapter, event?.content, resumeId);

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
        jobId,
        status: 'active',
        startedAt: new Date().toISOString(),
        agentSessionId: resumeId,
        pid,
      };
      sessions.set(jobId, session);

      deps.sse.emit({ type: 'session:started', data: { jobId }, timestamp: new Date().toISOString() });
      deps.notify.notifyStarted?.(jobId);
      console.log(`[launcher] ${jobId} session started (pid: ${pid})`);
    } catch (err) {
      console.error(`[launcher] ${jobId}: launchSession failed, releasing lock:`, err);
      deps.locks.release(jobId);
      throw err;
    }
  }

  async function sendMessage(jobId: string, message: string): Promise<void> {
    const session = sessions.get(jobId);
    if (!session) {
      console.warn(`[launcher] sendMessage: no active session for ${jobId}`);
      return;
    }
    await deps.tmuxExecutor.sendKeys(`opentidy-${jobId}`, message + '\n');
    session.status = 'active';
    deps.sse.emit({ type: 'session:active', data: { jobId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] sent message to ${jobId}`);
  }

  function markWaiting(jobId: string): void {
    const session = sessions.get(jobId);
    if (!session) return;
    session.status = 'idle';
    // Determine waiting type from state.md
    const jobDir = path.join(deps.workspaceDir, jobId);
    const state = parseStateMd(jobDir);
    session.waitingType = state.waitingType ?? 'user';
    deps.sse.emit({ type: 'session:idle', data: { jobId, waitingType: session.waitingType }, timestamp: new Date().toISOString() });
  }

  function setSessionWaitingType(jobId: string, type: 'user' | 'tiers'): void {
    const session = sessions.get(jobId);
    if (!session) return;
    session.waitingType = type;
    deps.sse.emit({ type: 'session:idle', data: { jobId, waitingType: type }, timestamp: new Date().toISOString() });
  }

  function listActiveSessions(): Session[] {
    return Array.from(sessions.values());
  }

  async function recover(): Promise<void> {
    // Pass 1: Reconcile surviving tmux sessions
    const activeTmux = await deps.tmuxExecutor.listSessions();
    for (const name of activeTmux.filter((s) => s.startsWith('opentidy-'))) {
      const jobId = name.replace('opentidy-', '');
      const jobDir = path.join(deps.workspaceDir, jobId);
      if (!fs.existsSync(jobDir)) continue;
      if (!deps.locks.acquire(jobId)) continue;

      sessions.set(jobId, {
        id: name,
        jobId,
        status: 'active',
        startedAt: new Date().toISOString(),
      });

      // Ensure ttyd is running for recovered sessions
      await deps.terminal.ensureReady(name);
      console.log(`[launcher] recovered tmux session: ${jobId}`);
    }

    if (deps.locks.cleanupStaleLocks) {
      deps.locks.cleanupStaleLocks();
    }

    // Pass 2: Relaunch orphaned IN_PROGRESS jobs (no tmux, not waiting, not user-stopped)
    const allJobIds = deps.workspace.listJobIds();
    const orphans: string[] = [];

    for (const jobId of allJobIds) {
      if (sessions.has(jobId)) continue;

      const jobDir = path.join(deps.workspaceDir, jobId);
      const state = parseStateMd(jobDir);

      if (state.status !== 'IN_PROGRESS') continue;
      if (state.waitingFor) continue;
      if (fs.existsSync(path.join(jobDir, USER_STOPPED_MARKER))) continue;

      orphans.push(jobId);
    }

    if (orphans.length > 0) {
      console.log(`[launcher] found ${orphans.length} orphaned job(s), delaying ${recoveryDelayMs / 1000}s before relaunch: ${orphans.join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, recoveryDelayMs));

      for (const jobId of orphans) {
        try {
          await launchSession(jobId, {
            source: 'recovery',
            content: 'Session recovered after backend restart. Resume your work from where you left off.',
          });
        } catch (err) {
          console.error(`[launcher] failed to relaunch orphaned job ${jobId}:`, err);
        }
      }
    }

    console.log(`[launcher] recovery complete: ${sessions.size} sessions active`);
  }

  // --- Private helpers ---

  function buildAgentCommand(workspaceDir: string, jobDir: string, adapter: AgentAdapter, instruction?: string, resumeId?: string): string {
    const pluginDir = path.resolve(workspaceDir, '..', 'plugins', 'opentidy-hooks');
    const pluginDirExists = fs.existsSync(pluginDir);

    const args = adapter.buildArgs({
      mode: 'interactive',
      cwd: jobDir,
      allowedTools: deps.getAllowedTools(),
      instruction,
      resumeSessionId: resumeId,
      pluginDir: pluginDirExists ? pluginDir : undefined,
    });

    // Shell-escape args that contain special characters (spaces, quotes, braces, etc.)
    const needsQuoting = (s: string) => /[\s'"{}()$\\|;&<>!`~#]/.test(s);
    const quotedArgs = args.map(a => needsQuoting(a) ? `'${a.replace(/'/g, "'\\''")}'` : a);

    // Prefix with agent env vars (e.g. CLAUDE_CONFIG_DIR) so tmux sessions use the isolated config
    const agentEnv = adapter.getEnv();
    const envPrefix = Object.entries(agentEnv)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    const prefix = envPrefix ? `${envPrefix} ` : '';
    return `cd ${jobDir} && ${prefix}${adapter.binary} ${quotedArgs.join(' ')}`;
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
