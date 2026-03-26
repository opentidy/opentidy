// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { Session } from '@opentidy/shared';
import type { SessionExecutor } from './launch.js';

import fs from 'fs';
import path from 'path';
import os from 'os';

interface PostSessionDeps {
  tmuxExecutor: SessionExecutor;
  locks: { release(taskId: string): void };
  sse: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
  terminal: { killTtyd(sessionName: string): void };
  memoryAgents?: {
    isTranscriptSubstantial(transcriptPath: string): boolean;
    runExtraction(input: { transcriptPath: string; indexContent: string; taskId: string; stateContent: string }): Promise<void>;
  };
  workspaceDir?: string;
}

/**
 * Creates post-session cleanup functions (end, archive).
 * Separated from session launch to keep concerns isolated.
 */
export function createPostSessionHandlers(
  deps: PostSessionDeps,
  sessions: Map<string, Session>,
) {
  function triggerMemoryExtraction(taskId: string): void {
    if (!deps.memoryAgents || !deps.workspaceDir) return;

    const taskDir = path.join(deps.workspaceDir, taskId);
    const memoryDir = path.join(deps.workspaceDir, '_memory');
    const indexPath = path.join(memoryDir, 'INDEX.md');

    // Find most recent transcript for this task in Claude's project data
    // Only scan project dirs matching the workspace path to avoid picking up
    // transcripts from unrelated projects (e.g. other dev sessions)
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    let transcriptPath = '';
    try {
      if (fs.existsSync(claudeDir)) {
        // Claude Code encodes cwd as project dir name: /a/b/c → -a-b-c
        // Only match dirs that correspond to the workspace path (never the repo
        // root, which would also match the developer's personal Claude sessions
        const workspacePrefix = deps.workspaceDir!.replace(/\//g, '-');
        const projectDirs = fs.readdirSync(claudeDir)
          .filter(d => {
            return d.startsWith(workspacePrefix)
              && fs.statSync(path.join(claudeDir, d)).isDirectory();
          });
        let newest = 0;
        for (const dir of projectDirs) {
          const projPath = path.join(claudeDir, dir);
          const files = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl'));
          for (const f of files) {
            const fp = path.join(projPath, f);
            const stat = fs.statSync(fp);
            if (stat.mtimeMs > newest) { newest = stat.mtimeMs; transcriptPath = fp; }
          }
        }
      }
    } catch { /* ignore errors scanning transcripts */ }

    if (!transcriptPath) {
      console.log(`[memory] no transcript found for ${taskId}, skipping extraction`);
      return;
    }

    if (!deps.memoryAgents.isTranscriptSubstantial(transcriptPath)) {
      console.log(`[memory] transcript too short for ${taskId}, skipping extraction`);
      return;
    }

    const stateContent = fs.existsSync(path.join(taskDir, 'state.md'))
      ? fs.readFileSync(path.join(taskDir, 'state.md'), 'utf-8')
      : '';
    const indexContent = fs.existsSync(indexPath)
      ? fs.readFileSync(indexPath, 'utf-8')
      : '';

    console.log(`[memory] triggering extraction for ${taskId}`);
    deps.memoryAgents.runExtraction({ transcriptPath, indexContent, taskId, stateContent }).catch(err => {
      console.error(`[memory] extraction failed for ${taskId}:`, (err as Error).message);
    });
  }

  function handleSessionEnd(taskId: string): void {
    const sessionName = `opentidy-${taskId}`;

    // Kill the tmux session and its entire process tree.
    // Claude Code's MCP children survive SIGHUP, so we must explicitly
    // kill the process tree before destroying the tmux session.
    deps.tmuxExecutor.killSession(sessionName).catch(() => {});

    deps.locks.release(taskId);
    deps.terminal.killTtyd(sessionName);
    sessions.delete(taskId);
    deps.sse.emit({ type: 'session:ended', data: { taskId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] session ended: ${taskId}`);
    triggerMemoryExtraction(taskId);
  }

  async function archiveSession(taskId: string): Promise<void> {
    const sessionName = `opentidy-${taskId}`;
    deps.terminal.killTtyd(sessionName);
    await deps.tmuxExecutor.killSession(sessionName);
    deps.locks.release(taskId);
    sessions.delete(taskId);
    deps.sse.emit({ type: 'session:ended', data: { taskId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] session archived: ${taskId}`);
    triggerMemoryExtraction(taskId);
  }

  return { handleSessionEnd, archiveSession };
}
