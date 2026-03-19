// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { generateDossierInstructions } from './instruction-file.js';

vi.mock('fs');

describe('generateDossierInstructions', () => {
  beforeEach(() => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
  });

  it('writes INSTRUCTIONS.md and native agent file', () => {
    generateDossierInstructions({
      workspaceDir: '/workspace',
      dossierId: 'test-dossier',
      dossierInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'CLAUDE.md',
    });

    // INSTRUCTIONS.md (source of truth)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-dossier/INSTRUCTIONS.md',
      expect.stringContaining('# Dossier: Test'),
    );
    // Native copy
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-dossier/CLAUDE.md',
      expect.stringContaining('# Dossier: Test'),
    );
  });

  it('writes GEMINI.md when instructionFile is GEMINI.md', () => {
    generateDossierInstructions({
      workspaceDir: '/workspace',
      dossierId: 'test-dossier',
      dossierInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'GEMINI.md',
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-dossier/GEMINI.md',
      expect.any(String),
    );
  });

  it('cleans up stale instruction files from other agents', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('CLAUDE.md'));

    generateDossierInstructions({
      workspaceDir: '/workspace',
      dossierId: 'test-dossier',
      dossierInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'GEMINI.md',
    });

    expect(fs.unlinkSync).toHaveBeenCalledWith('/workspace/test-dossier/CLAUDE.md');
  });

  it('includes confirm mode instructions', () => {
    generateDossierInstructions({
      workspaceDir: '/workspace',
      dossierId: 'test-dossier',
      dossierInfo: { title: 'Test', objective: 'Do stuff', confirm: true },
      instructionFile: 'CLAUDE.md',
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-dossier/INSTRUCTIONS.md',
      expect.stringContaining('Confirm Mode'),
    );
  });

  it('includes trigger event', () => {
    generateDossierInstructions({
      workspaceDir: '/workspace',
      dossierId: 'test-dossier',
      dossierInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'CLAUDE.md',
      event: { source: 'gmail', content: 'New email received' },
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-dossier/INSTRUCTIONS.md',
      expect.stringContaining('Source: gmail'),
    );
  });
});
