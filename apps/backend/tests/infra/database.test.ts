import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createDatabase } from '../../src/infra/database.js';

describe('createDatabase', () => {
  const tmpdirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-db-test-'));
    tmpdirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpdirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpdirs.length = 0;
  });

  it('creates the database file and all 4 tables', () => {
    const dataDir = makeTmpDir();
    const db = createDatabase(dataDir);

    expect(fs.existsSync(path.join(dataDir, 'opentidy.db'))).toBe(true);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row: any) => row.name);

    expect(tables).toContain('claude_processes');
    expect(tables).toContain('notifications');
    expect(tables).toContain('dedup_hashes');
    expect(tables).toContain('sessions');

    db.close();
  });

  it('is idempotent (can be called multiple times on the same directory)', () => {
    const dataDir = makeTmpDir();

    const db1 = createDatabase(dataDir);
    db1.close();

    // Should not throw on second call
    const db2 = createDatabase(dataDir);

    const tables = db2
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row: any) => row.name);

    expect(tables).toContain('claude_processes');
    expect(tables).toContain('notifications');
    expect(tables).toContain('dedup_hashes');
    expect(tables).toContain('sessions');

    db2.close();
  });

  it('uses WAL journal mode', () => {
    const dataDir = makeTmpDir();
    const db = createDatabase(dataDir);

    const row = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(row[0].journal_mode).toBe('wal');

    db.close();
  });

  it('claude_processes table includes output_path column', () => {
    const dataDir = makeTmpDir();
    const db = createDatabase(dataDir);

    const columns = db.prepare("PRAGMA table_info(claude_processes)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain('output_path');

    db.close();
  });
});
