// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createScheduler } from './scheduler.js';
import { createDatabase } from '../../shared/database.js';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

function makeDeps(overrides?: Partial<Parameters<typeof createScheduler>[0]>) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'scheduler-test-'));
  const db = createDatabase(tmpDir);
  return {
    db,
    tmpDir,
    deps: {
      db,
      launcher: { launchSession: vi.fn().mockResolvedValue(undefined) },
      checkup: { runCheckup: vi.fn().mockResolvedValue(undefined) },
      locks: { isLocked: vi.fn().mockReturnValue(false) },
      sse: { emit: vi.fn() },
      ...overrides,
    },
  };
}

describe('createScheduler', () => {
  let db: Database.Database;
  let tmpDir: string;
  let scheduler: ReturnType<typeof createScheduler>;
  let deps: ReturnType<typeof makeDeps>['deps'];

  beforeEach(() => {
    const setup = makeDeps();
    db = setup.db;
    tmpDir = setup.tmpDir;
    deps = setup.deps;
    scheduler = createScheduler(deps);
  });

  afterEach(() => {
    scheduler.stop();
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns expected interface', () => {
    expect(scheduler).toHaveProperty('start');
    expect(scheduler).toHaveProperty('stop');
    expect(scheduler).toHaveProperty('create');
    expect(scheduler).toHaveProperty('list');
    expect(scheduler).toHaveProperty('update');
    expect(scheduler).toHaveProperty('delete');
    expect(scheduler).toHaveProperty('deleteByTask');
  });

  it('create() inserts and returns a schedule', () => {
    const s = scheduler.create({
      type: 'once',
      runAt: '2026-03-20T18:29:00Z',
      label: 'Test schedule',
      taskId: 'invoices',
      intervalMs: null,
      instruction: null,
      createdBy: 'user',
    });
    expect(s.id).toBeGreaterThan(0);
    expect(s.label).toBe('Test schedule');
    expect(s.taskId).toBe('invoices');
    expect(s.type).toBe('once');
    expect(deps.sse.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'schedule:created' }));
  });

  it('list() returns schedules with computed nextRun', () => {
    scheduler.create({ type: 'once', runAt: '2026-03-20T18:29:00Z', label: 'A', taskId: null, intervalMs: null, instruction: null, createdBy: 'user' });
    scheduler.create({ type: 'recurring', intervalMs: 3600000, label: 'B', taskId: null, runAt: null, instruction: null, createdBy: 'user' });
    const list = scheduler.list();
    expect(list).toHaveLength(2);
    expect(list[0].nextRun).toBe('2026-03-20T18:29:00Z');
    expect(list[1].nextRun).toBeTruthy(); // computed from createdAt + interval
  });

  it('delete() removes by id', () => {
    const s = scheduler.create({ type: 'once', runAt: '2026-03-20T18:29:00Z', label: 'Del', taskId: null, intervalMs: null, instruction: null, createdBy: 'user' });
    scheduler.delete(s.id);
    expect(scheduler.list()).toHaveLength(0);
    expect(deps.sse.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'schedule:deleted' }));
  });

  it('delete() rejects system schedules', () => {
    scheduler.start(); // seeds checkup
    scheduler.stop();
    const list = scheduler.list();
    const system = list.find(s => s.createdBy === 'system');
    expect(system).toBeDefined();
    expect(() => scheduler.delete(system!.id)).toThrow('Cannot delete system schedules');
  });

  it('deleteByTask() removes all schedules for a task', () => {
    scheduler.create({ type: 'once', runAt: '2026-03-20T18:00:00Z', label: 'A', taskId: 'inv', intervalMs: null, instruction: null, createdBy: 'user' });
    scheduler.create({ type: 'once', runAt: '2026-03-21T18:00:00Z', label: 'B', taskId: 'inv', intervalMs: null, instruction: null, createdBy: 'user' });
    scheduler.create({ type: 'once', runAt: '2026-03-22T18:00:00Z', label: 'C', taskId: 'other', intervalMs: null, instruction: null, createdBy: 'user' });
    scheduler.deleteByTask('inv');
    expect(scheduler.list()).toHaveLength(1);
    expect(scheduler.list()[0].taskId).toBe('other');
  });

  it('fires overdue one-shot and deletes it', async () => {
    // Insert a one-shot in the past
    db.prepare("INSERT INTO schedules (task_id, type, run_at, label, created_by) VALUES ('inv', 'once', '2020-01-01T00:00:00Z', 'Past', 'user')").run();
    await scheduler.checkSchedules();
    expect(deps.launcher.launchSession).toHaveBeenCalledWith('inv', undefined);
    // Should be deleted
    expect(scheduler.list()).toHaveLength(0);
  });

  it('fires overdue recurring and updates last_run_at', async () => {
    // Insert a recurring with no last_run_at (overdue immediately)
    db.prepare("INSERT INTO schedules (type, interval_ms, label, created_by) VALUES ('recurring', 1000, 'Checkup', 'system')").run();
    await scheduler.checkSchedules();
    expect(deps.checkup.runCheckup).toHaveBeenCalled();
    const list = scheduler.list();
    expect(list).toHaveLength(1);
    expect(list[0].lastRunAt).toBeTruthy();
  });

  it('skips locked tasks', async () => {
    deps.locks.isLocked = vi.fn().mockReturnValue(true);
    db.prepare("INSERT INTO schedules (task_id, type, run_at, label, created_by) VALUES ('inv', 'once', '2020-01-01T00:00:00Z', 'Locked', 'user')").run();
    await scheduler.checkSchedules();
    expect(deps.launcher.launchSession).not.toHaveBeenCalled();
    // once should stay in DB for retry
    expect(scheduler.list()).toHaveLength(1);
  });

  it('start() seeds checkup if no system schedule exists', () => {
    scheduler.start();
    scheduler.stop();
    const list = scheduler.list();
    expect(list.some(s => s.createdBy === 'system' && s.label === 'Workspace checkup')).toBe(true);
  });

  it('update() modifies a schedule', () => {
    const s = scheduler.create({ type: 'once', runAt: '2026-03-20T18:29:00Z', label: 'Old', taskId: null, intervalMs: null, instruction: null, createdBy: 'user' });
    const updated = scheduler.update(s.id, { label: 'New' });
    expect(updated.label).toBe('New');
  });

  it('update() rejects system schedules', () => {
    scheduler.start();
    scheduler.stop();
    const system = scheduler.list().find(s => s.createdBy === 'system')!;
    expect(() => scheduler.update(system.id, { label: 'Hacked' })).toThrow('Cannot modify system schedules');
  });
});
