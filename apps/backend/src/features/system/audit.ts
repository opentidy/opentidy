// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';

interface AuditLogInput {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: 'ALLOW' | 'DENY' | 'ASK';
  result?: string;
}

interface AuditEntry extends AuditLogInput {
  timestamp: string;
}

export function createAuditLogger(auditDir: string) {
  const logFile = path.join(auditDir, 'actions.log');
  fs.mkdirSync(auditDir, { recursive: true });

  function log(input: AuditLogInput): void {
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