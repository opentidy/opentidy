import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGapsManager } from '../../src/workspace/gaps.js';
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
      '## 2026-03-14 — Accès SFTP manquant\n\n**Problème:** Pas de credentials\n**Impact:** Bloque factures\n**Suggestion:** Demander à IT\n**Dossier:** factures-sopra\n\n---\n',
    );
    const list = gaps.listGaps();
    expect(list).toHaveLength(1);
    expect(list[0].title).toContain('Accès SFTP');
    expect(list[0].dossierId).toBe('factures-sopra');
  });

  it('marks a gap as resolved', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Test Gap\n\n**Problème:** X\n**Impact:** Y\n**Suggestion:** Z\n\n---\n',
    );
    gaps.markResolved(0);
    const list = gaps.listGaps();
    expect(list[0].resolved).toBe(true);
  });

  it('detects duplicate gap', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — SFTP\n\n**Problème:** Pas accès\n**Impact:** Bloque\n**Suggestion:** Demander\n\n---\n',
    );
    expect(gaps.isDuplicateGap('SFTP')).toBe(true);
    expect(gaps.isDuplicateGap('Autre chose')).toBe(false);
  });
});
