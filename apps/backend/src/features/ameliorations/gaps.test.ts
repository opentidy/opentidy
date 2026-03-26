// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGapsManager } from './gaps.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('GapsManager', () => {
  let wsDir: string;
  let gaps: ReturnType<typeof createGapsManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    fs.mkdirSync(path.join(wsDir, '_gaps'), { recursive: true });
    gaps = createGapsManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('parses gaps.md into structured entries', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Accès SFTP manquant\n\n**Problème:** Pas de credentials\n**Impact:** Bloque factures\n**Suggestion:** Demander à IT\n**Task:** invoices-acme\n\n---\n',
    );
    const list = gaps.listGaps();
    expect(list).toHaveLength(1);
    expect(list[0].title).toContain('Accès SFTP');
    expect(list[0].taskId).toBe('invoices-acme');
  });

  it('marks a gap as resolved', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Test Gap\n\n**Problème:** X\n**Impact:** Y\n**Suggestion:** Z\n\n---\n',
    );
    gaps.markResolved(0);
    const list = gaps.listGaps();
    expect(list[0].resolved).toBe(true);
  });

  it('detects duplicate gap', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : SFTP\n\n**Problème:** Pas accès\n**Impact:** Bloque\n**Suggestion:** Demander\n\n---\n',
    );
    expect(gaps.isDuplicateGap('SFTP')).toBe(true);
    expect(gaps.isDuplicateGap('Autre chose')).toBe(false);
  });

  it('parses fixType and sanitized fields from structured format', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : MFA TOTP limitation\n\n**Problème:** Cannot login with MFA\n**Impact:** Blocks automation\n**Suggestion:** Add TOTP support\n**Catégorie:** capability\n**Fix type:** code\n**Sanitized title:** MFA TOTP authentication not supported\n**Sanitized:** Cannot authenticate on portals requiring MFA TOTP.\n**GitHub Issue:** #42\n**Task:** insurance-report\n\n---\n',
    );
    const list = gaps.listGaps();
    expect(list).toHaveLength(1);
    expect(list[0].fixType).toBe('code');
    expect(list[0].sanitizedTitle).toBe('MFA TOTP authentication not supported');
    expect(list[0].sanitizedBody).toBe('Cannot authenticate on portals requiring MFA TOTP.');
    expect(list[0].githubIssueNumber).toBe(42);
  });

  it('parses config fixType with suggestion slug', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Hook misconfigured\n\n**Problème:** Hook blocks legit action\n**Impact:** Manual workaround needed\n**Catégorie:** config\n**Fix type:** config\n**Suggestion slug:** fix-hook-config-abc123\n\n---\n',
    );
    const list = gaps.listGaps();
    expect(list[0].fixType).toBe('config');
    expect(list[0].suggestionSlug).toBe('fix-hook-config-abc123');
    expect(list[0].githubIssueNumber).toBeUndefined();
  });

  it('handles gaps without new fields (backward compat)', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Old gap\n\n**Problème:** Something\n**Impact:** Something\n**Suggestion:** Something\n\n---\n',
    );
    const list = gaps.listGaps();
    expect(list[0].fixType).toBeUndefined();
    expect(list[0].sanitizedBody).toBeUndefined();
    expect(list[0].githubIssueNumber).toBeUndefined();
  });

  it('updates gap fields by index', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Test Gap\n\n**Problème:** X\n**Impact:** Y\n**Suggestion:** Z\n**Fix type:** code\n**Sanitized title:** Test Gap\n**Sanitized:** Test problem\n\n---\n',
    );
    gaps.updateGapFields(0, { githubIssueNumber: 42 });
    const list = gaps.listGaps();
    expect(list[0].githubIssueNumber).toBe(42);
  });

  it('updates gap with suggestion slug', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Config Gap\n\n**Problème:** X\n**Impact:** Y\n**Fix type:** config\n\n---\n',
    );
    gaps.updateGapFields(0, { suggestionSlug: 'fix-config-abc' });
    const list = gaps.listGaps();
    expect(list[0].suggestionSlug).toBe('fix-config-abc');
  });
});