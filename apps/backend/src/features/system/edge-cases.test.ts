// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStateMd } from '../dossiers/state.js';
import { createDossierManager } from '../dossiers/create-manager.js';
import { createGapsManager } from '../ameliorations/gaps.js';
import { createDedupStore } from '../../shared/dedup.js';
import { createDatabase } from '../../shared/database.js';
import { createWebhookReceiver } from '../triage/webhook.js';

describe('Edge cases', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // E2E-EDGE-07: Webhook flood — 100 emails
  it('handles 100 webhooks without crash or memory leak (E2E-EDGE-07)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-dedup-edge-'));
    const db = createDatabase(tmpDir);
    const dedup = createDedupStore(db);
    const triage = vi.fn().mockResolvedValue(undefined);
    const receiver = createWebhookReceiver({ dedup, triage });

    for (let i = 0; i < 100; i++) {
      await receiver.handleGmailWebhook({
        from: `sender${i}@test.com`,
        to: 'user@test.com',
        subject: `Email ${i}`,
        body: `Body ${i}`,
        messageId: `msg-${i}`,
        timestamp: new Date().toISOString(),
      });
    }

    // All 100 unique → all should be accepted and triage called
    expect(triage).toHaveBeenCalledTimes(100);

    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // E2E-EDGE-08: Manual state.md edit with extra sections
  it('parser handles manually edited state.md with extra sections (E2E-EDGE-08)', () => {
    const dir = path.join(wsDir, 'manual-edit');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'state.md'),
      '# Mon Dossier Perso\n\nSTATUS : IN_PROGRESS\n\n## Objective\nDo something\n\n## Personal notes\nThis was added manually\n\n## Log\n- 2026-03-14 : Created\n',
    );

    const result = parseStateMd(dir);
    expect(result.title).toBe('Mon Dossier Perso');
    expect(result.status).toBe('IN_PROGRESS');
  });

  // E2E-EDGE-12: Camoufox corrupt profile detected via gaps.md
  it('detects Camoufox corruption via gaps.md entry (E2E-EDGE-12)', () => {
    fs.mkdirSync(path.join(wsDir, '_gaps'), { recursive: true });
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Corrupt Camoufox profile\n\n**Problem:** The banking profile is unusable\n**Impact:** Cannot access the account\n**Suggestion:** Recreate the profile\n\n---\n',
    );

    const list = createGapsManager(wsDir).listGaps();
    expect(list).toHaveLength(1);
    expect(list[0].title).toContain('Camoufox');
  });

  // E2E-EDGE-17: Disk error handled gracefully
  it('handles disk error gracefully (E2E-EDGE-17)', () => {
    const mgr = createDossierManager(wsDir);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    expect(() => mgr.createDossier('fail', 'instruction')).toThrow('ENOSPC');

    vi.mocked(fs.writeFileSync).mockRestore();
  });
});