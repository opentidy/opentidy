// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// iMessage receiver — polls Messages.app SQLite database for new messages.
// Requires Full Disk Access for the process to read ~/Library/Messages/chat.db.

import type { ReceiverEvent } from '@opentidy/shared';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

const DB_PATH = join(homedir(), 'Library/Messages/chat.db');

export function createReceiver(_config: Record<string, unknown>) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastPollTimestamp = Math.floor(Date.now() / 1000) - 300; // Start 5min ago

  function poll(): ReceiverEvent[] {
    try {
      const coreDataOffset = 978307200;
      const minDate = (lastPollTimestamp - coreDataOffset) * 1_000_000_000;

      const query = `
        SELECT
          m.rowid AS message_id,
          m.date / 1000000000 + ${coreDataOffset} AS unix_ts,
          CASE WHEN m.is_from_me = 1 THEN 'me' ELSE coalesce(h.id, 'unknown') END AS sender,
          c.chat_identifier AS chat,
          m.text
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.rowid
        LEFT JOIN chat_message_join cmj ON cmj.message_id = m.rowid
        LEFT JOIN chat c ON cmj.chat_id = c.rowid
        WHERE m.text IS NOT NULL
          AND m.is_from_me = 0
          AND m.date > ${minDate}
        ORDER BY m.date ASC
        LIMIT 50;
      `;

      const raw = execFileSync('sqlite3', ['-json', DB_PATH, query], {
        encoding: 'utf-8',
        timeout: 10_000,
      }).trim();

      if (!raw || raw === '[]') return [];

      const rows = JSON.parse(raw) as Array<{ message_id: number; unix_ts: number; sender: string; chat: string; text: string }>;

      if (rows.length > 0) {
        lastPollTimestamp = Math.max(...rows.map(r => r.unix_ts));
      }

      return rows.map(r => ({
        source: 'sms',
        content: `SMS from ${r.sender} (${r.chat}): ${r.text}`,
        metadata: { messageId: String(r.message_id), sender: r.sender, chat: r.chat },
      }));
    } catch (err) {
      console.warn('[imessage] Poll failed:', (err as Error).message);
      return [];
    }
  }

  return {
    async start(emit: (event: ReceiverEvent) => void): Promise<void> {
      console.log('[imessage] Receiver started (5min poll)');
      timer = setInterval(() => {
        const events = poll();
        for (const event of events) emit(event);
      }, 300_000); // 5 min
      // Initial poll
      const events = poll();
      for (const event of events) emit(event);
    },
    async stop(): Promise<void> {
      if (timer) { clearInterval(timer); timer = null; }
      console.log('[imessage] Receiver stopped');
    },
  };
}
