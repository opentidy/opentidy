import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDossierManager } from '../../src/workspace/dossier.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('DossierManager', () => {
  let wsDir: string;
  let mgr: ReturnType<typeof createDossierManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    mgr = createDossierManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('creates a dossier with state.md and correct structure', () => {
    mgr.createDossier('factures-sopra', 'Générer les factures Sopra');
    expect(fs.existsSync(path.join(wsDir, 'factures-sopra', 'state.md'))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, 'factures-sopra', 'artifacts'))).toBe(true);
    const content = fs.readFileSync(path.join(wsDir, 'factures-sopra', 'state.md'), 'utf-8');
    expect(content).toContain('STATUT : EN COURS');
    expect(content).toContain('Générer les factures Sopra');
  });

  it('creates dossier from suggestion, removes suggestion file', () => {
    const suggFile = path.join(wsDir, '_suggestions', 'impots-chypre.md');
    fs.writeFileSync(suggFile, '# Impôts Chypre\nURGENCE: urgent\n');
    mgr.createDossierFromSuggestion('impots-chypre');
    expect(fs.existsSync(path.join(wsDir, 'impots-chypre', 'state.md'))).toBe(true);
    expect(fs.existsSync(suggFile)).toBe(false);
  });

  it('ignores a suggestion by deleting its file', () => {
    const suggFile = path.join(wsDir, '_suggestions', 'test-sugg.md');
    fs.writeFileSync(suggFile, '# Test');
    mgr.ignoreSuggestion('test-sugg');
    expect(fs.existsSync(suggFile)).toBe(false);
  });

  it('marks dossier as complete', () => {
    mgr.createDossier('done-test', 'Test completion');
    mgr.markDossierComplete('done-test');
    const content = fs.readFileSync(path.join(wsDir, 'done-test', 'state.md'), 'utf-8');
    expect(content).toContain('STATUT : TERMINÉ');
  });

  it('saves artifact file in dossier', () => {
    mgr.createDossier('artifacts-test', 'Test');
    mgr.saveArtifact('artifacts-test', 'facture.pdf', Buffer.from('pdf-content'));
    expect(fs.existsSync(path.join(wsDir, 'artifacts-test', 'artifacts', 'facture.pdf'))).toBe(true);
  });

  it('prevents creating dossier with existing name', () => {
    mgr.createDossier('duplicate', 'First');
    expect(() => mgr.createDossier('duplicate', 'Second')).toThrow();
  });

  it('handles dossier with same name as suggestion', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'same-name.md'), '# Same');
    mgr.createDossier('same-name', 'Dossier');
    expect(fs.existsSync(path.join(wsDir, 'same-name', 'state.md'))).toBe(true);
  });

  it('creates dossier with confirm metadata', () => {
    mgr.createDossier('test-confirm', 'instruction', true);
    const stateContent = fs.readFileSync(path.join(wsDir, 'test-confirm', 'state.md'), 'utf-8');
    expect(stateContent).toContain('MODE : CONFIRM');
  });
});
