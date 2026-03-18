import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { createDedupStore } from '../../src/infra/dedup.js';
import { createDatabase } from '../../src/infra/database.js';
import type Database from 'better-sqlite3';

describe('DedupStore', () => {
  let db: Database.Database;
  let dedup: ReturnType<typeof createDedupStore>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(`${tmpdir()}/alfred-dedup-test-`);
    db = createDatabase(tmpDir);
    dedup = createDedupStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects duplicate events by content hash', () => {
    const content = '{"from":"billing@sopra.com","subject":"Facture"}';
    expect(dedup.isDuplicate(content)).toBe(false);
    dedup.record(content);
    expect(dedup.isDuplicate(content)).toBe(true);
  });

  it('allows different content', () => {
    dedup.record('content A');
    expect(dedup.isDuplicate('content B')).toBe(false);
  });

  it('persists across store instances', () => {
    const content = 'persistent-content';
    dedup.record(content);

    // Create a new store instance on the same db
    const dedup2 = createDedupStore(db);
    expect(dedup2.isDuplicate(content)).toBe(true);
  });

  it('cleanup() removes entries older than 7 days', () => {
    const content = 'old-content';
    dedup.record(content);

    // Manually backdate the entry
    db.prepare("UPDATE dedup_hashes SET created_at = datetime('now', '-8 days')").run();

    expect(dedup.isDuplicate(content)).toBe(true);
    dedup.cleanup();
    expect(dedup.isDuplicate(content)).toBe(false);
  });
});
