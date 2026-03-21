// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type Database from 'better-sqlite3';
import type { AgentProcess, AgentProcessType } from '@opentidy/shared';

export function createAgentTracker(db: Database.Database) {
  const insertStmt = db.prepare(
    "INSERT INTO claude_processes (type, task_id, pid, status, description) VALUES (?, ?, ?, 'queued', ?)"
  );
  const runningStmt = db.prepare(
    "UPDATE claude_processes SET status = 'running', pid = ? WHERE id = ?"
  );
  const completeStmt = db.prepare(
    "UPDATE claude_processes SET status = 'done', exit_code = ?, ended_at = datetime('now') WHERE id = ?"
  );
  const failStmt = db.prepare(
    "UPDATE claude_processes SET status = 'error', ended_at = datetime('now') WHERE id = ?"
  );
  const setOutputPathStmt = db.prepare(
    'UPDATE claude_processes SET output_path = ? WHERE id = ?'
  );

  function start(type: AgentProcessType, taskId?: string, pid?: number, description?: string): number {
    const result = insertStmt.run(type, taskId ?? null, pid ?? null, description ?? null);
    console.log(`[agent-tracker] QUEUED ${type}${taskId ? ` (${taskId})` : ''}${description ? ` — ${description.slice(0, 60)}` : ''} → id=${result.lastInsertRowid}`);
    return Number(result.lastInsertRowid);
  }

  function markRunning(id: number, pid?: number): void {
    runningStmt.run(pid ?? null, id);
    console.log(`[agent-tracker] RUNNING id=${id}${pid ? ` pid=${pid}` : ''}`);
  }

  function complete(id: number, exitCode: number): void {
    completeStmt.run(exitCode, id);
    console.log(`[agent-tracker] DONE id=${id} exit=${exitCode}`);
  }

  function fail(id: number): void {
    failStmt.run(id);
    console.log(`[agent-tracker] ERROR id=${id}`);
  }

  function setOutputPath(id: number, outputPath: string): void {
    setOutputPathStmt.run(outputPath, id);
  }

  function mapRow(row: any): AgentProcess {
    return {
      id: row.id,
      type: row.type,
      taskId: row.task_id ?? undefined,
      pid: row.pid ?? undefined,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      status: row.status,
      exitCode: row.exit_code ?? undefined,
      outputPath: row.output_path ?? undefined,
      description: row.description ?? undefined,
    };
  }

  function getById(id: number): AgentProcess | undefined {
    const row = db.prepare('SELECT * FROM claude_processes WHERE id = ?').get(id) as any;
    return row ? mapRow(row) : undefined;
  }

  function list(filter?: { type?: string; limit?: number }): AgentProcess[] {
    let query = 'SELECT * FROM claude_processes';
    const params: unknown[] = [];
    if (filter?.type) {
      query += ' WHERE type = ?';
      params.push(filter.type);
    }
    query += ' ORDER BY id DESC';
    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(mapRow);
  }

  function cleanup(olderThanDays: number): void {
    const result = db.prepare(
      "DELETE FROM claude_processes WHERE status != 'running' AND ended_at < datetime('now', '-' || ? || ' days')"
    ).run(olderThanDays);
    if ((result as any).changes > 0) {
      console.log(`[agent-tracker] Cleaned ${(result as any).changes} old processes`);
    }
  }

  return { start, markRunning, complete, fail, setOutputPath, getById, list, cleanup };
}