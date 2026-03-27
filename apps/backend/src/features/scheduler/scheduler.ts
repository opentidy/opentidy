// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type Database from 'better-sqlite3';
import type { Schedule, SSEEvent } from '@opentidy/shared';
import type { CreateScheduleInput, UpdateScheduleInput } from '@opentidy/shared';
import { schedule as cronSchedule, type ScheduledTask } from 'node-cron';

const POLL_CRON = '*/10 * * * * *'; // every 10 seconds
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
  /** Override default checkup interval (ms). 0 = disabled. */
  checkupIntervalMs?: number;
}

export function createScheduler(deps: SchedulerDeps) {
  const { db, launcher, checkup, locks, sse, checkupIntervalMs } = deps;
  const effectiveCheckupInterval = checkupIntervalMs ?? DEFAULT_CHECKUP_INTERVAL_MS;

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


  let cronTask: ScheduledTask | null = null;

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
        console.log(`[scheduler] Skipping ${schedule.label}, task ${schedule.taskId} is locked`);
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
      // Update last_run BEFORE execution to prevent re-trigger during long runs
      if (schedule.type === 'recurring') {
        updateLastRunStmt.run(schedule.id);
      }
      try {
        await checkup.runCheckup();
      } catch (err) {
        console.error('[scheduler] Checkup failed:', err);
      }
    }

    if (schedule.type === 'once') {
      deleteStmt.run(schedule.id);
    } else if (schedule.taskId) {
      // Task-based recurring: update after execution (system recurring already updated above)
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
      if (effectiveCheckupInterval > 0) {
        insertStmt.run(null, 'recurring', null, effectiveCheckupInterval, 'checkup', 'Workspace checkup', 'system');
        console.log(`[scheduler] Seeded workspace checkup schedule (${effectiveCheckupInterval}ms)`);
      } else {
        // Disabled: seed as far-future one-shot so it exists but won't fire
        insertStmt.run(null, 'once', '9999-12-31T23:59:59Z', null, 'checkup', 'Workspace checkup', 'system');
        console.log('[scheduler] Seeded workspace checkup schedule (disabled)');
      }
    }
  }

  return {
    start(): void {
      seedCheckup();
      cronTask = cronSchedule(POLL_CRON, () => {
        checkSchedules().catch(err => console.error('[scheduler] Poll error:', err));
      });
      console.log('[scheduler] Started (cron: every 10s)');
    },

    stop(): void {
      if (cronTask) {
        cronTask.stop();
        cronTask = null;
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

    /** Update interval for a system schedule (e.g. checkup). Re-enables if disabled. */
    updateSystem(id: number, intervalMs: number): void {
      const existing = getByIdStmt.get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Schedule ${id} not found`);
      db.prepare('UPDATE schedules SET interval_ms = ?, type = ? WHERE id = ?').run(intervalMs, 'recurring', id);
      console.log(`[scheduler] System schedule ${id} interval updated to ${intervalMs}ms`);
    },

    /** Disable a system schedule by setting it to a far-future one-shot. */
    disableSystem(id: number): void {
      const existing = getByIdStmt.get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Schedule ${id} not found`);
      // Set interval to null and type to 'once' with a far-future run_at (effectively disabled)
      db.prepare("UPDATE schedules SET type = 'once', run_at = '9999-12-31T23:59:59Z', interval_ms = NULL WHERE id = ?").run(id);
      console.log(`[scheduler] System schedule ${id} disabled`);
    },

    // Exposed for testing
    checkSchedules,
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
