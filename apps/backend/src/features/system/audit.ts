// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';

interface AuditLogInput {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: 'ALLOW' | 'DENY' | 'BLOCK';
  result?: string;
}

interface AuditEntry extends AuditLogInput {
  timestamp: string;
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB

export function createAuditLogger(auditDir: string) {
  const logFile = path.join(auditDir, 'actions.log');
  const backupFile = path.join(auditDir, 'actions.log.1');
  fs.mkdirSync(auditDir, { recursive: true });

  function rotateIfNeeded(): void {
    try {
      const stats = fs.statSync(logFile);
      if (stats.size >= MAX_LOG_SIZE) {
        fs.renameSync(logFile, backupFile);
        console.log(`[audit] rotated log file (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      }
    } catch {
      // File doesn't exist yet, nothing to rotate
    }
  }

  function log(input: AuditLogInput): void {
    rotateIfNeeded();
    const entry: AuditEntry = {
      ...input,
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  }

  function read(): AuditEntry[] {
    if (!fs.existsSync(logFile)) return [];
    return fs.readFileSync(logFile, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }

  return { log, read };
}