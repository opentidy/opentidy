import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAuditLogger } from '../../src/infra/audit.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AuditLogger', () => {
  let auditDir: string;
  let audit: ReturnType<typeof createAuditLogger>;

  beforeEach(() => {
    auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-audit-'));
    audit = createAuditLogger(auditDir);
  });

  afterEach(() => {
    fs.rmSync(auditDir, { recursive: true, force: true });
  });

  it('logs an action with all required fields', () => {
    audit.log({
      sessionId: 'session-1',
      toolName: 'mcp__gmail__send',
      toolInput: { to: 'billing@sopra.com', subject: 'Facture' },
      decision: 'ALLOW',
    });

    const entries = audit.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe('session-1');
    expect(entries[0].toolName).toBe('mcp__gmail__send');
    expect(entries[0].decision).toBe('ALLOW');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('appends multiple entries', () => {
    audit.log({ sessionId: 's1', toolName: 'gmail.send', toolInput: {}, decision: 'ALLOW' });
    audit.log({ sessionId: 's2', toolName: 'gmail.send', toolInput: {}, decision: 'DENY' });
    expect(audit.read()).toHaveLength(2);
  });
});
