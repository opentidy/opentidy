// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type Database from 'better-sqlite3';
import type { NotificationRecord } from '@opentidy/shared';

export function createNotificationStore(db: Database.Database) {
  const insertStmt = db.prepare(
    'INSERT INTO notifications (timestamp, message, link, job_id) VALUES (?, ?, ?, ?)'
  );
  const listStmt = db.prepare(
    'SELECT * FROM notifications ORDER BY id DESC LIMIT 200'
  );

  function record(input: { message: string; link: string; jobId?: string }): NotificationRecord {
    const timestamp = new Date().toISOString();
    const result = insertStmt.run(timestamp, input.message, input.link, input.jobId ?? null);
    return {
      id: String(result.lastInsertRowid),
      timestamp,
      message: input.message,
      link: input.link,
      jobId: input.jobId,
    };
  }

  function list(): NotificationRecord[] {
    const rows = listStmt.all() as any[];
    return rows.map(row => ({
      id: String(row.id),
      timestamp: row.timestamp,
      message: row.message,
      link: row.link,
      jobId: row.job_id ?? undefined,
    }));
  }

  return { record, list };
}