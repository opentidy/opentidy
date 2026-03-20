// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createDatabase } from './database.js';
import { createAgentTracker } from './agent-tracker.js';
import type Database from 'better-sqlite3';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-tracker-test-'));
}

function makeDb(tmpDir: string): Database.Database {
  return createDatabase(tmpDir);
}

describe('agent-tracker', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    db = makeDb(tmpDir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records a process start and returns an id > 0', () => {
    const tracker = createAgentTracker(db);
    const id = tracker.start('triage', 'job-abc', 12345);
    expect(id).toBeGreaterThan(0);
  });

  it('completes a process with exit code — status=done, exitCode set, endedAt set', () => {
    const tracker = createAgentTracker(db);
    const id = tracker.start('triage', 'job-xyz');
    tracker.complete(id, 0);
    const processes = tracker.list();
    const proc = processes.find(p => p.id === id);
    expect(proc).toBeDefined();
    expect(proc!.status).toBe('done');
    expect(proc!.exitCode).toBe(0);
    expect(proc!.endedAt).toBeDefined();
  });

  it('marks a process as error — status=error', () => {
    const tracker = createAgentTracker(db);
    const id = tracker.start('checkup');
    tracker.fail(id);
    const processes = tracker.list();
    const proc = processes.find(p => p.id === id);
    expect(proc).toBeDefined();
    expect(proc!.status).toBe('error');
    expect(proc!.endedAt).toBeDefined();
  });

  it('lists processes with optional type filter', () => {
    const tracker = createAgentTracker(db);
    tracker.start('triage', 'job-1');
    tracker.start('checkup', 'job-2');
    tracker.start('triage', 'job-3');

    const all = tracker.list();
    expect(all).toHaveLength(3);

    const triageOnly = tracker.list({ type: 'triage' });
    expect(triageOnly).toHaveLength(2);
    expect(triageOnly.every(p => p.type === 'triage')).toBe(true);
  });

  it('lists with limit', () => {
    const tracker = createAgentTracker(db);
    tracker.start('triage');
    tracker.start('triage');
    tracker.start('triage');
    tracker.start('triage');
    tracker.start('triage');

    const limited = tracker.list({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('lists most recent first (ORDER BY id DESC)', () => {
    const tracker = createAgentTracker(db);
    const id1 = tracker.start('triage', 'first');
    const id2 = tracker.start('triage', 'second');
    const id3 = tracker.start('triage', 'third');

    const processes = tracker.list();
    expect(processes[0].id).toBe(id3);
    expect(processes[1].id).toBe(id2);
    expect(processes[2].id).toBe(id1);
  });

  it('setOutputPath stores outputPath and getById returns it', () => {
    const tracker = createAgentTracker(db);
    const id = tracker.start('triage', 'job-abc');
    tracker.setOutputPath(id, '/tmp/outputs/1.txt');
    const proc = tracker.getById(id);
    expect(proc).toBeDefined();
    expect(proc!.outputPath).toBe('/tmp/outputs/1.txt');
  });

  it('getById returns undefined for nonexistent id', () => {
    const tracker = createAgentTracker(db);
    expect(tracker.getById(99999)).toBeUndefined();
  });

  it('list includes outputPath when set', () => {
    const tracker = createAgentTracker(db);
    const id = tracker.start('triage', 'job-xyz');
    tracker.setOutputPath(id, '/tmp/outputs/xyz.jsonl');
    const processes = tracker.list();
    const proc = processes.find(p => p.id === id);
    expect(proc!.outputPath).toBe('/tmp/outputs/xyz.jsonl');
  });

  it('outputPath is undefined when not set', () => {
    const tracker = createAgentTracker(db);
    const id = tracker.start('triage');
    const proc = tracker.getById(id);
    expect(proc!.outputPath).toBeUndefined();
  });

  it('cleanup removes old completed processes', () => {
    const tracker = createAgentTracker(db);
    const id1 = tracker.start('triage', 'old-job');
    tracker.complete(id1, 0);

    // Manually backdate ended_at to 31 days ago
    db.prepare("UPDATE claude_processes SET ended_at = datetime('now', '-31 days') WHERE id = ?").run(id1);

    const id2 = tracker.start('triage', 'recent-job');
    tracker.complete(id2, 0);

    // Cleanup processes older than 30 days
    tracker.cleanup(30);

    const remaining = tracker.list();
    expect(remaining.find(p => p.id === id1)).toBeUndefined();
    expect(remaining.find(p => p.id === id2)).toBeDefined();
  });
});