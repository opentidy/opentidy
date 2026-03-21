// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { parseStateMd, clearWaitingFor, setWaitingType } from './state.js';
import fs from 'fs';
import path from 'path';
import { useTmpDir } from '../../shared/test-helpers/tmpdir.js';

describe('parseStateMd', () => {
  const tmp = useTmpDir('opentidy-ws-');

  it('parses status, title, and objective from state.md', () => {
    const stateMd = `# Invoices Acme\n\nSTATUS : IN_PROGRESS\n\n## Objective\nGenerate and send invoices\n\n## Log\n- 2026-03-14 : Created`;
    fs.writeFileSync(path.join(tmp.path, 'state.md'), stateMd);
    const result = parseStateMd(tmp.path);
    expect(result.title).toBe('Invoices Acme');
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.objective).toBe('Generate and send invoices');
  });

  it('handles empty state.md gracefully', () => {
    fs.writeFileSync(path.join(tmp.path, 'state.md'), '');
    const result = parseStateMd(tmp.path);
    expect(result.title).toBe('');
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('handles unknown status as IN_PROGRESS', () => {
    fs.writeFileSync(path.join(tmp.path, 'state.md'), '# Test\n\nSTATUT : INCONNU');
    const result = parseStateMd(tmp.path);
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('parses waitingFor from ## Waiting section', () => {
    const stateContent = '# Factures\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Waiting\nEmail sent to contact@example.com on 2026-03-15.\nFollow up if no response by 2026-03-22.\n\n## Log\n- 2026-03-15 : Email sent\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), stateContent);
    const result = parseStateMd(tmp.path);
    expect(result.waitingFor).toContain('contact@example.com');
    expect(result.waitingFor).toContain('2026-03-22');
  });

  it('returns undefined waitingFor when no ## Waiting section', () => {
    fs.writeFileSync(path.join(tmp.path, 'state.md'), '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Log\n- 2026-03-15 : Created\n');
    const result = parseStateMd(tmp.path);
    expect(result.waitingFor).toBeUndefined();
  });

  it('returns waitingType tiers when ATTENTE: TIERS is present', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Waiting\nATTENTE: TIERS\nEmail sent to contact@example.com\n\n## Log\n- 2026-03-15 : Email sent\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    const result = parseStateMd(tmp.path);
    expect(result.waitingType).toBe('tiers');
  });

  it('returns waitingType user when ATTENTE: USER is present', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Waiting\nATTENTE: USER\nNeed info from user\n\n## Log\n- 2026-03-15 : Created\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    const result = parseStateMd(tmp.path);
    expect(result.waitingType).toBe('user');
  });

  it('defaults waitingType to user when ## Waiting has no tag', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Waiting\nJust text without a tag\n\n## Log\n- 2026-03-15 : Created\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    const result = parseStateMd(tmp.path);
    expect(result.waitingType).toBe('user');
  });

  it('returns waitingType null when no ## Waiting section', () => {
    fs.writeFileSync(path.join(tmp.path, 'state.md'), '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Log\n- 2026-03-15 : Created\n');
    const result = parseStateMd(tmp.path);
    expect(result.waitingType).toBeNull();
  });

  it('parses ATTENTE: TIERS case-insensitively', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## En attente\nattente: tiers\nTexte\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    const result = parseStateMd(tmp.path);
    expect(result.waitingType).toBe('tiers');
  });

  it('parses journal entries from state.md', () => {
    const stateContent = '# test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Log\n- 2026-03-10 : Created\n- 2026-03-11 : Sent email\n- 2026-03-12 : Received response\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), stateContent);
    const result = parseStateMd(tmp.path);
    expect(result.journal).toHaveLength(3);
    expect(result.journal[0]).toEqual({ date: '2026-03-10', text: 'Created' });
    expect(result.journal[2]).toEqual({ date: '2026-03-12', text: 'Received response' });
  });
});

describe('clearWaitingFor', () => {
  const tmp = useTmpDir('opentidy-ws-');

  it('removes ## Waiting section from state.md', () => {
    const content = '# Factures\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Waiting\nEmail sent to contact@example.com\n\n## Log\n- 2026-03-15 : Email sent\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    clearWaitingFor(tmp.path);
    const result = fs.readFileSync(path.join(tmp.path, 'state.md'), 'utf-8');
    expect(result).not.toContain('## Waiting');
    expect(result).not.toContain('contact@example.com');
    expect(result).toContain('## Log');
    expect(result).toContain('## Objective');
  });

  it('does nothing when no ## Waiting section', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Log\n- 2026-03-15 : Created\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    clearWaitingFor(tmp.path);
    const result = fs.readFileSync(path.join(tmp.path, 'state.md'), 'utf-8');
    expect(result).toBe(content);
  });

  it('does nothing when state.md does not exist', () => {
    expect(() => clearWaitingFor(tmp.path)).not.toThrow();
  });
});

describe('setWaitingType', () => {
  const tmp = useTmpDir('opentidy-ws-');

  it('replaces existing ATTENTE tag in ## Waiting section', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Waiting\nATTENTE: USER\nNeed info\n\n## Log\n- 2026-03-15 : Created\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    setWaitingType(tmp.path, 'tiers');
    const result = fs.readFileSync(path.join(tmp.path, 'state.md'), 'utf-8');
    expect(result).toContain('ATTENTE: TIERS');
    expect(result).not.toContain('ATTENTE: USER');
    expect(result).toContain('Need info');
  });

  it('inserts tag when ## Waiting has no tag', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Waiting\nJust some text\n\n## Log\n- 2026-03-15 : Created\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    setWaitingType(tmp.path, 'tiers');
    const result = fs.readFileSync(path.join(tmp.path, 'state.md'), 'utf-8');
    expect(result).toContain('ATTENTE: TIERS');
    expect(result).toContain('Just some text');
  });

  it('creates ## Waiting section when none exists', () => {
    const content = '# Test\n\nSTATUS : IN_PROGRESS\n\n## Objective\nTest\n\n## Log\n- 2026-03-15 : Created\n';
    fs.writeFileSync(path.join(tmp.path, 'state.md'), content);
    setWaitingType(tmp.path, 'user');
    const result = fs.readFileSync(path.join(tmp.path, 'state.md'), 'utf-8');
    expect(result).toContain('## Waiting\nATTENTE: USER');
  });

  it('does nothing when state.md does not exist', () => {
    expect(() => setWaitingType(tmp.path, 'tiers')).not.toThrow();
  });
});