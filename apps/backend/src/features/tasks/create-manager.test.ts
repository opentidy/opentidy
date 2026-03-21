// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTaskManager } from './create-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('TaskManager', () => {
  let wsDir: string;
  let mgr: ReturnType<typeof createTaskManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    mgr = createTaskManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('creates a task with state.md and correct structure', () => {
    mgr.createTask('invoices-acme', 'Generate invoices for Acme');
    expect(fs.existsSync(path.join(wsDir, 'invoices-acme', 'state.md'))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, 'invoices-acme', 'artifacts'))).toBe(true);
    const content = fs.readFileSync(path.join(wsDir, 'invoices-acme', 'state.md'), 'utf-8');
    expect(content).toContain('STATUS : IN_PROGRESS');
    expect(content).toContain('Generate invoices for Acme');
  });

  it('creates task from suggestion, removes suggestion file', () => {
    const suggFile = path.join(wsDir, '_suggestions', 'tax-filing.md');
    fs.writeFileSync(suggFile, '# Tax Filing\nURGENCE: urgent\n');
    mgr.createTaskFromSuggestion('tax-filing');
    expect(fs.existsSync(path.join(wsDir, 'tax-filing', 'state.md'))).toBe(true);
    expect(fs.existsSync(suggFile)).toBe(false);
  });

  it('completes a task by setting status to COMPLETED', () => {
    mgr.createTask('done-test', 'Test completion');
    mgr.completeTask('done-test');
    const content = fs.readFileSync(path.join(wsDir, 'done-test', 'state.md'), 'utf-8');
    expect(content).toContain('STATUS : COMPLETED');
  });

  it('saves artifact file in task', () => {
    mgr.createTask('artifacts-test', 'Test');
    mgr.saveArtifact('artifacts-test', 'facture.pdf', Buffer.from('pdf-content'));
    expect(fs.existsSync(path.join(wsDir, 'artifacts-test', 'artifacts', 'facture.pdf'))).toBe(true);
  });

  it('prevents creating task with existing name', () => {
    mgr.createTask('duplicate', 'First');
    expect(() => mgr.createTask('duplicate', 'Second')).toThrow();
  });

  it('handles task with same name as suggestion', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'same-name.md'), '# Same');
    mgr.createTask('same-name', 'Task');
    expect(fs.existsSync(path.join(wsDir, 'same-name', 'state.md'))).toBe(true);
  });

});