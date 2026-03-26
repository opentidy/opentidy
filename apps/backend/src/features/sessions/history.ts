// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type Database from 'better-sqlite3';
import type { SessionHistoryEntry, SessionHistoryStatus } from '@opentidy/shared';

export function createSessionHistory(db: Database.Database) {
  const insertStmt = db.prepare(
    'INSERT INTO session_history (task_id, agent_session_id, status, trigger_source) VALUES (?, ?, ?, ?)'
  );
  const completeStmt = db.prepare(
    "UPDATE session_history SET status = ?, ended_at = datetime('now') WHERE id = ?"
  );
  const updateAgentSessionIdStmt = db.prepare(
    'UPDATE session_history SET agent_session_id = ? WHERE id = ?'
  );
  const listByTaskStmt = db.prepare(
    'SELECT * FROM session_history WHERE task_id = ? ORDER BY id DESC'
  );
  const getRunningStmt = db.prepare(
    "SELECT * FROM session_history WHERE task_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1"
  );

  function mapRow(row: any): SessionHistoryEntry {
    return {
      id: row.id,
      taskId: row.task_id,
      agentSessionId: row.agent_session_id ?? undefined,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      status: row.status,
      trigger: row.trigger_source ?? undefined,
    };
  }

  function recordStart(taskId: string, opts?: { agentSessionId?: string; trigger?: string }): number {
    const result = insertStmt.run(taskId, opts?.agentSessionId ?? null, 'running', opts?.trigger ?? null);
    const id = Number(result.lastInsertRowid);
    console.log(`[session-history] recorded start for ${taskId} → id=${id}`);
    return id;
  }

  function recordEnd(id: number, status: SessionHistoryStatus = 'completed'): void {
    completeStmt.run(status, id);
    console.log(`[session-history] recorded end id=${id} status=${status}`);
  }

  function recordEndByTask(taskId: string, status: SessionHistoryStatus = 'completed'): void {
    const row = getRunningStmt.get(taskId) as any;
    if (row) {
      recordEnd(row.id, status);
    }
  }

  function updateAgentSessionId(id: number, agentSessionId: string): void {
    updateAgentSessionIdStmt.run(agentSessionId, id);
  }

  function listByTask(taskId: string): SessionHistoryEntry[] {
    const rows = listByTaskStmt.all(taskId) as any[];
    return rows.map(mapRow);
  }

  return { recordStart, recordEnd, recordEndByTask, updateAgentSessionId, listByTask };
}

export type SessionHistory = ReturnType<typeof createSessionHistory>;
