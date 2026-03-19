// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type Database from 'better-sqlite3';
import { createHash } from 'crypto';

export function createDedupStore(db: Database.Database) {
  const checkStmt = db.prepare('SELECT 1 FROM dedup_hashes WHERE content_hash = ?');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO dedup_hashes (content_hash) VALUES (?)');
  const cleanupStmt = db.prepare("DELETE FROM dedup_hashes WHERE created_at < datetime('now', '-7 days')");

  function hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  function isDuplicate(content: string): boolean {
    return !!checkStmt.get(hash(content));
  }

  function record(content: string): void {
    insertStmt.run(hash(content));
  }

  function cleanup(): void {
    const result = cleanupStmt.run();
    if (result.changes > 0) {
      console.log(`[dedup] Cleaned ${result.changes} old hashes`);
    }
  }

  return { isDuplicate, record, cleanup };
}