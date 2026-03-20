// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createJobManager } from './create-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('JobManager', () => {
  let wsDir: string;
  let mgr: ReturnType<typeof createJobManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    mgr = createJobManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('creates a job with state.md and correct structure', () => {
    mgr.createJob('invoices-acme', 'Generate invoices for Acme');
    expect(fs.existsSync(path.join(wsDir, 'invoices-acme', 'state.md'))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, 'invoices-acme', 'artifacts'))).toBe(true);
    const content = fs.readFileSync(path.join(wsDir, 'invoices-acme', 'state.md'), 'utf-8');
    expect(content).toContain('STATUS : IN_PROGRESS');
    expect(content).toContain('Generate invoices for Acme');
  });

  it('creates job from suggestion, removes suggestion file', () => {
    const suggFile = path.join(wsDir, '_suggestions', 'tax-filing.md');
    fs.writeFileSync(suggFile, '# Tax Filing\nURGENCE: urgent\n');
    mgr.createJobFromSuggestion('tax-filing');
    expect(fs.existsSync(path.join(wsDir, 'tax-filing', 'state.md'))).toBe(true);
    expect(fs.existsSync(suggFile)).toBe(false);
  });

  it('completes a job by setting status to COMPLETED', () => {
    mgr.createJob('done-test', 'Test completion');
    mgr.completeJob('done-test');
    const content = fs.readFileSync(path.join(wsDir, 'done-test', 'state.md'), 'utf-8');
    expect(content).toContain('STATUS : COMPLETED');
  });

  it('saves artifact file in job', () => {
    mgr.createJob('artifacts-test', 'Test');
    mgr.saveArtifact('artifacts-test', 'facture.pdf', Buffer.from('pdf-content'));
    expect(fs.existsSync(path.join(wsDir, 'artifacts-test', 'artifacts', 'facture.pdf'))).toBe(true);
  });

  it('prevents creating job with existing name', () => {
    mgr.createJob('duplicate', 'First');
    expect(() => mgr.createJob('duplicate', 'Second')).toThrow();
  });

  it('handles job with same name as suggestion', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'same-name.md'), '# Same');
    mgr.createJob('same-name', 'Job');
    expect(fs.existsSync(path.join(wsDir, 'same-name', 'state.md'))).toBe(true);
  });

  it('creates job with confirm metadata', () => {
    mgr.createJob('test-confirm', 'instruction', true);
    const stateContent = fs.readFileSync(path.join(wsDir, 'test-confirm', 'state.md'), 'utf-8');
    expect(stateContent).toContain('MODE : CONFIRM');
  });
});