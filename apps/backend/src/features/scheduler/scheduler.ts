// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type Database from 'better-sqlite3';
import type { Schedule, SSEEvent } from '@opentidy/shared';
import type { CreateScheduleInput, UpdateScheduleInput } from '@opentidy/shared';

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_CHECKUP_INTERVAL_MS = 7_200_000; // 2h

interface SchedulerDeps {
  db: Database.Database;
  launcher: {
    launchSession(id: string, event?: { source: string; content: string }): Promise<void>;
  };
  checkup: {
    runCheckup(): Promise<unknown>;
  };
  locks: {
    isLocked(taskId: string): boolean;
  };
  sse: {
    emit(event: SSEEvent): void;
  };
}

export function createScheduler(deps: SchedulerDeps) {
  const { db, launcher, checkup, locks, sse } = deps;

  const insertStmt = db.prepare(`
    INSERT INTO schedules (task_id, type, run_at, interval_ms, instruction, label, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const listStmt = db.prepare('SELECT * FROM schedules ORDER BY created_at');

  const getByIdStmt = db.prepare('SELECT * FROM schedules WHERE id = ?');

  const updateStmt = db.prepare(`
    UPDATE schedules SET label = COALESCE(?, label), run_at = COALESCE(?, run_at),
    interval_ms = COALESCE(?, interval_ms), instruction = COALESCE(?, instruction)
    WHERE id = ?
  `);

  const deleteStmt = db.prepare('DELETE FROM schedules WHERE id = ?');
  const deleteByTaskStmt = db.prepare('DELETE FROM schedules WHERE task_id = ?');
  const updateLastRunStmt = db.prepare("UPDATE schedules SET last_run_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?");

  const findOverdueOnceStmt = db.prepare(
    "SELECT * FROM schedules WHERE type = 'once' AND run_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
  );

  const findOverdueRecurringStmt = db.prepare(`
    SELECT * FROM schedules WHERE type = 'recurring' AND (
      last_run_at IS NULL OR
      (CAST((julianday('now') - julianday(last_run_at)) * 86400000 AS INTEGER) >= interval_ms)
    )
  `);

  const countSystemStmt = db.prepare("SELECT COUNT(*) as cnt FROM schedules WHERE created_by = 'system'");

  let timer: ReturnType<typeof setInterval> | null = null;

  function emitSSE(type: 'schedule:created' | 'schedule:fired' | 'schedule:deleted', data: Record<string, unknown>) {
    sse.emit({ type, data, timestamp: new Date().toISOString() });
  }

  function rowToSchedule(row: Record<string, unknown>): Schedule {
    return {
      id: row.id as number,
      taskId: row.task_id as string | null,
      type: row.type as 'once' | 'recurring',
      runAt: row.run_at as string | null,
      intervalMs: row.interval_ms as number | null,
      lastRunAt: row.last_run_at as string | null,
      instruction: row.instruction as string | null,
      label: row.label as string,
      createdBy: row.created_by as 'system' | 'agent' | 'user',
      createdAt: row.created_at as string,
    };
  }

  async function fire(schedule: Schedule): Promise<void> {
    if (schedule.taskId) {
      if (locks.isLocked(schedule.taskId)) {
        console.log(`[scheduler] Skipping ${schedule.label} — task ${schedule.taskId} is locked`);
        return; // once stays in DB for retry, recurring waits for next cycle
      }
      console.log(`[scheduler] Firing ${schedule.label} for task ${schedule.taskId}`);
      try {
        await launcher.launchSession(schedule.taskId, schedule.instruction
          ? { source: 'scheduler', content: schedule.instruction }
          : undefined
        );
      } catch (err) {
        console.error(`[scheduler] Failed to launch session for ${schedule.taskId}:`, err);
        return;
      }
    } else if (schedule.createdBy === 'system') {
      console.log(`[scheduler] Firing system task: ${schedule.label}`);
      try {
        await checkup.runCheckup();
      } catch (err) {
        console.error('[scheduler] Checkup failed:', err);
      }
    }

    if (schedule.type === 'once') {
      deleteStmt.run(schedule.id);
    } else {
      updateLastRunStmt.run(schedule.id);
    }

    emitSSE('schedule:fired', { id: schedule.id, label: schedule.label, taskId: schedule.taskId });
  }

  async function checkSchedules(): Promise<void> {
    const overdueOnce = findOverdueOnceStmt.all() as Record<string, unknown>[];
    const overdueRecurring = findOverdueRecurringStmt.all() as Record<string, unknown>[];

    for (const row of [...overdueOnce, ...overdueRecurring]) {
      await fire(rowToSchedule(row));
    }
  }

  function seedCheckup(): void {
    // Deduplicate: remove extras if somehow multiple system schedules exist
    const existing = db.prepare("SELECT id FROM schedules WHERE created_by = 'system' AND label = 'Workspace checkup' ORDER BY id").all() as { id: number }[];
    if (existing.length > 1) {
      for (const row of existing.slice(1)) {
        deleteStmt.run(row.id);
      }
      console.log(`[scheduler] Cleaned ${existing.length - 1} duplicate system schedule(s)`);
    }
    if (existing.length === 0) {
      insertStmt.run(null, 'recurring', null, DEFAULT_CHECKUP_INTERVAL_MS, 'checkup', 'Workspace checkup', 'system');
      console.log('[scheduler] Seeded workspace checkup schedule (2h)');
    }
  }

  return {
    start(): void {
      seedCheckup();
      timer = setInterval(() => {
        checkSchedules().catch(err => console.error('[scheduler] Poll error:', err));
      }, POLL_INTERVAL_MS);
      console.log('[scheduler] Polling started (10s interval)');
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    create(input: CreateScheduleInput): Schedule {
      const result = insertStmt.run(
        input.taskId, input.type, input.runAt, input.intervalMs,
        input.instruction, input.label, input.createdBy,
      );
      const row = getByIdStmt.get(result.lastInsertRowid) as Record<string, unknown>;
      const schedule = rowToSchedule(row);
      emitSSE('schedule:created', { id: schedule.id, label: schedule.label });
      return schedule;
    },

    list(): (Schedule & { nextRun: string | null })[] {
      const rows = listStmt.all() as Record<string, unknown>[];
      return rows.map(row => {
        const s = rowToSchedule(row);
        let nextRun: string | null = null;
        if (s.type === 'once') {
          nextRun = s.runAt;
        } else if (s.type === 'recurring' && s.intervalMs) {
          if (s.lastRunAt) {
            nextRun = new Date(new Date(s.lastRunAt).getTime() + s.intervalMs).toISOString();
          } else {
            nextRun = new Date(new Date(s.createdAt).getTime() + s.intervalMs).toISOString();
          }
        }
        return { ...s, nextRun };
      });
    },

    update(id: number, input: UpdateScheduleInput): Schedule {
      const existing = getByIdStmt.get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Schedule ${id} not found`);
      if (existing.created_by === 'system') throw new Error('Cannot modify system schedules');
      updateStmt.run(input.label ?? null, input.runAt ?? null, input.intervalMs ?? null, input.instruction ?? null, id);
      return rowToSchedule(getByIdStmt.get(id) as Record<string, unknown>);
    },

    delete(id: number): void {
      const existing = getByIdStmt.get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Schedule ${id} not found`);
      if (existing.created_by === 'system') throw new Error('Cannot delete system schedules');
      deleteStmt.run(id);
      emitSSE('schedule:deleted', { id });
    },

    deleteByTask(taskId: string): void {
      deleteByTaskStmt.run(taskId);
    },

    // Exposed for testing
    checkSchedules,
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
