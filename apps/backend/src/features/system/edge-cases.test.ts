// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStateMd } from '../tasks/state.js';
import { createTaskManager } from '../tasks/create-manager.js';
import { createGapsManager } from '../ameliorations/gaps.js';
describe('Edge cases', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // E2E-EDGE-08: Manual state.md edit with extra sections
  it('parser handles manually edited state.md with extra sections (E2E-EDGE-08)', () => {
    const dir = path.join(wsDir, 'manual-edit');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'state.md'),
      '# Mon Task Perso\n\nSTATUS : IN_PROGRESS\n\n## Objective\nDo something\n\n## Personal notes\nThis was added manually\n\n## Log\n- 2026-03-14 : Created\n',
    );

    const result = parseStateMd(dir);
    expect(result.title).toBe('Mon Task Perso');
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
    const mgr = createTaskManager(wsDir);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    expect(() => mgr.createTask('fail', 'instruction')).toThrow('ENOSPC');

    vi.mocked(fs.writeFileSync).mockRestore();
  });
});