// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach } from 'vitest';
import { createAuditLogger } from './audit.js';
import { useTmpDir } from '../../shared/test-helpers/tmpdir.js';

describe('AuditLogger', () => {
  const tmp = useTmpDir('opentidy-audit-');
  let audit: ReturnType<typeof createAuditLogger>;

  beforeEach(() => {
    audit = createAuditLogger(tmp.path);
  });

  it('logs an action with all required fields', () => {
    audit.log({
      sessionId: 'session-1',
      toolName: 'mcp__email__send',
      toolInput: { to: 'billing@example-client.com', subject: 'Facture' },
      decision: 'ALLOW',
    });

    const entries = audit.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe('session-1');
    expect(entries[0].toolName).toBe('mcp__email__send');
    expect(entries[0].decision).toBe('ALLOW');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('appends multiple entries', () => {
    audit.log({ sessionId: 's1', toolName: 'email.send', toolInput: {}, decision: 'ALLOW' });
    audit.log({ sessionId: 's2', toolName: 'email.send', toolInput: {}, decision: 'DENY' });
    expect(audit.read()).toHaveLength(2);
  });
});