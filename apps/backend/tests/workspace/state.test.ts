import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseStateMd, clearWaitingFor, setWaitingType } from '../../src/workspace/state.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('parseStateMd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses status, title, and objective from state.md', () => {
    const stateMd = `# Factures Sopra\n\nSTATUT : EN COURS\n\n## Objectif\nGénérer et envoyer les factures\n\n## Journal\n- 2026-03-14 : Créé`;
    fs.writeFileSync(path.join(tmpDir, 'state.md'), stateMd);
    const result = parseStateMd(tmpDir);
    expect(result.title).toBe('Factures Sopra');
    expect(result.status).toBe('EN COURS');
    expect(result.objective).toBe('Générer et envoyer les factures');
  });

  it('handles empty state.md gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'state.md'), '');
    const result = parseStateMd(tmpDir);
    expect(result.title).toBe('');
    expect(result.status).toBe('EN COURS');
  });

  it('handles unknown status as EN COURS', () => {
    fs.writeFileSync(path.join(tmpDir, 'state.md'), '# Test\n\nSTATUT : INCONNU');
    const result = parseStateMd(tmpDir);
    expect(result.status).toBe('EN COURS');
  });

  it('parses confirm mode from state.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'state.md'), '# Test\n\nSTATUT : EN COURS\nMODE : CONFIRM\n\n## Objectif\nTest');
    const result = parseStateMd(tmpDir);
    expect(result.confirm).toBe(true);
  });

  it('parses waitingFor from ## En attente section', () => {
    const stateContent = '# Factures\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nEmail envoyé à contact@example.com le 2026-03-15.\nRelancer si pas de réponse avant le 2026-03-22.\n\n## Journal\n- 2026-03-15 : Email envoyé\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), stateContent);
    const result = parseStateMd(tmpDir);
    expect(result.waitingFor).toContain('contact@example.com');
    expect(result.waitingFor).toContain('2026-03-22');
  });

  it('returns undefined waitingFor when no ## En attente section', () => {
    fs.writeFileSync(path.join(tmpDir, 'state.md'), '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## Journal\n- 2026-03-15 : Créé\n');
    const result = parseStateMd(tmpDir);
    expect(result.waitingFor).toBeUndefined();
  });

  it('returns waitingType tiers when ATTENTE: TIERS is present', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nATTENTE: TIERS\nEmail envoye a contact@example.com\n\n## Journal\n- 2026-03-15 : Email envoye\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    const result = parseStateMd(tmpDir);
    expect(result.waitingType).toBe('tiers');
  });

  it('returns waitingType user when ATTENTE: USER is present', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nATTENTE: USER\nNeed info from user\n\n## Journal\n- 2026-03-15 : Cree\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    const result = parseStateMd(tmpDir);
    expect(result.waitingType).toBe('user');
  });

  it('defaults waitingType to user when ## En attente has no tag', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nJuste du texte sans tag\n\n## Journal\n- 2026-03-15 : Cree\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    const result = parseStateMd(tmpDir);
    expect(result.waitingType).toBe('user');
  });

  it('returns waitingType null when no ## En attente section', () => {
    fs.writeFileSync(path.join(tmpDir, 'state.md'), '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## Journal\n- 2026-03-15 : Cree\n');
    const result = parseStateMd(tmpDir);
    expect(result.waitingType).toBeNull();
  });

  it('parses ATTENTE: TIERS case-insensitively', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nattente: tiers\nTexte\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    const result = parseStateMd(tmpDir);
    expect(result.waitingType).toBe('tiers');
  });

  it('parses journal entries from state.md', () => {
    const stateContent = '# test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## Journal\n- 2026-03-10 : Cree\n- 2026-03-11 : Envoye email\n- 2026-03-12 : Recu reponse\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), stateContent);
    const result = parseStateMd(tmpDir);
    expect(result.journal).toHaveLength(3);
    expect(result.journal[0]).toEqual({ date: '2026-03-10', text: 'Cree' });
    expect(result.journal[2]).toEqual({ date: '2026-03-12', text: 'Recu reponse' });
  });
});

describe('clearWaitingFor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes ## En attente section from state.md', () => {
    const content = '# Factures\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nEmail envoyé à contact@example.com\n\n## Journal\n- 2026-03-15 : Email envoyé\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    clearWaitingFor(tmpDir);
    const result = fs.readFileSync(path.join(tmpDir, 'state.md'), 'utf-8');
    expect(result).not.toContain('## En attente');
    expect(result).not.toContain('contact@example.com');
    expect(result).toContain('## Journal');
    expect(result).toContain('## Objectif');
  });

  it('does nothing when no ## En attente section', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Journal\n- 2026-03-15 : Créé\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    clearWaitingFor(tmpDir);
    const result = fs.readFileSync(path.join(tmpDir, 'state.md'), 'utf-8');
    expect(result).toBe(content);
  });

  it('does nothing when state.md does not exist', () => {
    expect(() => clearWaitingFor(tmpDir)).not.toThrow();
  });
});

describe('setWaitingType', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('replaces existing ATTENTE tag in ## En attente section', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nATTENTE: USER\nBesoin info\n\n## Journal\n- 2026-03-15 : Cree\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    setWaitingType(tmpDir, 'tiers');
    const result = fs.readFileSync(path.join(tmpDir, 'state.md'), 'utf-8');
    expect(result).toContain('ATTENTE: TIERS');
    expect(result).not.toContain('ATTENTE: USER');
    expect(result).toContain('Besoin info');
  });

  it('inserts tag when ## En attente has no tag', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## En attente\nJuste du texte\n\n## Journal\n- 2026-03-15 : Cree\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    setWaitingType(tmpDir, 'tiers');
    const result = fs.readFileSync(path.join(tmpDir, 'state.md'), 'utf-8');
    expect(result).toContain('ATTENTE: TIERS');
    expect(result).toContain('Juste du texte');
  });

  it('creates ## En attente section when none exists', () => {
    const content = '# Test\n\nSTATUT : EN COURS\n\n## Objectif\nTest\n\n## Journal\n- 2026-03-15 : Cree\n';
    fs.writeFileSync(path.join(tmpDir, 'state.md'), content);
    setWaitingType(tmpDir, 'user');
    const result = fs.readFileSync(path.join(tmpDir, 'state.md'), 'utf-8');
    expect(result).toContain('## En attente\nATTENTE: USER');
  });

  it('does nothing when state.md does not exist', () => {
    expect(() => setWaitingType(tmpDir, 'tiers')).not.toThrow();
  });
});

